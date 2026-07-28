import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';

/**
 * Admin mailboxes — fixed accounts, no JWT.
 * Both domains sit behind Cloudflare — connect to Hostinger origin IP,
 * keep TLS SNI as mail.* hostname (same pattern as email.service.js).
 */

const PTW_HOST = process.env.PTW_SMTP_HOST || '119.18.54.120';
const PTW_TLS = process.env.PTW_SMTP_TLS_NAME || 'mail.ptwholidays.com';

const DEMAND_HOST = process.env.DEMANDSETUTOURS_SMTP_HOST || '119.18.54.120';
const DEMAND_TLS = process.env.DEMANDSETUTOURS_SMTP_TLS_NAME || 'mail.demandsetutours.com';

/** @type {Record<string, { label: string, user: string, passEnv: string[], smtpHost: string, smtpPort: number, smtpSecure: boolean, tlsName: string, imapHost: string, imapPort: number, imapSecure: boolean }>} */
const MAILBOX_CONFIG = {
  'rahil@ptwholidays.com': {
    label: 'Rahil PTW',
    user: 'rahil@ptwholidays.com',
    passEnv: ['ADMIN_MAIL_RAHIL_PASSWORD'],
    smtpHost: PTW_HOST,
    smtpPort: Number(process.env.PTW_SMTP_PORT) || 465,
    smtpSecure: process.env.PTW_SMTP_SECURE !== 'false',
    tlsName: PTW_TLS,
    imapHost: process.env.PTW_IMAP_HOST || PTW_HOST,
    imapPort: Number(process.env.PTW_IMAP_PORT) || 993,
    imapSecure: process.env.PTW_IMAP_SECURE !== 'false',
  },
  'info@ptwholidays.com': {
    label: 'Info PTW',
    user: 'info@ptwholidays.com',
    passEnv: ['ADMIN_MAIL_PTW_INFO_PASSWORD'],
    smtpHost: PTW_HOST,
    smtpPort: Number(process.env.PTW_SMTP_PORT) || 465,
    smtpSecure: process.env.PTW_SMTP_SECURE !== 'false',
    tlsName: PTW_TLS,
    imapHost: process.env.PTW_IMAP_HOST || PTW_HOST,
    imapPort: Number(process.env.PTW_IMAP_PORT) || 993,
    imapSecure: process.env.PTW_IMAP_SECURE !== 'false',
  },
  'info@demandsetutours.com': {
    label: 'Info Demand Setu',
    user: 'info@demandsetutours.com',
    passEnv: ['ADMIN_MAIL_DEMAND_INFO_PASSWORD', 'DEMANDSETUTOURS_EMAIL_PASSWORD'],
    smtpHost: DEMAND_HOST,
    smtpPort: Number(process.env.DEMANDSETUTOURS_SMTP_PORT) || 465,
    smtpSecure: process.env.DEMANDSETUTOURS_SMTP_SECURE !== 'false',
    tlsName: DEMAND_TLS,
    // Same Cloudflare bypass as SMTP: connect to origin IP, SNI = mail.demandsetutours.com
    imapHost: process.env.DEMANDSETUTOURS_IMAP_HOST || DEMAND_HOST,
    imapPort: Number(process.env.DEMANDSETUTOURS_IMAP_PORT) || 993,
    imapSecure: process.env.DEMANDSETUTOURS_IMAP_SECURE !== 'false',
  },
};

const MAX_INBOX_LIMIT = 50;
const DEFAULT_INBOX_LIMIT = 20;

/** cPanel / HostGator / Roundcube common Sent folder names */
const SENT_FOLDER_CANDIDATES = [
  'Sent',
  'INBOX.Sent',
  'Sent Items',
  'Sent Messages',
  'INBOX.Sent Items',
];

function normalizeMailbox(mailbox) {
  return String(mailbox || '')
    .trim()
    .toLowerCase();
}

function normalizeFolderKey(folder) {
  const f = String(folder || 'inbox')
    .trim()
    .toLowerCase();
  if (f === 'sent' || f === 'sentmail' || f === 'outbox') return 'sent';
  return 'inbox';
}

/**
 * Resolve real IMAP box name for inbox|sent.
 * Lists mailboxes once and picks best Sent match.
 */
