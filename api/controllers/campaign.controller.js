import crypto from 'crypto';
import mongoose from 'mongoose';
import Campaign, { CAMPAIGN_CHANNELS } from '../models/campaign.model.js';
import CampaignRecipient from '../models/campaignRecipient.model.js';
import Lead from '../models/lead.model.js';
import { errorHandler } from '../utils/error.js';
import {
  buildCampaignStats,
  campaignStatsGroupStage,
  isValidEmail,
  normalizePhoneForStorage,
  publicBaseUrl,
  TRACKING_PIXEL,
} from '../utils/campaign.util.js';
import {
  claimCampaignForSending,
  getWhatsappLineConfig,
  runCampaign,
  verifyEmailSender,
  verifyWhatsappLine,
} from '../services/campaignSender.service.js';
import {
  emitCampaignUpdated,
  recordEmailClick,
  recordEmailOpen,
} from '../services/campaignStatus.service.js';

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

const isValidObjectId = (id) =>
  typeof id === 'string' && mongoose.Types.ObjectId.isValid(id) && String(toObjectId(id)) === id;

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parsePagination = (query, defaultLimit = 50, maxLimit = 200) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};

const paginationMeta = (page, limit, total) => ({
  currentPage: page,
  totalPages: Math.max(1, Math.ceil(total / limit)),
  total,
  hasNextPage: page * limit < total,
  hasPrevPage: page > 1,
  limit,
});

/** Stats for one or many campaigns, keyed by campaign id. */
const fetchStatsMap = async (campaignIds) => {
  if (!campaignIds.length) return new Map();
  const rows = await CampaignRecipient.aggregate([
    { $match: { campaignId: { $in: campaignIds.map(toObjectId) } } },
    campaignStatsGroupStage('$campaignId'),
  ]);
  return new Map(rows.map((row) => [String(row._id), buildCampaignStats(row)]));
};

const statsForCampaign = async (campaignId) => {
  const map = await fetchStatsMap([campaignId]);
  return map.get(String(campaignId)) || buildCampaignStats({});
};

/**
 * Shared validation for create/update. Only checks the channels that are actually
 * switched on, so a WhatsApp-only campaign doesn't need email content.
 */
const validateCampaignConfig = ({ name, channels, whatsapp, email }) => {
  if (!name || !String(name).trim()) return 'Campaign name is required';

  if (!Array.isArray(channels) || channels.length === 0) {
    return 'Select at least one channel: whatsapp and/or email';
  }
  const invalid = channels.filter((c) => !CAMPAIGN_CHANNELS.includes(c));
  if (invalid.length) return `Invalid channel(s): ${invalid.join(', ')}`;

  if (channels.includes('whatsapp')) {
    if (!whatsapp?.templateName) {
      return 'WhatsApp channel requires a templateName (an approved Meta template)';
    }
    if (whatsapp.line && !['main', 'demand'].includes(whatsapp.line)) {
      return 'whatsapp.line must be "main" or "demand"';
    }
    if (whatsapp.components != null && !Array.isArray(whatsapp.components)) {
      return 'whatsapp.components must be an array of Meta template components';
    }
  }

  if (channels.includes('email')) {
    if (!email?.subject || !String(email.subject).trim()) {
      return 'Email channel requires a subject';
    }
    if (!email?.html && !email?.text) {
      return 'Email channel requires html or text content';
    }
  }

  return null;
};

const buildCampaignConfig = (body, currentUserId) => ({
  name: String(body.name).trim(),
  description: body.description ? String(body.description) : '',
  channels: body.channels,
  publish: body.publish || null,
  whatsapp: body.channels.includes('whatsapp')
    ? {
        line: body.whatsapp?.line || (body.publish === 'demand' ? 'demand' : 'main'),
        templateName: body.whatsapp.templateName,
        language: body.whatsapp?.language || 'en',
        components: Array.isArray(body.whatsapp?.components) ? body.whatsapp.components : null,
        bodyPreview: body.whatsapp?.bodyPreview || '',
      }
    : {},
  email: body.channels.includes('email')
    ? {
        subject: body.email.subject,
        html: body.email.html || '',
        text: body.email.text || '',
        fromUserId: body.email?.fromUserId || currentUserId || null,
        trackOpens: body.email?.trackOpens !== false,
        trackClicks: body.email?.trackClicks !== false,
      }
    : {},
});

