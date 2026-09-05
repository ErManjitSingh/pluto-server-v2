import Campaign from '../models/campaign.model.js';
import CampaignRecipient from '../models/campaignRecipient.model.js';
import Lead from '../models/lead.model.js';
import Maker from '../models/maker.model.js';
import MailAccount from '../models/mailAccount.model.js';
import WhatsappMessage from '../models/whatsappMessage.model.js';
import WhatsappMessageDemand from '../models/whatsappMessageDemand.model.js';
import { getIO } from '../socket/socket.js';
import { sendMailForMaker } from './smtpService.js';
import {
  emitCampaignUpdated,
  markEmailFailed,
  markEmailSent,
  markWhatsappFailed,
  markWhatsappSent,
} from './campaignStatus.service.js';
import {
  buildLeadVariables,
  htmlToPlainText,
  injectEmailTracking,
  isValidEmail,
  normalizePhone,
  normalizePhoneForStorage,
  publicBaseUrl,
  renderTemplateString,
  renderWhatsappComponents,
} from '../utils/campaign.util.js';

const GRAPH_API_VERSION = 'v21.0';

/**
 * The two WhatsApp Business lines already wired up in this server. Campaign sends
 * write into the very same message collections and socket rooms as
 * /api/whatsapp and /api/whatsapp-demand, so a campaign message appears inline in
 * the customer's existing chat thread.
 */
const WHATSAPP_LINE_CONFIG = {
  main: {
    key: 'main',
    label: 'PTW',
    model: WhatsappMessage,
    accessTokenEnv: 'WHATSAPP_ACCESS_TOKEN',
    phoneNumberIdEnv: 'WHATSAPP_PHONE_NUMBER_ID',
    wabaIdEnv: 'WHATSAPP_WABA_ID',
    newMessageEvent: 'whatsapp:message:new',
    rooms: {
      root: 'whatsapp',
      all: 'whatsapp:all',
      unassigned: 'whatsapp:unassigned',
      byPhone: (phone) => `whatsapp:by-phone:${phone}`,
      byAssigned: (id) => `whatsapp:by-assigned:${id}`,
    },
  },
  demand: {
    key: 'demand',
    label: 'Demand Setu',
    model: WhatsappMessageDemand,
    accessTokenEnv: 'WHATSAPP_ACCESS_TOKEN_DEMAND',
    phoneNumberIdEnv: 'WHATSAPP_PHONE_NUMBER_ID_DEMAND',
    wabaIdEnv: 'WHATSAPP_WABA_ID_DEMAND',
    newMessageEvent: 'whatsapp-demand:message:new',
    rooms: {
      root: 'whatsapp:demand',
      all: 'whatsapp:demand:all',
      unassigned: 'whatsapp:demand:unassigned',
      byPhone: (phone) => `whatsapp:demand:by-phone:${phone}`,
      byAssigned: (id) => `whatsapp:demand:by-assigned:${id}`,
    },
  },
};

export const getWhatsappLineConfig = (line) =>
  WHATSAPP_LINE_CONFIG[line] || WHATSAPP_LINE_CONFIG.main;

/** Campaigns stuck in `sending` after a server restart can be re-run once this much time passes. */
const STALE_SENDING_MS = 30 * 60 * 1000;

/** How many recipients to process between checks for a mid-run cancellation. */
const CANCEL_CHECK_EVERY = 20;

const sendConcurrency = () => {
  const raw = Number(process.env.CAMPAIGN_SEND_CONCURRENCY);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 20) : 3;
};

const sendDelayMs = () => {
  const raw = Number(process.env.CAMPAIGN_SEND_DELAY_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 200;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runWithConcurrency = async (items, limit, worker) => {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
      const delay = sendDelayMs();
      if (delay) await sleep(delay);
    }
  });
  await Promise.all(runners);
};

/* ------------------------------------------------------------------ *
 * Pre-flight configuration checks
 * ------------------------------------------------------------------ */

