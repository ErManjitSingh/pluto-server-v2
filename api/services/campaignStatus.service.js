import CampaignRecipient from '../models/campaignRecipient.model.js';
import { getIO } from '../socket/socket.js';
import {
  EMAIL_STATUS_RANK,
  WHATSAPP_STATUS_RANK,
  isForwardStatus,
} from '../utils/campaign.util.js';

/**
 * Every campaign status write goes through this module so the "never move backwards"
 * rule is applied in one place. Nothing here throws: WhatsApp webhooks must always
 * answer 200 to Meta, and the tracking pixel must always return an image.
 */

const CAMPAIGN_ROOM = (campaignId) => `campaign:${campaignId}`;

const emitRecipientUpdated = (recipient) => {
  if (!recipient) return;
  const io = getIO();
  if (!io) return;
  const payload = {
    _id: recipient._id,
    campaignId: recipient.campaignId,
    leadId: recipient.leadId,
    leadName: recipient.leadName,
    leadEmail: recipient.leadEmail,
    leadPhone: recipient.leadPhone,
    whatsapp: recipient.whatsapp,
    email: recipient.email,
  };
  io.to(CAMPAIGN_ROOM(recipient.campaignId)).emit('campaign:recipient:updated', payload);
  io.to('campaigns').emit('campaign:recipient:updated', payload);
};

export const emitCampaignUpdated = (campaign) => {
  if (!campaign) return;
  const io = getIO();
  if (!io) return;
  const payload = {
    _id: campaign._id,
    name: campaign.name,
    status: campaign.status,
    totalLeads: campaign.totalLeads,
    startedAt: campaign.startedAt,
    completedAt: campaign.completedAt,
    lastError: campaign.lastError,
  };
  io.to(CAMPAIGN_ROOM(campaign._id)).emit('campaign:updated', payload);
  io.to('campaigns').emit('campaign:updated', payload);
};

/* ------------------------------------------------------------------ *
 * WhatsApp
 * ------------------------------------------------------------------ */

const WHATSAPP_TIMESTAMP_FIELD = {
  sent: 'whatsapp.sentAt',
  delivered: 'whatsapp.deliveredAt',
  read: 'whatsapp.readAt',
  failed: 'whatsapp.failedAt',
};

/**
 * Called from both WhatsApp webhook routes after the message document is updated.
 * Matches on the Meta wamid stored when the campaign message was sent; a wamid that
 * doesn't belong to a campaign simply matches nothing.
 */
export const applyWhatsappStatusToCampaign = async ({
  metaMessageId,
  status,
  timestamp,
  errors,
}) => {
  try {
    if (!metaMessageId || !status) return null;
    const recipient = await CampaignRecipient.findOne({
      'whatsapp.metaMessageId': String(metaMessageId),
    });
    if (!recipient) return null;
    if (!isForwardStatus(WHATSAPP_STATUS_RANK, recipient.whatsapp.status, status)) return null;

    const at = timestamp ? new Date(Number(timestamp) * 1000) : new Date();
    const eventAt = Number.isNaN(at.getTime()) ? new Date() : at;

    const update = { 'whatsapp.status': status };
    const field = WHATSAPP_TIMESTAMP_FIELD[status];
    if (field) update[field] = eventAt;
    if (status === 'failed') update['whatsapp.error'] = errors || null;

    const updated = await CampaignRecipient.findByIdAndUpdate(
      recipient._id,
      { $set: update },
      { new: true }
    ).lean();

    emitRecipientUpdated(updated);
    return updated;
  } catch (error) {
    console.error('Campaign WhatsApp status update failed:', error?.message || error);
    return null;
  }
};

export const markWhatsappSent = async (recipientId, { messageId, metaMessageId }) => {
  const updated = await CampaignRecipient.findByIdAndUpdate(
    recipientId,
    {
      $set: {
        'whatsapp.status': 'sent',
        'whatsapp.messageId': messageId || null,
        'whatsapp.metaMessageId': metaMessageId || null,
        'whatsapp.sentAt': new Date(),
        'whatsapp.error': null,
      },
      $inc: { 'whatsapp.attempts': 1 },
    },
    { new: true }
  ).lean();
  emitRecipientUpdated(updated);
  return updated;
};