/**
 * Create recipient rows for the given leads. Idempotent — re-adding a lead that is
 * already in the campaign refreshes its snapshot without resetting its status.
 */
const upsertRecipients = async (campaign, leads) => {
  const whatsappEnabled = campaign.channels.includes('whatsapp');
  const emailEnabled = campaign.channels.includes('email');

  const operations = leads.map((lead) => ({
    updateOne: {
      filter: { campaignId: campaign._id, leadId: lead._id },
      update: {
        $set: {
          leadName: lead.name || '',
          leadEmail: lead.email || '',
          leadPhone: lead.mobile || '',
          'whatsapp.enabled': whatsappEnabled,
          'email.enabled': emailEnabled,
        },
        $setOnInsert: {
          campaignId: campaign._id,
          leadId: lead._id,
          trackingToken: crypto.randomBytes(16).toString('hex'),
          'whatsapp.status': 'pending',
          'whatsapp.attempts': 0,
          'email.status': 'pending',
          'email.openCount': 0,
          'email.clickCount': 0,
          'email.attempts': 0,
        },
      },
      upsert: true,
    },
  }));

  if (operations.length) await CampaignRecipient.bulkWrite(operations, { ordered: false });

  const totalLeads = await CampaignRecipient.countDocuments({ campaignId: campaign._id });
  await Campaign.findByIdAndUpdate(campaign._id, { $set: { totalLeads } });
  return totalLeads;
};

const loadEditableCampaign = async (id) => {
  if (!isValidObjectId(id)) throw errorHandler(400, 'Invalid campaign id');
  const campaign = await Campaign.findById(id);
  if (!campaign) throw errorHandler(404, 'Campaign not found');
  return campaign;
};

/* ------------------------------------------------------------------ *
 * Campaign CRUD
 * ------------------------------------------------------------------ */

/** POST /api/campaigns — create a draft, optionally with its leads in the same call. */
export const createCampaign = async (req, res, next) => {
  try {
    const validationError = validateCampaignConfig(req.body);
    if (validationError) return next(errorHandler(400, validationError));

    const config = buildCampaignConfig(req.body, req.user?.id);
    const campaign = await Campaign.create({ ...config, createdBy: req.user?.id || null });

    let totalLeads = 0;
    const { leadIds } = req.body;
    if (Array.isArray(leadIds) && leadIds.length) {
      const validIds = leadIds.filter(isValidObjectId);
      const leads = await Lead.find({ _id: { $in: validIds } })
        .select('name email mobile')
        .lean();
      totalLeads = await upsertRecipients(campaign, leads);
    }

    const created = await Campaign.findById(campaign._id).lean();
    emitCampaignUpdated(created);
    res.status(201).json({ success: true, campaign: created, totalLeads });
  } catch (error) {
    next(error);
  }
};

