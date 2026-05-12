import path from 'path';
import fs from 'fs';
import MailAccount from '../models/mailAccount.model.js';
import EmailActivity from '../models/emailActivity.model.js';
import Maker from '../models/maker.model.js';
import { errorHandler } from '../utils/error.js';
import { encryptSecret } from '../utils/mailCrypto.js';
import { testImapConnection, syncMailAccount } from '../services/imapService.js';
import { testSmtpConnection, sendMailForMaker } from '../services/smtpService.js';

const DEFAULTS = {
  imapPort: 993,
  smtpPort: 465,
  imapSecure: true,
  smtpSecure: true,
};

const requireAuth = (req, next) => {
  const userId = req.user?.id;
  if (!userId) {
    next(errorHandler(401, 'Authentication required'));
    return null;
  }
  return userId;
};

const sanitize = (acc) => {
  if (!acc) return null;
  const obj = acc.toObject ? acc.toObject() : acc;
  delete obj.encryptedPassword;
  return obj;
};

/**
 * Save (or update) a webmail account for the logged-in maker.
 * Verifies IMAP and SMTP before storing encrypted password.
 *
 * POST /api/webmail/connect
 * body: { emailAddress, password, displayName?, imapHost?, imapPort?, smtpHost?, smtpPort?, signature? }
 */
