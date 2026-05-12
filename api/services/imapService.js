import path from 'path';
import fs from 'fs/promises';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import MailAccount from '../models/mailAccount.model.js';
import EmailActivity from '../models/emailActivity.model.js';
import Lead from '../models/lead.model.js';
import { decryptSecret } from '../utils/mailCrypto.js';
import { getIO } from '../socket/socket.js';

const ATTACHMENT_ROOT = path.join(process.cwd(), 'uploads', 'email-attachments');

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true });
};

const buildImapConfig = (account, decryptedPassword) => ({
  imap: {
    user: account.emailAddress,
    password: decryptedPassword,
    host: account.imapHost,
    port: account.imapPort,
    tls: account.imapSecure,
    tlsOptions: { rejectUnauthorized: false, servername: account.imapHost },
    authTimeout: 15000,
    connTimeout: 20000,
  },
});

/**
 * Test IMAP credentials without saving anything. Used at "Connect" step.
 * Returns { ok: true } or throws an Error with a readable message.
 */
export const testImapConnection = async ({
  emailAddress,
  password,
  imapHost,
  imapPort = 993,
  imapSecure = true,
}) => {
  const config = {
    imap: {
      user: emailAddress,
      password,
      host: imapHost,
      port: imapPort,
      tls: imapSecure,
      tlsOptions: { rejectUnauthorized: false, servername: imapHost },
      authTimeout: 15000,
      connTimeout: 20000,
    },
  };
  const connection = await imaps.connect(config);
  try {
    await connection.openBox('INBOX');
  } finally {
    try { connection.end(); } catch (_) {}
  }
  return { ok: true };
};

/**
 * Convert mailparser address object/array to plain string.
 */
const addrText = (addr) => {
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
};

const extractEmailFromHeader = (headerText) => {
  if (!headerText) return '';
  const match = headerText.match(/<([^>]+)>/);
  return (match ? match[1] : headerText).trim().toLowerCase();
};

/**
 * Find an existing thread id by walking In-Reply-To / References.
 */
const resolveThread = async (userId, parsed) => {
  const refs = [];
  if (parsed.inReplyTo) refs.push(parsed.inReplyTo);
  if (parsed.references) {
    const r = Array.isArray(parsed.references) ? parsed.references : [parsed.references];
    refs.push(...r);
  }
  if (refs.length === 0) return null;

  const existing = await EmailActivity.findOne({
    userId,
    gmailMessageId: { $in: refs },
  }).select('gmailThreadId leadId');

  return existing || null;
};

/**
 * Find a lead by sender email address (fallback when no thread match).
 */
const findLeadByEmail = async (emailAddr) => {
  if (!emailAddr) return null;
  const clean = emailAddr.toLowerCase().trim();
  return Lead.findOne({ email: new RegExp(`^${clean}$`, 'i') }).select('_id');
};

/**
 * Save attachments to disk under uploads/email-attachments/<userId>/<messageIdSafe>/
 * Returns array of metadata objects for EmailActivity.
 */