/** GET /api/campaigns — campaign history with stats, newest first. */
export const getCampaigns = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, 20);
    const { status, publish, channel, q, createdBy } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (publish) filter.publish = publish;
    if (channel) filter.channels = channel;
    if (createdBy && isValidObjectId(createdBy)) filter.createdBy = toObjectId(createdBy);
    if (q) filter.name = { $regex: escapeRegex(q), $options: 'i' };

    const [campaigns, total] = await Promise.all([
      Campaign.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('createdBy', 'firstName lastName email')
        .lean(),
      Campaign.countDocuments(filter),
    ]);

    const statsMap = await fetchStatsMap(campaigns.map((c) => c._id));

    res.status(200).json({
      success: true,
      campaigns: campaigns.map((campaign) => ({
        ...campaign,
        stats: statsMap.get(String(campaign._id)) || buildCampaignStats({}),
      })),
      pagination: paginationMeta(page, limit, total),
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/campaigns/:id — campaign details + overall performance. */
export const getCampaign = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) return next(errorHandler(400, 'Invalid campaign id'));
    const campaign = await Campaign.findById(req.params.id)
      .populate('createdBy', 'firstName lastName email')
      .populate('email.fromUserId', 'firstName lastName email')
      .lean();
    if (!campaign) return next(errorHandler(404, 'Campaign not found'));

    res.status(200).json({
      success: true,
      campaign,
      stats: await statsForCampaign(campaign._id),
    });
  } catch (error) {
    next(error);
  }
};