export const verifyWhatsappLine = (line) => {
  const config = getWhatsappLineConfig(line);
  const accessToken = process.env[config.accessTokenEnv];
  const phoneNumberId = process.env[config.phoneNumberIdEnv];
  if (!accessToken || !phoneNumberId) {
    return {
      ok: false,
      message: `WhatsApp "${config.key}" line is not configured. Set ${config.accessTokenEnv} and ${config.phoneNumberIdEnv} in .env`,
    };
  }
  return { ok: true, config, accessToken, phoneNumberId };
};

/**
 * Resolve the mailbox the campaign will send from, using the same rules as
 * smtpService.sendMailForMaker. Checked before a send starts so a misconfigured
 * mailbox fails the request instead of every single recipient.
 */
export const verifyEmailSender = async (userId) => {
  if (!userId) return { ok: false, message: 'No sender selected for the email channel' };
  const maker = await Maker.findById(userId).select('firstName lastName companyName');
  if (!maker) return { ok: false, message: 'Email sender (maker) not found' };
  if (!maker.companyName) {
    return { ok: false, message: 'Email sender has no companyName set. Contact admin.' };
  }
  const account =
    (await MailAccount.findOne({ isShared: true, isActive: true, companyName: maker.companyName })) ||
    (await MailAccount.findOne({ userId, isActive: true }));
  if (!account) {
    return {
      ok: false,
      message: `No mailbox configured for company "${maker.companyName}". Ask admin to connect it.`,
    };
  }
  return { ok: true, maker, emailAddress: account.emailAddress };
};

/* ------------------------------------------------------------------ *
 * WhatsApp
 * ------------------------------------------------------------------ */

const emitWhatsappMessage = (config, messagePayload) => {
  const io = getIO();
  if (!io || !messagePayload) return;
  const { rooms, newMessageEvent } = config;
  io.to(rooms.root).emit(newMessageEvent, messagePayload);
  io.to(rooms.all).emit(newMessageEvent, messagePayload);
  io.to(rooms.byPhone(messagePayload.phone)).emit(newMessageEvent, messagePayload);
  const assignedId = messagePayload.assignedTo?._id ?? messagePayload.assignedTo;
  if (assignedId) io.to(rooms.byAssigned(assignedId)).emit(newMessageEvent, messagePayload);
  else io.to(rooms.unassigned).emit(newMessageEvent, messagePayload);
};

/** Lead owner first, then whoever last replied on this thread, then the campaign creator. */
const resolveAssignee = async (lead, phone, MessageModel, fallbackUserId) => {
  if (lead?.assignedUserId) return lead.assignedUserId;

  const last10 = normalizePhone(phone);
  if (last10) {
    const latestOutgoing = await MessageModel.findOne({
      phone: { $regex: new RegExp(`${last10}$`) },
      direction: 'outgoing',
      assignedTo: { $ne: null },
    })
      .sort({ createdAt: -1 })
      .select('assignedTo')
      .lean();
    if (latestOutgoing?.assignedTo) return latestOutgoing.assignedTo;
  }
  return fallbackUserId || null;
};