const persistAttachments = async (userId, messageId, attachments) => {
  if (!attachments || attachments.length === 0) return [];
  const safeMid = String(messageId).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64);
  const dir = path.join(ATTACHMENT_ROOT, String(userId), safeMid);
  await ensureDir(dir);

  const out = [];
  for (const att of attachments) {
    const safeName = (att.filename || `attachment-${Date.now()}`)
      .replace(/[/\\?%*:|"<>]/g, '_')
      .slice(0, 200);
    const full = path.join(dir, safeName);
    try {
      await fs.writeFile(full, att.content);
      out.push({
        filename: safeName,
        mimeType: att.contentType || 'application/octet-stream',
        size: att.size || (att.content ? att.content.length : 0),
        attachmentId: att.cid || safeName,
        storagePath: path.relative(process.cwd(), full).replace(/\\/g, '/'),
      });
    } catch (err) {
      console.warn(`[webmail] Failed to save attachment ${safeName}:`, err.message);
    }
  }
  return out;
};

const emitNewEmail = (userId, payload) => {
  try {
    const io = getIO();
    if (io) io.to(`user:${userId}`).emit('webmail:new', payload);
  } catch (_) {}
};

/**
 * Sync a single MailAccount.
 * Fetches messages with UID > account.lastUid, parses, threads, links, saves.
 */
export const syncMailAccount = async (account) => {
  // Re-load with the password field
  const full = await MailAccount.findById(account._id).select('+encryptedPassword');
  if (!full || !full.isActive) {
    return { synced: 0, skipped: true };
  }

  let password;
  try {
    password = decryptSecret(full.encryptedPassword);
  } catch (err) {
    console.error(`[webmail] Cannot decrypt password for ${full.emailAddress}:`, err.message);
    await MailAccount.findByIdAndUpdate(full._id, {
      lastSyncStatus: 'error',
      syncError: 'Decryption failed (key rotated?)',
      $inc: { consecutiveFailures: 1 },
    });
    return { synced: 0, error: 'decrypt' };
  }

  let connection;
  try {
    connection = await imaps.connect(buildImapConfig(full, password));
    await connection.openBox('INBOX');

    const since = full.lastUid && full.lastUid > 0
      ? [['UID', `${full.lastUid + 1}:*`]]
      : ['ALL'];

    const searchCriteria = since;
    const fetchOptions = {
      bodies: [''],
      struct: true,
      markSeen: false,
    };

    const messages = await connection.search(searchCriteria, fetchOptions);

    // imap-simple returns ALL matching when no new uids exist; filter explicitly
    const newOnes = messages.filter((m) => {
      const uid = m.attributes && m.attributes.uid;
      return typeof uid === 'number' && uid > (full.lastUid || 0);
    });

    if (newOnes.length === 0) {
      await MailAccount.findByIdAndUpdate(full._id, {
        lastSyncAt: new Date(),
        lastSyncStatus: 'ok',
        syncError: '',
        consecutiveFailures: 0,
      });
      return { synced: 0 };
    }

    let savedCount = 0;
    let maxUid = full.lastUid || 0;

    for (const msg of newOnes) {
      const uid = msg.attributes.uid;
      const rawPart = msg.parts.find((p) => p.which === '');
      if (!rawPart) continue;

      let parsed;
      try {
        parsed = await simpleParser(rawPart.body);
      } catch (err) {
        console.warn(`[webmail] Parse failed for UID ${uid}:`, err.message);
        if (uid > maxUid) maxUid = uid;
        continue;
      }

      const messageId = (parsed.messageId || `<imap-${uid}-${Date.now()}@${full.imapHost}>`).trim();

      // Skip if already saved
      const exists = await EmailActivity.findOne({
        userId: full.userId,
        gmailMessageId: messageId,
      }).select('_id');
      if (exists) {
        if (uid > maxUid) maxUid = uid;
        continue;
      }

      const thread = await resolveThread(full.userId, parsed);

      const fromText = addrText(parsed.from);
      const toText = addrText(parsed.to);
      const ccText = addrText(parsed.cc);
      const bccText = addrText(parsed.bcc);
      const fromEmail = extractEmailFromHeader(fromText);

      // Direction
      const direction =
        fromEmail === full.emailAddress.toLowerCase() ? 'OUTBOUND' : 'INBOUND';

      // Lead linking
      let leadId = thread ? thread.leadId : null;
      if (!leadId) {
        const lead = await findLeadByEmail(direction === 'INBOUND' ? fromEmail : extractEmailFromHeader(toText));
        if (lead) leadId = lead._id;
      }

      const attachments = await persistAttachments(full.userId, messageId, parsed.attachments || []);

      const doc = await EmailActivity.create({
        leadId: leadId || undefined,
        userId: full.userId,
        gmailMessageId: messageId,
        gmailThreadId: thread ? thread.gmailThreadId : messageId,
        direction,
        from: fromText || full.emailAddress,
        to: toText || full.emailAddress,
        cc: ccText,
        bcc: bccText,
        subject: parsed.subject || '',
        body: parsed.text || '',
        htmlBody: parsed.html || '',
        attachments,
        imapUid: uid,
        isRead: direction === 'OUTBOUND',
      });

      // Update lead.lastEmailAt + (set gmailThreadId if missing)
      if (leadId) {
        try {
          await Lead.findOneAndUpdate(
            { _id: leadId, gmailThreadId: { $exists: false } },
            { gmailThreadId: doc.gmailThreadId }
          );
          await Lead.findByIdAndUpdate(leadId, { lastEmailAt: new Date() });
        } catch (_) {}
      }

      emitNewEmail(String(full.userId), {
        _id: doc._id,
        from: doc.from,
        subject: doc.subject,
        direction: doc.direction,
        leadId: doc.leadId,
        threadId: doc.gmailThreadId,
        createdAt: doc.createdAt,
      });

      savedCount++;
      if (uid > maxUid) maxUid = uid;
    }

    await MailAccount.findByIdAndUpdate(full._id, {
      lastUid: maxUid,
      lastSyncAt: new Date(),
      lastSyncStatus: 'ok',
      syncError: '',
      consecutiveFailures: 0,
    });

    return { synced: savedCount, lastUid: maxUid };
  } catch (err) {
    console.error(`[webmail] Sync error for ${full.emailAddress}:`, err.message);
    const failures = (full.consecutiveFailures || 0) + 1;
    const update = {
      lastSyncStatus: 'error',
      syncError: err.message || String(err),
      consecutiveFailures: failures,
    };
    if (failures >= 10) update.isActive = false;
    await MailAccount.findByIdAndUpdate(full._id, update);
    return { synced: 0, error: err.message };
  } finally {
    if (connection) {
      try { connection.end(); } catch (_) {}
    }
  }
};

/**
 * Sync all active accounts with a concurrency cap.
 * Called by the 60-second cron job.
 */
export const syncAllAccounts = async ({ concurrency = 5 } = {}) => {
  const accounts = await MailAccount.find({ isActive: true }).select('_id');
  if (accounts.length === 0) return { total: 0, synced: 0 };

  let totalSynced = 0;
  let idx = 0;

  const worker = async () => {
    while (idx < accounts.length) {
      const cur = accounts[idx++];
      try {
        const result = await syncMailAccount(cur);
        totalSynced += result.synced || 0;
      } catch (err) {
        console.error(`[webmail] worker error for ${cur._id}:`, err.message);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, accounts.length) }, worker));
  return { total: accounts.length, synced: totalSynced };
};