/** PUT /api/campaigns/:id — content and channels are locked once a campaign has been sent. */
export const updateCampaign = async (req, res, next) => {
  try {
    const campaign = await loadEditableCampaign(req.params.id);
    if (campaign.status === 'sending') {
      return next(errorHandler(409, 'Campaign is currently sending and cannot be edited'));
    }

    const alreadySent = campaign.status === 'completed' || campaign.status === 'failed';
    if (alreadySent) {
      // Only cosmetic fields can change after a send, so reports stay truthful.
      const { name, description } = req.body;
      if (name) campaign.name = String(name).trim();
      if (description !== undefined) campaign.description = String(description);
      await campaign.save();
      const updated = await Campaign.findById(campaign._id).lean();
      emitCampaignUpdated(updated);
      return res.status(200).json({ success: true, campaign: updated });
    }

    const merged = {
      name: req.body.name ?? campaign.name,
      description: req.body.description ?? campaign.description,
      channels: req.body.channels ?? campaign.channels,
      publish: req.body.publish ?? campaign.publish,
      whatsapp: req.body.whatsapp ?? campaign.whatsapp?.toObject?.() ?? campaign.whatsapp,
      email: req.body.email ?? campaign.email?.toObject?.() ?? campaign.email,
    };

    const validationError = validateCampaignConfig(merged);
    if (validationError) return next(errorHandler(400, validationError));

    const config = buildCampaignConfig(merged, campaign.createdBy || req.user?.id);
    Object.assign(campaign, config);
    await campaign.save();

    // Channel selection may have changed — keep recipient flags in sync.
    await CampaignRecipient.updateMany(
      { campaignId: campaign._id },
      {
        $set: {
          'whatsapp.enabled': campaign.channels.includes('whatsapp'),
          'email.enabled': campaign.channels.includes('email'),
        },
      }
    );

    const updated = await Campaign.findById(campaign._id).lean();
    emitCampaignUpdated(updated);
    res.status(200).json({ success: true, campaign: updated });
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/campaigns/:id — removes the campaign and its tracking rows (chat/email history is kept). */
export const deleteCampaign = async (req, res, next) => {
  try {
    const campaign = await loadEditableCampaign(req.params.id);
    if (campaign.status === 'sending') {
      return next(errorHandler(409, 'Campaign is currently sending and cannot be deleted'));
    }
    await CampaignRecipient.deleteMany({ campaignId: campaign._id });
    await Campaign.findByIdAndDelete(campaign._id);
    res.status(200).json({ success: true, message: 'Campaign deleted' });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ *
 * Lead selection
 * ------------------------------------------------------------------ */

/** POST /api/campaigns/:id/leads — body { leadIds: [] , replace?: boolean } */
export const addCampaignLeads = async (req, res, next) => {
  try {
    const campaign = await loadEditableCampaign(req.params.id);
    if (campaign.status === 'sending') {
      return next(errorHandler(409, 'Campaign is currently sending'));
    }

    const { leadIds, replace = false } = req.body;
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return next(errorHandler(400, 'leadIds must be a non-empty array'));
    }

    const validIds = leadIds.filter(isValidObjectId);
    if (!validIds.length) return next(errorHandler(400, 'No valid lead ids provided'));

    const leads = await Lead.find({ _id: { $in: validIds } })
      .select('name email mobile')
      .lean();
    if (!leads.length) return next(errorHandler(404, 'None of the given leads exist'));

    if (replace) {
      await CampaignRecipient.deleteMany({
        campaignId: campaign._id,
        leadId: { $nin: leads.map((l) => l._id) },
      });
    }

    const totalLeads = await upsertRecipients(campaign, leads);

    res.status(200).json({
      success: true,
      added: leads.length,
      skipped: validIds.length - leads.length,
      totalLeads,
    });
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/campaigns/:id/leads — body { leadIds: [] } */
export const removeCampaignLeads = async (req, res, next) => {
  try {
    const campaign = await loadEditableCampaign(req.params.id);
    if (campaign.status === 'sending') {
      return next(errorHandler(409, 'Campaign is currently sending'));
    }

    const { leadIds } = req.body;
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return next(errorHandler(400, 'leadIds must be a non-empty array'));
    }

    const result = await CampaignRecipient.deleteMany({
      campaignId: campaign._id,
      leadId: { $in: leadIds.filter(isValidObjectId).map(toObjectId) },
    });

    const totalLeads = await CampaignRecipient.countDocuments({ campaignId: campaign._id });
    await Campaign.findByIdAndUpdate(campaign._id, { $set: { totalLeads } });

    res.status(200).json({ success: true, removed: result.deletedCount || 0, totalLeads });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/campaigns/available-leads — lead picker for building a campaign.
 * Search across name/email/mobile plus flags showing which channels each lead can receive.
 */
export const getAvailableLeads = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, 50, 500);
    const { q, publish, leadStatus, assignedUserId, hasEmail, hasPhone, assignedOnly } = req.query;

    const filter = {};
    if (publish) filter.publish = publish;
    if (leadStatus) filter.leadStatus = leadStatus;
    if (assignedUserId && isValidObjectId(assignedUserId)) {
      filter.assignedUserId = toObjectId(assignedUserId);
    }
    if (assignedOnly === 'true') filter.isAssignedLead = true;
    if (hasEmail === 'true') filter.email = { $nin: [null, ''] };
    if (hasPhone === 'true') filter.mobile = { $nin: [null, ''] };
    if (q) {
      const regex = { $regex: escapeRegex(q), $options: 'i' };
      filter.$or = [{ name: regex }, { email: regex }, { mobile: regex }];
    }

    const [leads, total] = await Promise.all([
      Lead.find(filter)
        .select('name email mobile leadStatus destination publish assignedUserId createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Lead.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      leads: leads.map((lead) => ({
        ...lead,
        canWhatsapp: normalizePhoneForStorage(lead.mobile).length >= 10,
        canEmail: isValidEmail(lead.email),
      })),
      pagination: paginationMeta(page, limit, total),
    });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ *
 * Sending
 * ------------------------------------------------------------------ */

const startCampaignRun = async (req, res, next, { onlyFailed }) => {
  const campaign = await loadEditableCampaign(req.params.id);

  const recipientCount = await CampaignRecipient.countDocuments({ campaignId: campaign._id });
  if (!recipientCount) return next(errorHandler(400, 'Campaign has no leads selected'));

  // Fail loudly here rather than marking every recipient failed one by one.
  if (campaign.channels.includes('whatsapp')) {
    const check = verifyWhatsappLine(campaign.whatsapp?.line || 'main');
    if (!check.ok) return next(errorHandler(400, check.message));
  }
  if (campaign.channels.includes('email')) {
    const check = await verifyEmailSender(campaign.email?.fromUserId || campaign.createdBy);
    if (!check.ok) return next(errorHandler(400, check.message));
  }

  const claimed = await claimCampaignForSending(campaign._id);
  if (!claimed) return next(errorHandler(409, 'Campaign is already being sent'));
  emitCampaignUpdated(claimed);

  // Detached on purpose: large campaigns run far longer than the request timeout.
  runCampaign(claimed._id, { onlyFailed }).catch((error) =>
    console.error('Campaign run error:', error?.message || error)
  );

  res.status(202).json({
    success: true,
    message: onlyFailed ? 'Retrying failed sends' : 'Campaign sending started',
    campaignId: claimed._id,
    status: claimed.status,
    totalLeads: recipientCount,
  });
};

/** POST /api/campaigns/:id/send — send to every pending recipient. */
export const sendCampaign = async (req, res, next) => {
  try {
    await startCampaignRun(req, res, next, { onlyFailed: false });
  } catch (error) {
    next(error);
  }
};

/** POST /api/campaigns/:id/retry-failed — re-send only the failed/pending recipients. */
export const retryFailedCampaign = async (req, res, next) => {
  try {
    await startCampaignRun(req, res, next, { onlyFailed: true });
  } catch (error) {
    next(error);
  }
};

/** POST /api/campaigns/:id/cancel — stops an in-flight run; already-sent messages are unaffected. */
export const cancelCampaign = async (req, res, next) => {
  try {
    const campaign = await loadEditableCampaign(req.params.id);
    if (!['draft', 'sending'].includes(campaign.status)) {
      return next(errorHandler(409, `Campaign is already ${campaign.status}`));
    }
    campaign.status = 'cancelled';
    campaign.completedAt = new Date();
    await campaign.save();
    const updated = await Campaign.findById(campaign._id).lean();
    emitCampaignUpdated(updated);
    res.status(200).json({ success: true, campaign: updated });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ *
 * Reporting
 * ------------------------------------------------------------------ */

/** GET /api/campaigns/:id/recipients — lead-wise status for both channels. */
export const getCampaignRecipients = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) return next(errorHandler(400, 'Invalid campaign id'));
    const { page, limit, skip } = parsePagination(req.query, 50);
    const { whatsappStatus, emailStatus, q } = req.query;

    const filter = { campaignId: toObjectId(req.params.id) };
    if (whatsappStatus) filter['whatsapp.status'] = whatsappStatus;
    if (emailStatus) filter['email.status'] = emailStatus;
    if (q) {
      const regex = { $regex: escapeRegex(q), $options: 'i' };
      filter.$or = [{ leadName: regex }, { leadEmail: regex }, { leadPhone: regex }];
    }

    const [recipients, total] = await Promise.all([
      CampaignRecipient.find(filter)
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .populate('leadId', 'name email mobile leadStatus destination assignedUserId')
        .select('-trackingToken')
        .lean(),
      CampaignRecipient.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      recipients,
      pagination: paginationMeta(page, limit, total),
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/campaigns/:id/stats — overall campaign performance. */
export const getCampaignStats = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) return next(errorHandler(400, 'Invalid campaign id'));
    const campaign = await Campaign.findById(req.params.id).select('name status channels').lean();
    if (!campaign) return next(errorHandler(404, 'Campaign not found'));

    res.status(200).json({
      success: true,
      campaign,
      stats: await statsForCampaign(req.params.id),
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/campaigns/lead/:leadId — every campaign a lead has been part of. */
export const getLeadCampaigns = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.leadId)) return next(errorHandler(400, 'Invalid lead id'));

    const entries = await CampaignRecipient.find({ leadId: toObjectId(req.params.leadId) })
      .sort({ createdAt: -1 })
      .populate('campaignId', 'name status channels whatsapp.templateName email.subject createdAt')
      .select('-trackingToken')
      .lean();

    res.status(200).json({ success: true, count: entries.length, campaigns: entries });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ *
 * WhatsApp templates (read-through to Meta — templates are not stored locally)
 * ------------------------------------------------------------------ */

/** GET /api/campaigns/whatsapp-templates?line=main|demand */
export const getWhatsappTemplates = async (req, res, next) => {
  try {
    const line = req.query.line === 'demand' ? 'demand' : 'main';
    const config = getWhatsappLineConfig(line);
    const accessToken = process.env[config.accessTokenEnv];
    const wabaId = process.env[config.wabaIdEnv];

    if (!accessToken) {
      return next(errorHandler(400, `WhatsApp "${line}" line is not configured (${config.accessTokenEnv})`));
    }
    if (!wabaId) {
      return next(
        errorHandler(
          400,
          `Set ${config.wabaIdEnv} in .env (WhatsApp Business Account ID) to list templates for the ${config.label} line`
        )
      );
    }

    const url = new URL(`https://graph.facebook.com/v21.0/${wabaId}/message_templates`);
    url.searchParams.set('fields', 'name,status,category,language,components');
    url.searchParams.set('limit', String(Math.min(200, parseInt(req.query.limit, 10) || 100)));

    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await response.json();
    if (!response.ok) {
      return next(errorHandler(response.status, data?.error?.message || 'Failed to fetch templates'));
    }

    const all = Array.isArray(data.data) ? data.data : [];
    const approvedOnly = req.query.approvedOnly !== 'false';

    res.status(200).json({
      success: true,
      line,
      templates: approvedOnly
        ? all.filter((t) => String(t.status).toUpperCase() === 'APPROVED')
        : all,
    });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ *
 * Email tracking (public — these URLs are embedded in sent emails)
 * ------------------------------------------------------------------ */

/** GET /api/campaigns/track/open/:token.png — 1x1 pixel; always returns an image. */
export const trackEmailOpen = async (req, res) => {
  const token = String(req.params.token || '').replace(/\.(png|gif|jpg)$/i, '');
  await recordEmailOpen(token);

  res.set({
    'Content-Type': 'image/gif',
    'Content-Length': String(TRACKING_PIXEL.length),
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Pragma: 'no-cache',
    Expires: '0',
  });
  res.status(200).end(TRACKING_PIXEL);
};

/** GET /api/campaigns/track/click/:token?u=<url> — records the click then redirects. */
export const trackEmailClick = async (req, res) => {
  const token = String(req.params.token || '');
  const target = String(req.query.u || '');

  // Only redirect to absolute http(s) URLs so this can't be used as an open redirect
  // to javascript:/data: schemes.
  let safeTarget = null;
  try {
    const parsed = new URL(target);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') safeTarget = parsed.toString();
  } catch {
    safeTarget = null;
  }

  // Only count a click once the target is known good, so malformed links don't inflate stats.
  if (!safeTarget) {
    return res.status(400).send('Invalid or missing link.');
  }

  await recordEmailClick(token, safeTarget);
  res.redirect(302, safeTarget);
};

/** GET /api/campaigns/config — what the campaign UI needs to know before rendering the form. */
export const getCampaignConfig = async (req, res, next) => {
  try {
    const baseUrl = publicBaseUrl();
    const sender = await verifyEmailSender(req.user?.id);
    res.status(200).json({
      success: true,
      channels: CAMPAIGN_CHANNELS,
      whatsappLines: ['main', 'demand'].map((line) => {
        const config = getWhatsappLineConfig(line);
        const check = verifyWhatsappLine(line);
        return {
          line,
          label: config.label,
          configured: check.ok,
          templatesAvailable: Boolean(process.env[config.wabaIdEnv]),
        };
      }),
      emailSender: {
        ok: sender.ok,
        emailAddress: sender.emailAddress || null,
        message: sender.message || null,
      },
      emailTrackingEnabled: Boolean(baseUrl),
      emailTrackingNote: baseUrl
        ? null
        : 'Set PUBLIC_BASE_URL in .env to enable email open and click tracking',
    });
  } catch (error) {
    next(error);
  }
};