async function resolveImapBoxName(connection, folderKey) {
  if (folderKey === 'inbox') return 'INBOX';

  let boxes = {};
  try {
    boxes = await connection.getBoxes();
  } catch (_) {
    boxes = {};
  }

  const flat = [];
  const walk = (node, prefix = '') => {
    if (!node || typeof node !== 'object') return;
    for (const [name, meta] of Object.entries(node)) {
      const delim = meta?.delimiter || '.';
      const full = prefix ? `${prefix}${delim}${name}` : name;
      flat.push({
        name: full,
        attribs: meta?.attribs || [],
      });
      if (meta?.children) walk(meta.children, full);
    }
  };
  walk(boxes);

  // Prefer special-use \Sent (Roundcube/cPanel often sets this)
  const special = flat.find((b) =>
    (b.attribs || []).some((a) => String(a).toLowerCase() === '\\sent')
  );
  if (special) return special.name;

  for (const candidate of SENT_FOLDER_CANDIDATES) {
    const hit = flat.find((b) => b.name.toLowerCase() === candidate.toLowerCase());
    if (hit) return hit.name;
  }

  const fuzzy = flat.find((b) => /(^|[./])sent( items| messages)?$/i.test(b.name));
  if (fuzzy) return fuzzy.name;

  return 'Sent';
}

function resolvePassword(cfg) {
  for (const key of cfg.passEnv) {
    const val = process.env[key];
    if (val && String(val).trim()) return String(val).trim();
  }
  return '';
}

/**
 * Resolve allowlisted mailbox config + password.
 * @throws {{ statusCode: number, message: string }}
 */
export function getMailbox(mailbox) {
  const key = normalizeMailbox(mailbox);
  const cfg = MAILBOX_CONFIG[key];
  if (!cfg) {
    const err = new Error(
      `Invalid mailbox. Use one of: ${Object.keys(MAILBOX_CONFIG).join(', ')}`
    );
    err.statusCode = 400;
    throw err;
  }
  const password = resolvePassword(cfg);
  if (!password) {
    const err = new Error(
      `Password not configured for ${cfg.user}. Set ${cfg.passEnv.join(' or ')} in .env`
    );
    err.statusCode = 500;
    throw err;
  }
  return { ...cfg, password };
}

export function listMailboxes() {
  return Object.values(MAILBOX_CONFIG).map((cfg) => ({
    mailbox: cfg.user,
    label: cfg.label,
    configured: Boolean(resolvePassword(cfg)),
  }));
}

function createSmtpTransport(cfg) {
  return nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpSecure,
    name: cfg.tlsName,
    auth: { user: cfg.user, pass: cfg.password },
    tls: {
      rejectUnauthorized: false,
      servername: cfg.tlsName,
    },
    connectionTimeout: 20000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
}

function buildImapConfig(cfg) {
  return {
    imap: {
      user: cfg.user,
      password: cfg.password,
      host: cfg.imapHost,
      port: cfg.imapPort,
      tls: cfg.imapSecure,
      tlsOptions: {
        rejectUnauthorized: false,
        servername: cfg.tlsName || cfg.imapHost,
      },
      authTimeout: 15000,
      connTimeout: 20000,
    },
  };
}