export const connectWebmail = async (req, res, next) => {
  try {
    const userId = requireAuth(req, next);
    if (!userId) return;

    const {
      emailAddress,
      password,
      displayName,
      imapHost,
      imapPort,
      imapSecure,
      smtpHost,
      smtpPort,
      smtpSecure,
      signature,
    } = req.body;

    if (!emailAddress || !password) {
      return next(errorHandler(400, 'emailAddress and password are required'));
    }

    const maker = await Maker.findById(userId);
    if (!maker) return next(errorHandler(404, 'Maker not found'));

    const domain = emailAddress.split('@')[1];
    if (!domain) return next(errorHandler(400, 'emailAddress is invalid'));

    const cfg = {
      emailAddress: emailAddress.toLowerCase().trim(),
      password,
      imapHost: imapHost || `mail.${domain}`,
      imapPort: Number(imapPort) || DEFAULTS.imapPort,
      imapSecure: imapSecure !== false,
      smtpHost: smtpHost || `mail.${domain}`,
      smtpPort: Number(smtpPort) || DEFAULTS.smtpPort,
      smtpSecure: smtpSecure !== false,
    };

    try {
      await testImapConnection(cfg);
    } catch (err) {
      return next(errorHandler(400, `IMAP login failed: ${err.message}`));
    }

    try {
      await testSmtpConnection(cfg);
    } catch (err) {
      return next(errorHandler(400, `SMTP login failed: ${err.message}`));
    }

    // Make sure no other maker owns this mailbox
    const collision = await MailAccount.findOne({
      emailAddress: cfg.emailAddress,
      userId: { $ne: userId },
    });
    if (collision) {
      return next(errorHandler(409, `Mailbox ${cfg.emailAddress} is already linked to another user`));
    }

    const encryptedPassword = encryptSecret(password);

    const saved = await MailAccount.findOneAndUpdate(
      { userId },
      {
        userId,
        emailAddress: cfg.emailAddress,
        displayName: displayName || `${maker.firstName} ${maker.lastName}`.trim(),
        encryptedPassword,
        imapHost: cfg.imapHost,
        imapPort: cfg.imapPort,
        imapSecure: cfg.imapSecure,
        smtpHost: cfg.smtpHost,
        smtpPort: cfg.smtpPort,
        smtpSecure: cfg.smtpSecure,
        signature: signature || '',
        isActive: true,
        consecutiveFailures: 0,
        syncError: '',
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Fire initial sync in background (do not await)
    syncMailAccount(saved).catch((e) =>
      console.error('[webmail] initial sync error:', e.message)
    );

    res.json({ success: true, message: 'Webmail connected', data: sanitize(saved) });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/webmail/status
 */
export const getWebmailStatus = async (req, res, next) => {
  try {
    const userId = requireAuth(req, next);
    if (!userId) return;
    const account = await MailAccount.findOne({ userId });
    if (!account) return res.json({ success: true, connected: false });
    res.json({ success: true, connected: account.isActive, data: sanitize(account) });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/webmail/disconnect
 */
export const disconnectWebmail = async (req, res, next) => {
  try {
    const userId = requireAuth(req, next);
    if (!userId) return;
    const deleted = await MailAccount.findOneAndDelete({ userId });
    if (!deleted) return next(errorHandler(404, 'No webmail connected'));
    res.json({ success: true, message: 'Webmail disconnected' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/webmail/send
 * Accepts multipart/form-data when attachments are present.
 * Fields: to, cc, bcc, subject, html, text, leadId, replyToMessageId, references
 * Files:  attachments[]
 */
export const sendWebmail = async (req, res, next) => {
  try {
    const userId = requireAuth(req, next);
    if (!userId) return;

    const { to, cc, bcc, subject, html, text, leadId, replyToMessageId, references } = req.body;
    if (!to || !subject || (!html && !text)) {
      return next(errorHandler(400, 'to, subject and html|text are required'));
    }

    const attachments = req.files || [];

    let parsedRefs = references;
    if (typeof references === 'string') {
      try { parsedRefs = JSON.parse(references); } catch (_) { parsedRefs = references; }
    }

    const result = await sendMailForMaker(userId, {
      to,
      cc,
      bcc,
      subject,
      html,
      text,
      leadId: leadId || null,
      replyToMessageId: replyToMessageId || null,
      references: parsedRefs,
      attachments,
    });

    res.json({ success: true, message: 'Email sent', data: result });
  } catch (err) {
    if (err.statusCode) return next(errorHandler(err.statusCode, err.message));
    next(errorHandler(500, `Failed to send email: ${err.message}`));
  }
};

/**
 * GET /api/webmail/inbox?page=1&limit=20&q=&direction=INBOUND&leadId=
 */
export const getInbox = async (req, res, next) => {
  try {
    const userId = requireAuth(req, next);
    if (!userId) return;

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const filter = { userId };
    if (req.query.direction) filter.direction = req.query.direction;
    if (req.query.leadId) filter.leadId = req.query.leadId;
    if (req.query.unreadOnly === 'true') filter.isRead = false;

    if (req.query.q) {
      const rx = new RegExp(req.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ subject: rx }, { from: rx }, { to: rx }, { body: rx }];
    }

    const [items, total, unread] = await Promise.all([
      EmailActivity.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('leadId', 'name email mobile leadId')
        .lean(),
      EmailActivity.countDocuments(filter),
      EmailActivity.countDocuments({ userId, isRead: false, direction: 'INBOUND' }),
    ]);

    res.json({
      success: true,
      data: { items, page, limit, total, unread, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/webmail/thread/:threadId
 */
export const getThread = async (req, res, next) => {
  try {
    const userId = requireAuth(req, next);
    if (!userId) return;

    const items = await EmailActivity.find({
      userId,
      gmailThreadId: req.params.threadId,
    })
      .sort({ createdAt: 1 })
      .populate('leadId', 'name email mobile leadId')
      .lean();

    // Auto-mark inbound as read
    await EmailActivity.updateMany(
      { userId, gmailThreadId: req.params.threadId, isRead: false, direction: 'INBOUND' },
      { isRead: true }
    );

    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/webmail/read/:id
 */
export const markRead = async (req, res, next) => {
  try {
    const userId = requireAuth(req, next);
    if (!userId) return;
    const { isRead = true } = req.body;
    const doc = await EmailActivity.findOneAndUpdate(
      { _id: req.params.id, userId },
      { isRead: !!isRead },
      { new: true }
    );
    if (!doc) return next(errorHandler(404, 'Email not found'));
    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/webmail/attachment/:id/:index
 * Streams a saved inbound attachment from disk.
 */
export const downloadAttachment = async (req, res, next) => {
  try {
    const userId = requireAuth(req, next);
    if (!userId) return;
    const doc = await EmailActivity.findOne({ _id: req.params.id, userId });
    if (!doc) return next(errorHandler(404, 'Email not found'));
    const idx = parseInt(req.params.index);
    const att = doc.attachments?.[idx];
    if (!att || !att.storagePath) return next(errorHandler(404, 'Attachment not found'));

    const abs = path.join(process.cwd(), att.storagePath);
    if (!fs.existsSync(abs)) return next(errorHandler(404, 'Attachment file missing on server'));

    res.setHeader('Content-Type', att.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${att.filename}"`);
    fs.createReadStream(abs).pipe(res);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/webmail/sync-now
 * Manual refresh button.
 */
export const syncNow = async (req, res, next) => {
  try {
    const userId = requireAuth(req, next);
    if (!userId) return;
    const acc = await MailAccount.findOne({ userId, isActive: true });
    if (!acc) return next(errorHandler(404, 'Webmail not connected'));
    const result = await syncMailAccount(acc);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

/**
 * Admin bulk import.
 * POST /api/webmail/admin/bulk-import
 * body: { accounts: [{ makerEmail|makerId, emailAddress, password, displayName?, imapHost?, smtpHost? }, ...] }
 *
 * NOTE: protect this route with an admin middleware in production.
 */
export const bulkImport = async (req, res, next) => {
  try {
    const { accounts } = req.body;
    if (!Array.isArray(accounts) || accounts.length === 0) {
      return next(errorHandler(400, 'accounts[] is required'));
    }

    const results = [];
    for (const row of accounts) {
      try {
        let maker = null;
        if (row.makerId) {
          maker = await Maker.findById(row.makerId);
        } else if (row.makerEmail) {
          maker = await Maker.findOne({ email: row.makerEmail });
        }
        if (!maker) {
          results.push({ row: row.emailAddress || row.makerEmail, ok: false, error: 'Maker not found' });
          continue;
        }
        if (!row.emailAddress || !row.password) {
          results.push({ row: row.emailAddress, ok: false, error: 'emailAddress + password required' });
          continue;
        }

        const domain = row.emailAddress.split('@')[1];
        const cfg = {
          emailAddress: row.emailAddress.toLowerCase().trim(),
          password: row.password,
          imapHost: row.imapHost || `mail.${domain}`,
          imapPort: Number(row.imapPort) || DEFAULTS.imapPort,
          imapSecure: row.imapSecure !== false,
          smtpHost: row.smtpHost || `mail.${domain}`,
          smtpPort: Number(row.smtpPort) || DEFAULTS.smtpPort,
          smtpSecure: row.smtpSecure !== false,
        };

        try { await testImapConnection(cfg); }
        catch (e) { results.push({ row: cfg.emailAddress, ok: false, error: `IMAP: ${e.message}` }); continue; }

        try { await testSmtpConnection(cfg); }
        catch (e) { results.push({ row: cfg.emailAddress, ok: false, error: `SMTP: ${e.message}` }); continue; }

        await MailAccount.findOneAndUpdate(
          { userId: maker._id },
          {
            userId: maker._id,
            emailAddress: cfg.emailAddress,
            displayName: row.displayName || `${maker.firstName} ${maker.lastName}`.trim(),
            encryptedPassword: encryptSecret(row.password),
            imapHost: cfg.imapHost,
            imapPort: cfg.imapPort,
            imapSecure: cfg.imapSecure,
            smtpHost: cfg.smtpHost,
            smtpPort: cfg.smtpPort,
            smtpSecure: cfg.smtpSecure,
            isActive: true,
            consecutiveFailures: 0,
            syncError: '',
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        results.push({ row: cfg.emailAddress, ok: true, maker: maker._id });
      } catch (err) {
        results.push({ row: row.emailAddress, ok: false, error: err.message });
      }
    }

    res.json({
      success: true,
      total: accounts.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (err) {
    next(err);
  }
};
