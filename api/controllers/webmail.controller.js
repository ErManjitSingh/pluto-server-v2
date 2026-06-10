import path from 'path';
import fs from 'fs';
import MailAccount from '../models/mailAccount.model.js';
import EmailActivity from '../models/emailActivity.model.js';
import Maker from '../models/maker.model.js';
import Lead from '../models/lead.model.js';
import { errorHandler } from '../utils/error.js';
import { encryptSecret } from '../utils/mailCrypto.js';
import { testImapConnection, syncMailAccount } from '../services/imapService.js';
import { testSmtpConnection, sendMailForMaker } from '../services/smtpService.js';
import emailService from '../services/email.service.js';
import { getIO } from '../socket/socket.js';

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
 * Resolve the MailAccount that the logged-in maker should use.
 * Same rule used by smtpService.sendMailForMaker() so every endpoint stays in sync.
 *
 * Priority:
 *   1. Shared mailbox for this maker's companyName (multi-company setup)
 *   2. Legacy per-user mailbox where userId = the logged-in maker
 *
 * Returns the matching MailAccount or null.
 */
const resolveMailAccountForUser = async (userId) => {
  const maker = await Maker.findById(userId).select('companyName');
  if (maker?.companyName) {
    const shared = await MailAccount.findOne({
      isShared: true,
      isActive: true,
      companyName: maker.companyName,
    });
    if (shared) return shared;
  }
  return MailAccount.findOne({ userId, isActive: true });
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
      isShared = false,
      companyName,
    } = req.body;

    if (!emailAddress || !password) {
      return next(errorHandler(400, 'emailAddress and password are required'));
    }

    const maker = await Maker.findById(userId);
    if (!maker) return next(errorHandler(404, 'Maker not found'));

    // Resolve company name: prefer explicit body value, else fall back to admin's own company
    const resolvedCompany = (companyName || maker.companyName || '').trim();
    if (!resolvedCompany) {
      return next(
        errorHandler(
          400,
          'companyName is required (e.g. "PTW Holidays" or "Demand Setu Tours")'
        )
      );
    }

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

    const encryptedPassword = encryptSecret(password);

    // For shared mailbox: there can be only ONE per company.
    // For per-user mailbox: one row per maker.
    const filter = isShared
      ? { isShared: true, companyName: resolvedCompany }
      : { userId, isShared: { $ne: true } };

    const saved = await MailAccount.findOneAndUpdate(
      filter,
      {
        userId,
        emailAddress: cfg.emailAddress,
        displayName:
          displayName ||
          (isShared ? `${resolvedCompany} Sales` : `${maker.firstName} ${maker.lastName}`.trim()),
        encryptedPassword,
        imapHost: cfg.imapHost,
        imapPort: cfg.imapPort,
        imapSecure: cfg.imapSecure,
        smtpHost: cfg.smtpHost,
        smtpPort: cfg.smtpPort,
        smtpSecure: cfg.smtpSecure,
        signature: signature || '',
        isShared: !!isShared,
        companyName: resolvedCompany,
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
 * Returns "connected: true" for every maker whose company has a shared mailbox configured.
 * (Previously only the user who saved the row saw connected: true — caused executives/TLs
 *  to see a broken "Connect mail" form even though the company mail was active.)
 */
export const getWebmailStatus = async (req, res, next) => {
  try {
    const userId = requireAuth(req, next);
    if (!userId) return;
    const account = await resolveMailAccountForUser(userId);
    if (!account) return res.json({ success: true, connected: false });
    res.json({ success: true, connected: account.isActive, data: sanitize(account) });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/webmail/disconnect
 *
 * Rules:
 *  - Per-user (legacy) mailbox  → owner can delete their own row.
 *  - Shared company mailbox     → ANY admin/manager/TL of that company can delete the row.
 *                                  Regular executives cannot disconnect the company mailbox
 *                                  (would break it for the entire team).
 */
export const disconnectWebmail = async (req, res, next) => {
  try {
    const userId = requireAuth(req, next);
    if (!userId) return;

    const account = await resolveMailAccountForUser(userId);
    if (!account) return next(errorHandler(404, 'No webmail connected'));

    if (account.isShared) {
      const ADMIN_TYPES = new Set([
        'admin',
        'Admin',
        'manager',
        'Manager',
        'TL',
        'Executive',
        'executive',
        'TeamLeader',
        'Team Leader',
        'teamleader',
      ]);
      const maker = await Maker.findById(userId).select('userType companyName');
      if (!maker || !ADMIN_TYPES.has(maker.userType)) {
        return next(
          errorHandler(
            403,
            'Only an admin/manager/team-leader can disconnect the company shared mailbox.'
          )
        );
      }
      if (maker.companyName !== account.companyName) {
        return next(errorHandler(403, 'You cannot disconnect another company\'s mailbox.'));
      }
    } else if (String(account.userId) !== String(userId)) {
      return next(errorHandler(403, 'You can only disconnect your own mailbox.'));
    }

    await MailAccount.findByIdAndDelete(account._id);
    res.json({ success: true, message: 'Webmail disconnected', data: { id: account._id } });
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
 * POST /api/webmail/send-demand
 * Public endpoint — no token / company required.
 * Sends directly from info@demandsetutours.com with optional attachments.
 * Fields: to, cc, bcc, subject, html, text, replyTo
 * Files:  attachments[]
 */
export const sendMailDemand = async (req, res, next) => {
  try {
    const { to, cc, bcc, subject, html, text, replyTo } = req.body;
    if (!to || !subject || (!html && !text)) {
      return next(errorHandler(400, 'to, subject and html|text are required'));
    }

    const attachments = req.files || [];
    const transporter = emailService.createDemandsetutoursTransporter();

    const mailOptions = {
      from: '"Demand Setu Tours" <info@demandsetutours.com>',
      sender: 'info@demandsetutours.com',
      replyTo: replyTo || 'info@demandsetutours.com',
      envelope: {
        from: 'info@demandsetutours.com',
        to: [to, cc, bcc].filter(Boolean).join(','),
      },
      to,
      cc: cc || undefined,
      bcc: bcc || undefined,
      subject,
      text: text || (html ? html.replace(/<[^>]*>/g, ' ') : ''),
      html: html || undefined,
      attachments: attachments.map((a) => ({
        filename: a.originalname || a.filename,
        content: a.buffer,
        contentType: a.mimetype,
      })),
    };

    const info = await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: 'Email sent',
      data: {
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
        response: info.response,
      },
    });
  } catch (err) {
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
    const acc = await resolveMailAccountForUser(userId);
    if (!acc) return next(errorHandler(404, 'Webmail not connected'));
    const result = await syncMailAccount(acc);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

/**
 * Helper: remove an attachment folder from disk for a given email.
 * Folder = uploads/email-attachments/<userId|shared>/<safeMessageId>/
 */
const deleteAttachmentsOnDisk = async (email) => {
  if (!email?.attachments || email.attachments.length === 0) return;
  for (const att of email.attachments) {
    if (!att.storagePath) continue;
    try {
      const abs = path.join(process.cwd(), att.storagePath);
      await fs.promises.unlink(abs);
    } catch (_) {
      // file already missing or permission error — ignore
    }
  }
  // Try removing the per-message folder (only succeeds if empty)
  try {
    const first = email.attachments.find((a) => a.storagePath);
    if (first) {
      const folder = path.dirname(path.join(process.cwd(), first.storagePath));
      await fs.promises.rmdir(folder);
    }
  } catch (_) {}
};

/**
 * DELETE /api/webmail/:id
 * Delete ONE email from the CRM (only if it belongs to the logged-in maker).
 * Also wipes attachment files from disk.
 *
 * Note: this does NOT delete from the cPanel mailbox on the server — only from the CRM DB.
 */
export const deleteEmail = async (req, res, next) => {
  try {
    const userId = requireAuth(req, next);
    if (!userId) return;

    const email = await EmailActivity.findOne({ _id: req.params.id, userId });
    if (!email) {
      return next(errorHandler(404, 'Email not found or not owned by you'));
    }

    await deleteAttachmentsOnDisk(email);
    await EmailActivity.deleteOne({ _id: email._id });

    res.json({ success: true, message: 'Email deleted', data: { id: email._id } });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/webmail/thread/:threadId
 * Delete an ENTIRE conversation for the logged-in maker.
 */
export const deleteThread = async (req, res, next) => {
  try {
    const userId = requireAuth(req, next);
    if (!userId) return;

    const emails = await EmailActivity.find({ gmailThreadId: req.params.threadId, userId });
    if (emails.length === 0) {
      return next(errorHandler(404, 'No emails found in this thread for you'));
    }

    for (const email of emails) {
      await deleteAttachmentsOnDisk(email);
    }
    const result = await EmailActivity.deleteMany({
      gmailThreadId: req.params.threadId,
      userId,
    });

    res.json({
      success: true,
      message: `Thread deleted (${result.deletedCount} email${result.deletedCount === 1 ? '' : 's'})`,
      data: { deletedCount: result.deletedCount, threadId: req.params.threadId },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/webmail/bulk-delete
 * Body: { ids: [emailId, emailId, ...] }
 * Bulk delete multiple emails owned by the logged-in maker.
 */
export const bulkDelete = async (req, res, next) => {
  try {
    const userId = requireAuth(req, next);
    if (!userId) return;

    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return next(errorHandler(400, 'ids[] is required'));
    }

    const emails = await EmailActivity.find({ _id: { $in: ids }, userId });
    for (const email of emails) {
      await deleteAttachmentsOnDisk(email);
    }
    const result = await EmailActivity.deleteMany({ _id: { $in: ids }, userId });

    res.json({
      success: true,
      message: `${result.deletedCount} email(s) deleted`,
      data: { requested: ids.length, deletedCount: result.deletedCount },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/webmail/admin/:id
 * Admin override — delete ANY email (assigned, unassigned, anyone's).
 * Use for cleaning the Shared Inbox or removing spam/phishing.
 */
export const adminDeleteEmail = async (req, res, next) => {
  try {
    const email = await EmailActivity.findById(req.params.id);
    if (!email) return next(errorHandler(404, 'Email not found'));

    await deleteAttachmentsOnDisk(email);
    await EmailActivity.deleteOne({ _id: email._id });

    res.json({ success: true, message: 'Email deleted (admin)', data: { id: email._id } });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/webmail/admin/thread/:threadId
 * Admin override — delete an entire conversation regardless of owner.
 */
export const adminDeleteThread = async (req, res, next) => {
  try {
    const emails = await EmailActivity.find({ gmailThreadId: req.params.threadId });
    if (emails.length === 0) return next(errorHandler(404, 'Thread not found'));

    for (const email of emails) {
      await deleteAttachmentsOnDisk(email);
    }
    const result = await EmailActivity.deleteMany({ gmailThreadId: req.params.threadId });

    res.json({
      success: true,
      message: `Thread deleted (${result.deletedCount} email${result.deletedCount === 1 ? '' : 's'})`,
      data: { deletedCount: result.deletedCount, threadId: req.params.threadId },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/webmail/admin/shared-inbox?page=1&limit=20&q=&companyName=
 * Returns unassigned emails (userId = null). Admin only.
 * By default scoped to the admin's own company; pass ?companyName=All for cross-company view.
 */
export const getSharedInbox = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const filter = { userId: { $in: [null, undefined] }, direction: 'INBOUND' };

    // Scope by company (default = admin's own company)
    const company =
      req.query.companyName !== undefined
        ? req.query.companyName
        : req.adminUser?.companyName;
    if (company && company !== 'All') filter.companyName = company;

    if (req.query.q) {
      const rx = new RegExp(req.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ subject: rx }, { from: rx }, { to: rx }, { body: rx }];
    }

    const [items, total] = await Promise.all([
      EmailActivity.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      EmailActivity.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: { items, page, limit, total, totalPages: Math.ceil(total / limit), companyName: company || 'All' },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/webmail/admin/assign/:emailId
 * Body: { makerId, createLead?: boolean (default true), leadName? }
 * Assigns an unassigned email to a maker. Optionally creates a Lead and links it.
 * Admin only.
 */
export const assignEmailToMaker = async (req, res, next) => {
  try {
    const { emailId } = req.params;
    const { makerId, createLead = true, leadName } = req.body;

    if (!makerId) return next(errorHandler(400, 'makerId is required'));

    const email = await EmailActivity.findById(emailId);
    if (!email) return next(errorHandler(404, 'Email not found'));

    const maker = await Maker.findById(makerId).select('firstName lastName email');
    if (!maker) return next(errorHandler(404, 'Maker not found'));

    // Auto-create Lead from sender info if requested and not already linked
    let leadId = email.leadId;
    if (createLead && !leadId) {
      const senderEmail = (email.from.match(/<([^>]+)>/)?.[1] || email.from).trim().toLowerCase();
      let lead = await Lead.findOne({ email: new RegExp(`^${senderEmail}$`, 'i') });
      if (!lead) {
        lead = await Lead.create({
          name: leadName || senderEmail.split('@')[0],
          email: senderEmail,
          source: 'Email Inquiry',
          assignedUserId: makerId,
          isAssignedLead: true,
          assignedAt: new Date(),
          gmailThreadId: email.gmailThreadId,
          lastEmailAt: new Date(),
        });
      } else if (!lead.assignedUserId) {
        await Lead.findByIdAndUpdate(lead._id, {
          assignedUserId: makerId,
          isAssignedLead: true,
          assignedAt: new Date(),
        });
      }
      leadId = lead._id;
    }

    // Update this email + the entire thread (so all past + future replies belong to this maker)
    await EmailActivity.updateMany(
      { gmailThreadId: email.gmailThreadId },
      { userId: makerId, ...(leadId ? { leadId } : {}) }
    );

    // Push socket notification to the assigned maker
    try {
      const io = getIO();
      if (io) {
        io.to(`user:${makerId}`).emit('webmail:new', {
          _id: email._id,
          from: email.from,
          subject: email.subject,
          direction: email.direction,
          leadId,
          threadId: email.gmailThreadId,
          createdAt: email.createdAt,
          assigned: true,
        });
      }
    } catch (_) {}

    res.json({
      success: true,
      message: `Email assigned to ${maker.firstName} ${maker.lastName}`,
      data: { emailId, makerId, leadId },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/webmail/admin/inbox/:makerId
 * Returns the specified maker's inbox. Admin only.
 * Same query params as the regular inbox endpoint.
 */
export const getMakerInbox = async (req, res, next) => {
  try {
    const { makerId } = req.params;
    if (!makerId) return next(errorHandler(400, 'makerId is required'));

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const filter = { userId: makerId };
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
      EmailActivity.countDocuments({ userId: makerId, isRead: false, direction: 'INBOUND' }),
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