const sendCampaignWhatsapp = async ({ campaign, recipient, lead, line }) => {
  const { ok, message, config, accessToken, phoneNumberId } = verifyWhatsappLine(line);
  if (!ok) return markWhatsappFailed(recipient._id, { message });

  const to = normalizePhoneForStorage(recipient.leadPhone || lead?.mobile);
  if (!to || to.length < 10) {
    return markWhatsappFailed(recipient._id, { message: 'Lead has no valid mobile number' });
  }

  const templateName = campaign.whatsapp?.templateName;
  if (!templateName) {
    return markWhatsappFailed(recipient._id, { message: 'Campaign has no WhatsApp template' });
  }

  const variables = buildLeadVariables(
    lead || { name: recipient.leadName, mobile: recipient.leadPhone }
  );
  const components = renderWhatsappComponents(campaign.whatsapp?.components, variables);

  const templatePayload = {
    name: String(templateName),
    language: { code: String(campaign.whatsapp?.language || 'en') },
  };
  if (components) templatePayload.components = components;

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'template',
          template: templatePayload,
        }),
      }
    );
    const data = await response.json();

    if (!response.ok) {
      return markWhatsappFailed(recipient._id, {
        message: data?.error?.message || 'Failed to send WhatsApp template',
        details: data?.error || data,
      });
    }

    const metaMessageId = data.messages?.[0]?.id || null;
    const assignedTo = await resolveAssignee(lead, to, config.model, campaign.createdBy);

    // Same shape the /send-template route writes, so the message renders in the
    // existing chat thread. campaignid is what ties it back to this campaign.
    const doc = await config.model.create({
      phone: to,
      message: `[Template: ${templateName}]`,
      direction: 'outgoing',
      assignedTo: assignedTo || null,
      metaMessageId,
      campaignid: String(campaign._id),
      status: 'sent',
    });

    const messagePayload = await config.model
      .findById(doc._id)
      .populate('assignedTo', 'name email')
      .lean();
    emitWhatsappMessage(config, messagePayload);

    return markWhatsappSent(recipient._id, { messageId: doc._id, metaMessageId });
  } catch (error) {
    return markWhatsappFailed(recipient._id, {
      message: error?.message || 'WhatsApp send error',
    });
  }
};

/* ------------------------------------------------------------------ *
 * Email
 * ------------------------------------------------------------------ */

const sendCampaignEmail = async ({ campaign, recipient, lead }) => {
  const to = String(recipient.leadEmail || lead?.email || '').trim();
  if (!isValidEmail(to)) {
    return markEmailFailed(recipient._id, { message: 'Lead has no valid email address' });
  }

  const senderId = campaign.email?.fromUserId || campaign.createdBy;
  if (!senderId) {
    return markEmailFailed(recipient._id, { message: 'Campaign has no email sender' });
  }

  const variables = buildLeadVariables(
    lead || { name: recipient.leadName, email: recipient.leadEmail, mobile: recipient.leadPhone }
  );
  const subject = renderTemplateString(campaign.email?.subject || '', variables);
  const renderedHtml = renderTemplateString(campaign.email?.html || '', variables);
  const renderedText =
    renderTemplateString(campaign.email?.text || '', variables) || htmlToPlainText(renderedHtml);

  const baseUrl = publicBaseUrl();
  const html = injectEmailTracking(renderedHtml, {
    token: recipient.trackingToken,
    baseUrl,
    trackOpens: campaign.email?.trackOpens !== false,
    trackClicks: campaign.email?.trackClicks !== false,
  });

  try {
    // Goes through the existing webmail pipeline, so an EmailActivity row is created
    // and the mail shows up in the lead's email history automatically.
    const result = await sendMailForMaker(senderId, {
      to,
      subject,
      html,
      text: renderedText,
      leadId: recipient.leadId,
    });

    const accepted = Array.isArray(result?.accepted) ? result.accepted : [];
    const rejected = Array.isArray(result?.rejected) ? result.rejected : [];
    const matches = (list) => list.some((a) => String(a).toLowerCase() === to.toLowerCase());

    if (rejected.length && matches(rejected)) {
      return markEmailFailed(recipient._id, {
        message: 'Recipient rejected by mail server',
        details: result?.response || null,
      });
    }

    return markEmailSent(recipient._id, {
      activityId: result?.activityId,
      messageId: result?.messageId,
      threadId: result?.threadId,
      delivered: matches(accepted),
    });
  } catch (error) {
    return markEmailFailed(recipient._id, {
      message: error?.message || 'Email send error',
      statusCode: error?.statusCode || null,
    });
  }
};

/* ------------------------------------------------------------------ *
 * Orchestration
 * ------------------------------------------------------------------ */

/**
 * Move the campaign into `sending`. Returns null when another run already owns it,
 * which is what stops a double-click from sending everything twice.
 */
