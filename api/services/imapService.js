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
 * Find an existing thread by walking In-Reply-To / References.
 * If a companyName is provided, restrict to threads in the SAME company so
 * brand-A reply chains never auto-route into brand-B inboxes.
 */
const resolveThread = async (parsed, companyName) => {
  const refs = [];
  if (parsed.inReplyTo) refs.push(parsed.inReplyTo);
  if (parsed.references) {
    const r = Array.isArray(parsed.references) ? parsed.references : [parsed.references];
    refs.push(...r);
  }
  if (refs.length === 0) return null;

  const query = { gmailMessageId: { $in: refs } };
  if (companyName) query.companyName = companyName;

  const existing = await EmailActivity.findOne(query)
    .sort({ createdAt: -1 })
    .select('gmailThreadId leadId userId');

  return existing || null;
};

/**
 * Find a lead by sender email address (optionally scoped to a company).
 */
const findLeadByEmail = async (emailAddr) => {
  if (!emailAddr) return null;
  const clean = emailAddr.toLowerCase().trim();
  return Lead.findOne({ email: new RegExp(`^${clean}$`, 'i') }).select('_id assignedUserId');
};

/**
 * 3-rule routing engine. Scoped per company so brands stay isolated.
 *   1. If reply (In-Reply-To matches in SAME company), inherit owner + leadId + threadId.
 *   2. Else if sender email matches a Lead AND that lead's assigned maker is in this company, inherit.
 *   3. Else userId/leadId = null → goes to Shared / Unassigned inbox (of this company).
 */
const resolveOwnerAndLead = async ({ parsed, fromEmail, messageId, companyName }) => {
  const thread = await resolveThread(parsed, companyName);
  if (thread) {
    return {
      userId: thread.userId || null,
      leadId: thread.leadId || null,
      threadId: thread.gmailThreadId || messageId,
      isReply: true,
    };
  }

  const lead = await findLeadByEmail(fromEmail);
  if (lead) {
    // If we know the company, verify the lead's assigned maker is in the same company.
    let assignedUserId = lead.assignedUserId || null;
    if (companyName && assignedUserId) {
      try {
        const assignedMaker = await (await import('../models/maker.model.js')).default
          .findById(assignedUserId)
          .select('companyName');
        if (!assignedMaker || assignedMaker.companyName !== companyName) {
          assignedUserId = null; // maker is in a different company — leave unassigned
        }
      } catch (_) {}
    }
    return {
      userId: assignedUserId,
      leadId: lead._id,
      threadId: messageId,
      isReply: false,
    };
  }

  return { userId: null, leadId: null, threadId: messageId, isReply: false };
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

      // Dedup — same messageId already exists in DB (any user)
      const exists = await EmailActivity.findOne({ gmailMessageId: messageId }).select('_id');
      if (exists) {
        if (uid > maxUid) maxUid = uid;
        continue;
      }

      const fromText = addrText(parsed.from);
      const toText = addrText(parsed.to);
      const ccText = addrText(parsed.cc);
      const bccText = addrText(parsed.bcc);
      const fromEmail = extractEmailFromHeader(fromText);

      const direction =
        fromEmail === full.emailAddress.toLowerCase() ? 'OUTBOUND' : 'INBOUND';

      // 3-rule routing engine (scoped per company)
      const route = await resolveOwnerAndLead({
        parsed,
        fromEmail: direction === 'INBOUND' ? fromEmail : extractEmailFromHeader(toText),
        messageId,
        companyName: full.companyName || '',
      });

      // For legacy per-user mailbox accounts, force owner = mailbox owner if router didn't resolve
      const finalUserId =
        route.userId || (full.isShared ? null : full.userId);

      const attachments = await persistAttachments(
        finalUserId || 'shared',
        messageId,
        parsed.attachments || []
      );

      const doc = await EmailActivity.create({
        leadId: route.leadId || undefined,
        userId: finalUserId || undefined,
        gmailMessageId: messageId,
        gmailThreadId: route.threadId,
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
        companyName: full.companyName || '',
        isRead: direction === 'OUTBOUND',
      });

      if (route.leadId) {
        try {
          await Lead.findOneAndUpdate(
            { _id: route.leadId, gmailThreadId: { $exists: false } },
            { gmailThreadId: doc.gmailThreadId }
          );
          await Lead.findByIdAndUpdate(route.leadId, { lastEmailAt: new Date() });
        } catch (_) {}
      }

      // Push real-time notification: to owner if known, else to shared room
      if (finalUserId) {
        emitNewEmail(String(finalUserId), {
          _id: doc._id,
          from: doc.from,
          subject: doc.subject,
          direction: doc.direction,
          leadId: doc.leadId,
          threadId: doc.gmailThreadId,
          createdAt: doc.createdAt,
        });
      } else {
        try {
          const io = getIO();
          if (io) {
            const room = full.companyName
              ? `webmail:shared:${full.companyName}`
              : 'webmail:shared';
            io.to(room).emit('webmail:shared:new', {
              _id: doc._id,
              from: doc.from,
              subject: doc.subject,
              companyName: full.companyName || '',
              createdAt: doc.createdAt,
            });
          }
        } catch (_) {}
      }

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