export const markWhatsappFailed = async (recipientId, error) => {
  const updated = await CampaignRecipient.findByIdAndUpdate(
    recipientId,
    {
      $set: {
        'whatsapp.status': 'failed',
        'whatsapp.failedAt': new Date(),
        'whatsapp.error': error || null,
      },
      $inc: { 'whatsapp.attempts': 1 },
    },
    { new: true }
  ).lean();
  emitRecipientUpdated(updated);
  return updated;
};

/* ------------------------------------------------------------------ *
 * Email
 * ------------------------------------------------------------------ */

export const markEmailSent = async (
  recipientId,
  { activityId, messageId, threadId, delivered }
) => {
  const now = new Date();
  const update = {
    'email.status': delivered ? 'delivered' : 'sent',
    'email.activityId': activityId || null,
    'email.messageId': messageId || null,
    'email.threadId': threadId || null,
    'email.sentAt': now,
    'email.error': null,
  };
  // The SMTP relay accepting the recipient is the only delivery signal available
  // without an ESP webhook, so acceptance is recorded as "delivered".
  if (delivered) update['email.deliveredAt'] = now;

  const updated = await CampaignRecipient.findByIdAndUpdate(
    recipientId,
    { $set: update, $inc: { 'email.attempts': 1 } },
    { new: true }
  ).lean();
  emitRecipientUpdated(updated);
  return updated;
};

export const markEmailFailed = async (recipientId, error) => {
  const updated = await CampaignRecipient.findByIdAndUpdate(
    recipientId,
    {
      $set: {
        'email.status': 'failed',
        'email.failedAt': new Date(),
        'email.error': error || null,
      },
      $inc: { 'email.attempts': 1 },
    },
    { new: true }
  ).lean();
  emitRecipientUpdated(updated);
  return updated;
};

/** Open pixel hit. Repeat opens bump the counter but never downgrade a `clicked` status. */
export const recordEmailOpen = async (trackingToken) => {
  try {
    if (!trackingToken) return null;
    const recipient = await CampaignRecipient.findOne({ trackingToken });
    if (!recipient || !recipient.email?.enabled) return null;

    const update = { $inc: { 'email.openCount': 1 } };
    if (isForwardStatus(EMAIL_STATUS_RANK, recipient.email.status, 'opened')) {
      update.$set = { 'email.status': 'opened', 'email.openedAt': new Date() };
    } else if (!recipient.email.openedAt) {
      update.$set = { 'email.openedAt': new Date() };
    }

    const updated = await CampaignRecipient.findByIdAndUpdate(recipient._id, update, {
      new: true,
    }).lean();
    emitRecipientUpdated(updated);
    return updated;
  } catch (error) {
    console.error('Campaign email open tracking failed:', error?.message || error);
    return null;
  }
};

/** Click redirect hit. A click implies an open, so openedAt is backfilled. */
export const recordEmailClick = async (trackingToken, targetUrl) => {
  try {
    if (!trackingToken) return null;
    const recipient = await CampaignRecipient.findOne({ trackingToken });
    if (!recipient || !recipient.email?.enabled) return null;

    const now = new Date();
    const set = { 'email.lastClickedUrl': targetUrl || null };
    if (isForwardStatus(EMAIL_STATUS_RANK, recipient.email.status, 'clicked')) {
      set['email.status'] = 'clicked';
    }
    if (!recipient.email.clickedAt) set['email.clickedAt'] = now;
    if (!recipient.email.openedAt) set['email.openedAt'] = now;

    const updated = await CampaignRecipient.findByIdAndUpdate(
      recipient._id,
      { $set: set, $inc: { 'email.clickCount': 1 } },
      { new: true }
    ).lean();
    emitRecipientUpdated(updated);
    return updated;
  } catch (error) {
    console.error('Campaign email click tracking failed:', error?.message || error);
    return null;
  }
};