export const claimCampaignForSending = async (campaignId) => {
  const staleBefore = new Date(Date.now() - STALE_SENDING_MS);
  return Campaign.findOneAndUpdate(
    {
      _id: campaignId,
      $or: [
        { status: { $in: ['draft', 'completed', 'failed'] } },
        { status: 'sending', startedAt: { $lt: staleBefore } },
      ],
    },
    { $set: { status: 'sending', startedAt: new Date(), completedAt: null, lastError: null } },
    { new: true }
  );
};

/**
 * Send a claimed campaign. Runs detached from the HTTP request (a few thousand
 * recipients would blow past the 58s proxy timeout), so it must never throw
 * out of its own promise — failures are recorded on the campaign document.
 */
export const runCampaign = async (campaignId, { onlyFailed = false } = {}) => {
  const campaign = await Campaign.findById(campaignId).lean();
  if (!campaign) return;

  const channels = Array.isArray(campaign.channels) ? campaign.channels : [];
  const whatsappEnabled = channels.includes('whatsapp');
  const emailEnabled = channels.includes('email');
  const retryStatuses = onlyFailed ? ['pending', 'failed'] : ['pending'];

  try {
    const orClauses = [];
    if (whatsappEnabled) {
      orClauses.push({ 'whatsapp.enabled': true, 'whatsapp.status': { $in: retryStatuses } });
    }
    if (emailEnabled) {
      orClauses.push({ 'email.enabled': true, 'email.status': { $in: retryStatuses } });
    }

    const recipients = orClauses.length
      ? await CampaignRecipient.find({ campaignId: campaign._id, $or: orClauses }).lean()
      : [];

    let cancelled = false;
    let sinceCancelCheck = 0;

    if (recipients.length) {
      const leads = await Lead.find({ _id: { $in: recipients.map((r) => r.leadId) } }).lean();
      const leadById = new Map(leads.map((lead) => [String(lead._id), lead]));
      const line = campaign.whatsapp?.line || 'main';

      await runWithConcurrency(recipients, sendConcurrency(), async (recipient) => {
        // Honour a cancel issued while the run is in flight, without a DB read per recipient.
        if (cancelled) return;
        if (++sinceCancelCheck >= CANCEL_CHECK_EVERY) {
          sinceCancelCheck = 0;
          const current = await Campaign.findById(campaign._id).select('status').lean();
          if (current?.status === 'cancelled') {
            cancelled = true;
            return;
          }
        }

        const lead = leadById.get(String(recipient.leadId)) || null;

        if (
          whatsappEnabled &&
          recipient.whatsapp?.enabled &&
          retryStatuses.includes(recipient.whatsapp.status)
        ) {
          await sendCampaignWhatsapp({ campaign, recipient, lead, line });
        }
        if (
          emailEnabled &&
          recipient.email?.enabled &&
          retryStatuses.includes(recipient.email.status)
        ) {
          await sendCampaignEmail({ campaign, recipient, lead });
        }
      });
    }

    const stillPending = await CampaignRecipient.countDocuments({
      campaignId: campaign._id,
      $or: [
        { 'whatsapp.enabled': true, 'whatsapp.status': 'pending' },
        { 'email.enabled': true, 'email.status': 'pending' },
      ],
    });

    const finished = await Campaign.findByIdAndUpdate(
      campaign._id,
      {
        $set: {
          status: cancelled ? 'cancelled' : 'completed',
          completedAt: new Date(),
          lastError: stillPending ? `${stillPending} recipient(s) were not sent` : null,
        },
      },
      { new: true }
    ).lean();
    emitCampaignUpdated(finished);
  } catch (error) {
    console.error('Campaign run failed:', error?.message || error);
    const failed = await Campaign.findByIdAndUpdate(
      campaignId,
      {
        $set: {
          status: 'failed',
          completedAt: new Date(),
          lastError: error?.message || 'Campaign run failed',
        },
      },
      { new: true }
    ).lean();
    emitCampaignUpdated(failed);
  }
};
