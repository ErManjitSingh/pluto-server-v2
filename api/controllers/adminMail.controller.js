import { errorHandler } from '../utils/error.js';
import {
  listMailboxes,
  getInbox,
  getMessageByUid,
  getAttachment,
  sendMail,
  replyMail,
} from '../services/adminMail.service.js';

/**
 * GET /api/admin-mail/mailboxes
 * No auth — lists the 3 fixed admin mailboxes.
 */
export const getMailboxes = async (req, res, next) => {
  try {
    res.json({ success: true, data: listMailboxes() });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin-mail/inbox?mailbox=&page=1&limit=20&folder=inbox|sent
 * folder=sent → mails you sent / replied (IMAP Sent folder)
 */
export const getAdminInbox = async (req, res, next) => {
  try {
    const { mailbox, page, limit, folder } = req.query;
    if (!mailbox) return next(errorHandler(400, 'mailbox query is required'));

    const data = await getInbox({ mailbox, page, limit, folder });
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return next(errorHandler(err.statusCode, err.message));
    next(errorHandler(500, `Inbox failed: ${err.message}`));
  }
};

/**
 * GET /api/admin-mail/message?mailbox=&uid=&folder=inbox|sent
 * Full body + attachment metadata (index/filename/size) — no file bytes.
 */
export const getAdminMessage = async (req, res, next) => {
  try {
    const { mailbox, uid, folder } = req.query;
    if (!mailbox || !uid) {
      return next(errorHandler(400, 'mailbox and uid query are required'));
    }

    const data = await getMessageByUid({ mailbox, uid, folder });
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return next(errorHandler(err.statusCode, err.message));
    next(errorHandler(500, `Fetch message failed: ${err.message}`));
  }
};

/**
 * GET /api/admin-mail/attachment?mailbox=&uid=&index=0&folder=inbox|sent
 * Streams the file (Content-Disposition: attachment).
 */
export const downloadAdminAttachment = async (req, res, next) => {
  try {
    const { mailbox, uid, index, folder } = req.query;
    if (!mailbox || uid == null || index == null) {
      return next(errorHandler(400, 'mailbox, uid and index query are required'));
    }

    const file = await getAttachment({ mailbox, uid, index, folder });
    const safeName = String(file.filename).replace(/"/g, '');

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Length', file.content.length);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.send(file.content);
  } catch (err) {
    if (err.statusCode) return next(errorHandler(err.statusCode, err.message));
    next(errorHandler(500, `Attachment download failed: ${err.message}`));
  }
};

/**
 * POST /api/admin-mail/send
 * JSON or multipart: mailbox, to, subject, html|text, attachments[]
 */
export const sendAdminMail = async (req, res, next) => {
  try {
    const { mailbox, to, cc, bcc, subject, html, text, replyTo } = req.body || {};
    const data = await sendMail({
      mailbox,
      to,
      cc,
      bcc,
      subject,
      html,
      text,
      replyTo,
      attachments: req.files || [],
    });
    res.json({ success: true, message: 'Email sent', data });
  } catch (err) {
    if (err.statusCode) return next(errorHandler(err.statusCode, err.message));
    next(errorHandler(500, `Send failed: ${err.message}`));
  }
};

/**
 * POST /api/admin-mail/reply
 * JSON or multipart — same fields + optional attachments[]
 */
export const replyAdminMail = async (req, res, next) => {
  try {
    const {
      mailbox,
      uid,
      to,
      cc,
      subject,
      html,
      text,
      replyToMessageId,
      references,
    } = req.body || {};

    const data = await replyMail({
      mailbox,
      uid,
      to,
      cc,
      subject,
      html,
      text,
      replyToMessageId,
      references,
      attachments: req.files || [],
    });
    res.json({ success: true, message: 'Reply sent', data });
  } catch (err) {
    if (err.statusCode) return next(errorHandler(err.statusCode, err.message));
    next(errorHandler(500, `Reply failed: ${err.message}`));
  }
};