function addrText(addr) {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  if (Array.isArray(addr)) return addr.map(addrText).filter(Boolean).join(', ');
  if (addr.text) return addr.text;
  if (addr.value && Array.isArray(addr.value)) {
    return addr.value
      .map((v) => (v.name ? `${v.name} <${v.address}>` : v.address))
      .join(', ');
  }
  return '';
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True if MIME struct has a part with Content-Disposition: attachment */
function structHasAttachment(struct) {
  if (!struct) return false;
  try {
    const parts = imaps.getParts(struct) || [];
    return parts.some((p) => {
      const disp = p.disposition;
      if (!disp) return false;
      const type = typeof disp === 'string' ? disp : disp.type;
      return String(type || '').toLowerCase() === 'attachment';
    });
  } catch (_) {
    return false;
  }
}

/** imap-simple HEADER body is already a parsed object: { from: ['..'], subject: ['..'] } */
function headerField(headerObj, name) {
  if (!headerObj || typeof headerObj !== 'object') return '';
  const key = Object.keys(headerObj).find((k) => k.toLowerCase() === name.toLowerCase());
  if (!key) return '';
  const val = headerObj[key];
  if (Array.isArray(val)) return val.filter(Boolean).join(', ');
  if (val == null) return '';
  return String(val);
}

function parseImapHeaderPart(headerBody) {
  // Already-parsed object from imap-simple
  if (headerBody && typeof headerBody === 'object' && !Buffer.isBuffer(headerBody)) {
    const dateRaw = headerField(headerBody, 'date');
    let date = null;
    if (dateRaw) {
      const d = new Date(dateRaw);
      if (!Number.isNaN(d.getTime())) date = d;
    }
    return {
      messageId: headerField(headerBody, 'message-id').trim(),
      from: headerField(headerBody, 'from'),
      to: headerField(headerBody, 'to'),
      cc: headerField(headerBody, 'cc'),
      subject: headerField(headerBody, 'subject'),
      date,
    };
  }
  return null;
}

/** Metadata only — no file content (safe for message open JSON). */
function mapAttachmentMeta(attachments = []) {
  return (attachments || []).map((a, index) => ({
    index,
    filename: a.filename || a.cid || `attachment-${index + 1}`,
    contentType: a.contentType || 'application/octet-stream',
    size: typeof a.size === 'number' ? a.size : a.content?.length || 0,
  }));
}

/** Multer / buffer files → nodemailer attachments */
function toNodemailerAttachments(files = []) {
  return (files || []).map((a) => ({
    filename: a.originalname || a.filename || 'file',
    content: a.buffer,
    contentType: a.mimetype || a.contentType,
  }));
}

function ensureReSubject(subject) {
  const s = String(subject || '').trim() || '(no subject)';
  return /^re\s*:/i.test(s) ? s : `Re: ${s}`;
}

/**
 * Shared: open folder, fetch one UID, parse full MIME.
 */
async function fetchParsedByUid(cfg, uidNum, folderKey = 'inbox') {
  let connection;
  try {
    connection = await imaps.connect(buildImapConfig(cfg));
    const boxName = await resolveImapBoxName(connection, normalizeFolderKey(folderKey));
    await connection.openBox(boxName);

    const fetched = await connection.search([['UID', String(uidNum)]], {
      bodies: [''],
      struct: false,
      markSeen: false,
    });

    if (!fetched.length) {
      const err = new Error('Message not found');
      err.statusCode = 404;
      throw err;
    }

    const rawPart = fetched[0].parts?.find((p) => p.which === '');
    if (!rawPart) {
      const err = new Error('Message body missing');
      err.statusCode = 404;
      throw err;
    }

    const parsed = await simpleParser(rawPart.body);
    return {
      parsed,
      flags: fetched[0].attributes?.flags || [],
      folder: normalizeFolderKey(folderKey),
      boxName,
    };
  } finally {
    try {
      if (connection) connection.end();
    } catch (_) {}
  }
}

/**
 * After SMTP send, copy into IMAP Sent so it appears in /inbox?folder=sent
 * (Roundcube saves Sent itself; raw SMTP does not — we must IMAP APPEND).
 */
async function appendToSentFolder(cfg, mailOptions) {
  let connection;
  try {
    // MailComposer only wants MIME fields — strip SMTP transport-only keys
    const {
      envelope: _envelope,
      sender: _sender,
      ...composeOpts
    } = mailOptions;

    const raw = await new MailComposer({
      ...composeOpts,
      date: composeOpts.date || new Date(),
    })
      .compile()
      .build();

    connection = await imaps.connect(buildImapConfig(cfg));

    // Prefer resolved Sent box, then common cPanel/HostGator names
    const primary = await resolveImapBoxName(connection, 'sent');
    const tryBoxes = [
      ...new Set([primary, ...SENT_FOLDER_CANDIDATES]),
    ];

    let lastErr = null;
    for (const sentBox of tryBoxes) {
      try {
        // Pass Buffer (not utf8 string) so attachments stay valid
        await connection.append(raw, {
          mailbox: sentBox,
          flags: ['\\Seen'],
        });
        console.log(`[admin-mail] Saved sent copy → ${sentBox} (${cfg.user})`);
        return { savedToSent: true, sentBox };
      } catch (err) {
        lastErr = err;
      }
    }

    throw lastErr || new Error('No Sent folder accepted APPEND');
  } catch (err) {
    console.warn(`[admin-mail] Could not save copy to Sent for ${cfg.user}:`, err.message);
    return { savedToSent: false, sentError: err.message };
  } finally {
    try {
      if (connection) connection.end();
    } catch (_) {}
  }
}

/**
 * Lightweight list: HEADER + struct only (no full body / attachments bytes).
 * Open mail via getMessageByUid for full html/text/attachments.
 * folder=inbox (default) | sent
 */
export async function getInbox({
  mailbox,
  page = 1,
  limit = DEFAULT_INBOX_LIMIT,
  folder = 'inbox',
}) {
  const cfg = getMailbox(mailbox);
  const folderKey = normalizeFolderKey(folder);
  const pageNum = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(MAX_INBOX_LIMIT, Math.max(1, Number(limit) || DEFAULT_INBOX_LIMIT));

  let connection;
  try {
    connection = await imaps.connect(buildImapConfig(cfg));
    const boxName = await resolveImapBoxName(connection, folderKey);
    const box = await connection.openBox(boxName);
    const total = Number(box.messages?.total) || 0;

    if (total === 0) {
      return {
        mailbox: cfg.user,
        folder: folderKey,
        boxName,
        page: pageNum,
        limit: pageSize,
        total: 0,
        messages: [],
      };
    }

    // Newest first via sequence numbers (1 = oldest, total = newest)
    const startOffset = (pageNum - 1) * pageSize;
    const seqHigh = total - startOffset;
    const seqLow = Math.max(1, seqHigh - pageSize + 1);

    if (seqHigh < 1) {
      return {
        mailbox: cfg.user,
        folder: folderKey,
        boxName,
        page: pageNum,
        limit: pageSize,
        total,
        messages: [],
      };
    }

    // HEADER only — fast list like Gmail/Roundcube row view
    const fetched = await connection.search([`${seqLow}:${seqHigh}`], {
      bodies: ['HEADER'],
      struct: true,
      markSeen: false,
    });

    const parsedRows = [];
    for (const msg of fetched) {
      const uid = msg.attributes?.uid;
      const seq = msg.attributes?.seq || msg.seqno;
      const headerPart =
        msg.parts?.find((p) => p.which === 'HEADER') ||
        msg.parts?.find((p) => String(p.which || '').toUpperCase().includes('HEADER'));
      if (!headerPart) continue;

      // imap-simple already parses HEADER into an object — do not simpleParser it
      const headers = parseImapHeaderPart(headerPart.body);
      if (!headers) continue;

      const flags = msg.attributes?.flags || [];

      parsedRows.push({
        _seq: typeof seq === 'number' ? seq : 0,
        uid,
        messageId: headers.messageId,
        from: headers.from,
        to: headers.to,
        cc: headers.cc,
        subject: headers.subject,
        date: headers.date,
        hasAttachments: structHasAttachment(msg.attributes?.struct),
        seen: flags.includes('\\Seen'),
      });
    }

    parsedRows.sort((a, b) => {
      if (b._seq !== a._seq) return b._seq - a._seq;
      const bd = a.date ? new Date(a.date).getTime() : 0;
      const ad = b.date ? new Date(b.date).getTime() : 0;
      return ad - bd;
    });

    const messages = parsedRows.map(({ _seq, ...rest }) => rest);

    return {
      mailbox: cfg.user,
      folder: folderKey,
      boxName,
      page: pageNum,
      limit: pageSize,
      total,
      messages,
    };
  } finally {
    try {
      if (connection) connection.end();
    } catch (_) {}
  }
}

/**
 * Fetch one message by IMAP UID (for reply UI / parent headers + attachment list).
 * folder=inbox|sent
 */
export async function getMessageByUid({ mailbox, uid, folder = 'inbox' }) {
  const cfg = getMailbox(mailbox);
  const uidNum = Number(uid);
  if (!Number.isFinite(uidNum) || uidNum < 1) {
    const err = new Error('Valid uid is required');
    err.statusCode = 400;
    throw err;
  }

  const folderKey = normalizeFolderKey(folder);
  const { parsed, boxName } = await fetchParsedByUid(cfg, uidNum, folderKey);
  const attachmentMeta = mapAttachmentMeta(parsed.attachments);

  return {
    mailbox: cfg.user,
    folder: folderKey,
    boxName,
    uid: uidNum,
    messageId: (parsed.messageId || '').trim(),
    from: addrText(parsed.from),
    to: addrText(parsed.to),
    cc: addrText(parsed.cc),
    subject: parsed.subject || '',
    date: parsed.date || null,
    text: parsed.text || '',
    html: parsed.html || '',
    hasAttachments: attachmentMeta.length > 0,
    attachments: attachmentMeta,
    references: parsed.references
      ? Array.isArray(parsed.references)
        ? parsed.references
        : [parsed.references]
      : [],
  };
}

/**
 * Download one attachment by mailbox + uid + index (from attachments[] meta).
 * folder=inbox|sent
 */
export async function getAttachment({ mailbox, uid, index, folder = 'inbox' }) {
  const cfg = getMailbox(mailbox);
  const uidNum = Number(uid);
  const idx = Number(index);

  if (!Number.isFinite(uidNum) || uidNum < 1) {
    const err = new Error('Valid uid is required');
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isFinite(idx) || idx < 0) {
    const err = new Error('Valid attachment index is required');
    err.statusCode = 400;
    throw err;
  }

  const { parsed } = await fetchParsedByUid(cfg, uidNum, normalizeFolderKey(folder));
  const att = parsed.attachments?.[idx];
  if (!att || !att.content) {
    const err = new Error('Attachment not found');
    err.statusCode = 404;
    throw err;
  }

  return {
    mailbox: cfg.user,
    folder: normalizeFolderKey(folder),
    uid: uidNum,
    index: idx,
    filename: att.filename || att.cid || `attachment-${idx + 1}`,
    contentType: att.contentType || 'application/octet-stream',
    size: att.size || att.content.length || 0,
    content: att.content, // Buffer
  };
}

/**
 * Send a new email from the selected admin mailbox (SMTP).
 * Also saves a copy into IMAP Sent folder.
 * attachments: multer files [{ originalname, buffer, mimetype }]
 */
export async function sendMail({
  mailbox,
  to,
  cc,
  bcc,
  subject,
  html,
  text,
  replyTo,
  attachments,
}) {
  const cfg = getMailbox(mailbox);
  if (!to || !subject || (!html && !text)) {
    const err = new Error('to, subject and html|text are required');
    err.statusCode = 400;
    throw err;
  }

  const transporter = createSmtpTransport(cfg);
  const mailOptions = {
    from: `"${cfg.label}" <${cfg.user}>`,
    sender: cfg.user,
    replyTo: replyTo || cfg.user,
    envelope: {
      from: cfg.user,
      to: [to, cc, bcc].filter(Boolean).join(','),
    },
    to,
    cc: cc || undefined,
    bcc: bcc || undefined,
    subject,
    text: text || stripHtml(html),
    html: html || undefined,
    attachments: toNodemailerAttachments(attachments),
  };

  const info = await transporter.sendMail(mailOptions);
  const sentSave = await appendToSentFolder(cfg, mailOptions);

  return {
    mailbox: cfg.user,
    messageId: info.messageId,
    response: info.response,
    attachmentCount: (attachments || []).length,
    ...sentSave,
  };
}

/**
 * Reply to an existing message. Prefer uid (fetches parent via IMAP);
 * or pass replyToMessageId + to + subject manually.
 * Also saves a copy into IMAP Sent folder.
 */
export async function replyMail({
  mailbox,
  uid,
  to,
  cc,
  subject,
  html,
  text,
  replyToMessageId,
  references,
  attachments,
  folder = 'inbox',
}) {
  if (!html && !text) {
    const err = new Error('html|text is required');
    err.statusCode = 400;
    throw err;
  }

  const cfg = getMailbox(mailbox);
  let parent = null;

  if (uid != null && uid !== '') {
    parent = await getMessageByUid({ mailbox, uid, folder });
  }

  const inReplyTo = (replyToMessageId || parent?.messageId || '').trim();
  if (!inReplyTo) {
    const err = new Error('replyToMessageId or uid (of parent mail) is required');
    err.statusCode = 400;
    throw err;
  }

  const replyToAddr =
    to ||
    (parent?.from
      ? parent.from.match(/<([^>]+)>/)?.[1] || parent.from
      : '');

  if (!replyToAddr) {
    const err = new Error('to is required when parent from cannot be resolved');
    err.statusCode = 400;
    throw err;
  }

  const refs = [];
  if (references) {
    if (Array.isArray(references)) refs.push(...references);
    else refs.push(references);
  }
  if (parent?.references?.length) refs.push(...parent.references);
  if (parent?.messageId) refs.push(parent.messageId);
  if (inReplyTo) refs.push(inReplyTo);
  const uniqueRefs = [...new Set(refs.map((r) => String(r).trim()).filter(Boolean))];

  const transporter = createSmtpTransport(cfg);
  const mailOptions = {
    from: `"${cfg.label}" <${cfg.user}>`,
    sender: cfg.user,
    replyTo: cfg.user,
    envelope: {
      from: cfg.user,
      to: [replyToAddr, cc].filter(Boolean).join(','),
    },
    to: replyToAddr,
    cc: cc || undefined,
    subject: ensureReSubject(subject || parent?.subject),
    text: text || stripHtml(html),
    html: html || undefined,
    inReplyTo,
    references: uniqueRefs.length ? uniqueRefs.join(' ') : undefined,
    attachments: toNodemailerAttachments(attachments),
  };

  const info = await transporter.sendMail(mailOptions);
  const sentSave = await appendToSentFolder(cfg, mailOptions);

  return {
    mailbox: cfg.user,
    messageId: info.messageId,
    inReplyTo,
    response: info.response,
    attachmentCount: (attachments || []).length,
    ...sentSave,
  };
}

export default {
  listMailboxes,
  getMailbox,
  getInbox,
  getMessageByUid,
  getAttachment,
  sendMail,
  replyMail,
};
