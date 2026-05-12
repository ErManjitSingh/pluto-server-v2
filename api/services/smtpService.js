import nodemailer from 'nodemailer';
import MailAccount from '../models/mailAccount.model.js';
import EmailActivity from '../models/emailActivity.model.js';
import Lead from '../models/lead.model.js';
import { decryptSecret, generateMessageId } from '../utils/mailCrypto.js';

const buildTransport = (account, password) => {
  // Use the mailbox's domain as the EHLO/HELO hostname (e.g. "ptwholidays.com")
  // so the receiving server doesn't see "DESKTOP-XYZ" / random local machine name.
  // Gmail aggressively drops mail whose Received: header shows a residential
  // hostname that doesn't match the From: domain.
  const fromDomain = (account.emailAddress || '').split('@')[1] || 'localhost';
  return nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSecure,
    name: `mail.${fromDomain}`, // EHLO / HELO hostname
    auth: { user: account.emailAddress, pass: password },
    tls: { rejectUnauthorized: false, servername: account.smtpHost },
    connectionTimeout: 20000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
};

/**
 * Test SMTP credentials without sending anything.
 */
export const testSmtpConnection = async ({
  emailAddress,
  password,
  smtpHost,
  smtpPort = 465,
  smtpSecure = true,
}) => {
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: { user: emailAddress, pass: password },
    tls: { rejectUnauthorized: false, servername: smtpHost },
    connectionTimeout: 20000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
  await transporter.verify();
  return { ok: true };
};

/**
 * Send mail using the maker's saved cPanel mailbox.
 *
 * payload: {
 *   to, cc, bcc, subject, html, text, attachments (multer-style),
 *   leadId, replyToMessageId, references
 * }
 */
export const sendMailForMaker = async (userId, payload) => {
  const account = await MailAccount.findOne({ userId, isActive: true }).select('+encryptedPassword');
  if (!account) {
    const err = new Error('Webmail not connected for this user');
    err.statusCode = 404;
    throw err;
  }

  const password = decryptSecret(account.encryptedPassword);
  const transporter = buildTransport(account, password);

  const fromHeader = account.displayName
    ? `"${account.displayName}" <${account.emailAddress}>`
    : account.emailAddress;

  const domain = account.emailAddress.split('@')[1] || 'crm.local';
  const messageId = generateMessageId(domain);

  const refs = [];
  if (payload.references) {
    if (Array.isArray(payload.references)) refs.push(...payload.references);
    else refs.push(payload.references);
  }
  if (payload.replyToMessageId) refs.push(payload.replyToMessageId);

  const mailOptions = {
    from: fromHeader,
    sender: account.emailAddress,
    replyTo: account.emailAddress,
    envelope: {
      from: account.emailAddress, // MAIL FROM (must match auth user for cPanel)
      to: [payload.to, payload.cc, payload.bcc].filter(Boolean).join(','),
    },
    to: payload.to,
    cc: payload.cc || undefined,
    bcc: payload.bcc || undefined,
    subject: payload.subject || '(no subject)',
    text: payload.text || (payload.html ? payload.html.replace(/<[^>]*>/g, ' ') : ''),
    html: payload.html || undefined,
    messageId,
    inReplyTo: payload.replyToMessageId || undefined,
    references: refs.length ? refs : undefined,
    headers: {
      'X-Mailer': 'PTW-CRM/1.0',
      'X-Priority': '3',
    },
    attachments: (payload.attachments || []).map((a) => ({
      filename: a.originalname || a.filename,
      content: a.buffer,
      contentType: a.mimetype,
    })),
  };

  const info = await transporter.sendMail(mailOptions);

  // Determine threading
  let threadId = messageId;
  if (payload.replyToMessageId) {
    const parent = await EmailActivity.findOne({
      userId,
      gmailMessageId: payload.replyToMessageId,
    }).select('gmailThreadId');
    if (parent && parent.gmailThreadId) threadId = parent.gmailThreadId;
  }

  // Save attachment metadata (no disk write for outbound — buffers already streamed)
  const attMeta = (payload.attachments || []).map((a) => ({
    filename: a.originalname || a.filename,
    mimeType: a.mimetype,
    size: a.size,
    attachmentId: '',
    storagePath: '',
  }));

  const doc = await EmailActivity.create({
    leadId: payload.leadId || undefined,
    userId,
    gmailMessageId: messageId,
    gmailThreadId: threadId,
    direction: 'OUTBOUND',
    from: fromHeader,
    to: String(payload.to || ''),
    cc: String(payload.cc || ''),
    bcc: String(payload.bcc || ''),
    subject: payload.subject || '',
    body: payload.text || '',
    htmlBody: payload.html || '',
    attachments: attMeta,
    isRead: true,
  });

  if (payload.leadId) {
    try {
      await Lead.findOneAndUpdate(
        { _id: payload.leadId, gmailThreadId: { $exists: false } },
        { gmailThreadId: threadId }
      );
      await Lead.findByIdAndUpdate(payload.leadId, { lastEmailAt: new Date() });
    } catch (_) {}
  }

  return {
    activityId: doc._id,
    messageId,
    threadId,
    accepted: info.accepted,
    rejected: info.rejected,
    response: info.response,
  };
};
