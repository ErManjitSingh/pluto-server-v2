import express from 'express';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import WhatsappMessage from '../models/whatsappMessage.model.js';
import WhatsappOutboundMedia from '../models/whatsappOutboundMedia.model.js';
import WhatsappInboundMedia from '../models/whatsappInboundMedia.model.js';
import Lead from '../models/lead.model.js';
import Maker from '../models/maker.model.js';
import { getIO } from '../socket/socket.js';
import { storeIncomingWhatsappMediaFromMeta, WHATSAPP_INBOUND_DIR } from '../utils/whatsappMediaUrl.js';
import { createCalendarEvent } from '../services/googleCalendar.service.js';
import { verifyToken } from '../utils/verifyUser.js';
import { whatsappOutboundUpload, WHATSAPP_OUTBOUND_DIR } from '../middleware/whatsappMediaUpload.js';

const router = express.Router();

function isValidObjectId(id) {
  if (!id || typeof id !== 'string') return false;
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
}

function normalizePhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '').slice(-10);
}

const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

/** Latest lead createdAt per normalized mobile (last 10 digits). */
function buildLatestLeadCreatedAtByPhone(leads) {
  const map = new Map();
  for (const lead of leads) {
    const norm = normalizePhone(lead.mobile);
    if (!norm) continue;
    const createdAtMs = new Date(lead.createdAt).getTime();
    if (Number.isNaN(createdAtMs)) continue;
    const prev = map.get(norm);
    if (prev == null || createdAtMs > prev) map.set(norm, createdAtMs);
  }
  return map;
}

/** Skip when a lead exists for this phone and that lead is older than 10 days. */
function shouldSkipPhoneForUnassignedFirst(normPhone, latestLeadByPhone, now = Date.now()) {
  const latestLeadCreatedAt = latestLeadByPhone.get(normPhone);
  if (latestLeadCreatedAt == null) return false;
  return now - latestLeadCreatedAt >= TEN_DAYS_MS;
}

/** Meta `value.statuses[].errors` when delivery fails — persist for CRM / debugging. */
function metaStatusErrorsForStorage(status) {
  const raw = status?.errors;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw.map((e) => ({
    code: e.code != null ? e.code : null,
    title: e.title != null ? String(e.title) : null,
    message: e.message != null ? String(e.message) : null,
    errorData: e.error_data != null ? e.error_data : null,
    href: e.href != null ? String(e.href) : null,
  }));
}

const WHATSAPP_MEDIA_TYPES = ['document', 'image', 'video', 'audio'];

function filenameFromMediaUrl(link) {
  try {
    const u = new URL(link);
    const base = u.pathname.split('/').filter(Boolean).pop();
    if (base && base.includes('.')) return decodeURIComponent(base);
  } catch {
    /* ignore */
  }
  return 'attachment';
}

/** Emit new message to generic room + view-specific rooms so subscribed clients get real-time updates */
function emitWhatsappMessageToViewRooms(messagePayload) {
  const io = getIO();
  if (!io) return;
  io.to('whatsapp').emit('whatsapp:message:new', messagePayload);
  io.to('whatsapp:all').emit('whatsapp:message:new', messagePayload);
  io.to(`whatsapp:by-phone:${messagePayload.phone}`).emit('whatsapp:message:new', messagePayload);
  if (!messagePayload.assignedTo) {
    io.to('whatsapp:unassigned').emit('whatsapp:message:new', messagePayload);
  } else {
    const assignedId = messagePayload.assignedTo?._id ?? messagePayload.assignedTo;
    if (assignedId) io.to(`whatsapp:by-assigned:${assignedId}`).emit('whatsapp:message:new', messagePayload);
  }
}

/** After Graph resolves temporary media URL — same rooms as new message */
function emitWhatsappMessageUpdatedToViewRooms(messagePayload) {
  const io = getIO();
  if (!io) return;
  io.to('whatsapp').emit('whatsapp:message:updated', messagePayload);
  io.to('whatsapp:all').emit('whatsapp:message:updated', messagePayload);
  io.to(`whatsapp:by-phone:${messagePayload.phone}`).emit('whatsapp:message:updated', messagePayload);
  if (!messagePayload.assignedTo) {
    io.to('whatsapp:unassigned').emit('whatsapp:message:updated', messagePayload);
    io.to('whatsapp:unassigned:filtered').emit('whatsapp:message:updated', messagePayload);
    io.to('whatsapp:unassigned:first').emit('whatsapp:message:updated', messagePayload);
  } else {
    const assignedId = messagePayload.assignedTo?._id ?? messagePayload.assignedTo;
    if (assignedId) io.to(`whatsapp:by-assigned:${assignedId}`).emit('whatsapp:message:updated', messagePayload);
  }
}

/**
 * Executive real-time notification.
 * Used for badges / popup alerts when a new customer message arrives.
 */
function emitWhatsappExecNotification(messagePayload) {
  const io = getIO();
  if (!io) return;
  const assignedId = messagePayload?.assignedTo?._id ?? messagePayload?.assignedTo;
  if (!assignedId) return;

  const notificationPayload = { ...messagePayload, source: 'whatsapp' };
  io.to(`user:${assignedId}`).emit('whatsapp:exec-notification:new', notificationPayload);
  io.to(`whatsapp:exec-notifications:${assignedId}`).emit(
    'whatsapp:exec-notification:new',
    notificationPayload
  );
}

function buildIncomingWhatsappMessageCreatePayload(message) {
  const type = message?.type || 'unknown';

  if (type === 'text') {
    return {
      phone: message.from,
      message: message.text?.body || '',
      direction: 'incoming',
      metaMessageId: message.id || null,
      messageType: 'text',
      mediaUrl: null,
      caption: null,
      filename: null,
      metaMediaId: null,
      mimeType: null,
    };
  }

  const mediaKinds = ['image', 'document', 'video', 'audio'];
  if (mediaKinds.includes(type)) {
    const block = message[type] || {};
    const metaMediaId = block.id ? String(block.id) : null;
    const caption = block.caption != null ? String(block.caption) : null;
    const filename = type === 'document' && block.filename != null ? String(block.filename) : null;
    const mimeType = block.mime_type != null ? String(block.mime_type) : null;
    const labelParts = [`[${type}]`];
    if (filename) labelParts.push(filename);
    if (caption) labelParts.push(caption);
    return {
      phone: message.from,
      message: labelParts.join(' ').replace(/\s+/g, ' ').trim(),
      direction: 'incoming',
      metaMessageId: message.id || null,
      messageType: type,
      mediaUrl: null,
      caption,
      filename,
      metaMediaId,
      mimeType,
    };
  }

  return {
    phone: message.from,
    message: `[${type}]`,
    direction: 'incoming',
    metaMessageId: message.id || null,
    messageType: 'text',
    mediaUrl: null,
    caption: null,
    filename: null,
    metaMediaId: null,
    mimeType: null,
  };
}

async function latestAssignedExecutiveForPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  const last10 = digits.slice(-10);
  const phoneCandidates = Array.from(
    new Set([digits, last10, `91${last10}`, `910${last10}`, `0${last10}`])
  );
  const latestOutgoing = await WhatsappMessage.findOne({
    phone: { $in: phoneCandidates },
    direction: 'outgoing',
    assignedTo: { $ne: null },
  })
    .sort({ createdAt: -1 })
    .select('assignedTo')
    .lean();
  return latestOutgoing?.assignedTo || null;
}

async function notifyIncomingWhatsappOnGoogleCalendar(messagePayload) {
  const assignedId = messagePayload?.assignedTo?._id ?? messagePayload?.assignedTo;
  if (!assignedId) return;
  try {
    const makerForCalendar = await Maker.findById(String(assignedId)).select('googleRefreshToken');
    if (!makerForCalendar?.googleRefreshToken) return;
    await createCalendarEvent(makerForCalendar, {
      lead: {
        name: `WhatsApp ${messagePayload.phone || ''}`.trim(),
        mobile: messagePayload.phone || null,
      },
      leadstatus: 'Incoming WhatsApp',
      note: messagePayload.message || 'New incoming WhatsApp message',
      startDate: new Date(Date.now() + 12 * 60 * 1000),
      timing: 'assignment',
      durationMinutes: 1,
      summaryPrefix: 'WhatsApp incoming message',
      transparency: 'transparent',
    });
  } catch (calendarError) {
    console.error(
      'Google Calendar WhatsApp notification failed:',
      calendarError?.message || calendarError
    );
  }
}

function publicApiBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || process.env.API_PUBLIC_URL || '').replace(/\/+$/, '');
}

/** Download from Meta with token, save to disk + MongoDB, set mediaUrl to our public link (opens in browser). */
function scheduleFetchAndStoreIncomingWhatsappMedia(docId, createPayload) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const metaMediaId = createPayload.metaMediaId;
  if (!metaMediaId || !accessToken) return;
  setImmediate(() => {
    (async () => {
      const stored = await storeIncomingWhatsappMediaFromMeta(metaMediaId, accessToken, {
        hintMime: createPayload.mimeType,
        hintFilename: createPayload.filename,
      });
      if (!stored) return;
      await WhatsappInboundMedia.create({
        token: stored.token,
        storedFilename: stored.storedFilename,
        originalFilename: stored.originalFilename,
        mimeType: stored.mimeType,
        size: stored.size,
        whatsappMessageId: docId,
      });
      const base = publicApiBaseUrl();
      const pathPart = `/api/whatsapp/inbound-received/${stored.token}`;
      const mediaUrl = base ? `${base}${pathPart}` : pathPart;
      const setFields = { mediaUrl };
      if (!createPayload.filename) {
        setFields.filename = stored.originalFilename;
      }
      await WhatsappMessage.updateOne({ _id: docId }, { $set: setFields });
      const updated = await WhatsappMessage.findById(docId).populate('assignedTo', 'name email').lean();
      if (updated) emitWhatsappMessageUpdatedToViewRooms(updated);
    })().catch((e) => console.error('Incoming WhatsApp media store:', e));
  });
}

/** Emit message deleted to view rooms so clients can remove it from their list */
function emitWhatsappMessageDeleted(deletedPayload) {
  const io = getIO();
  if (!io) return;
  const { _id, phone, assignedTo } = deletedPayload;
  io.to('whatsapp').emit('whatsapp:message:deleted', { _id });
  io.to('whatsapp:all').emit('whatsapp:message:deleted', { _id });
  if (phone) io.to(`whatsapp:by-phone:${phone}`).emit('whatsapp:message:deleted', { _id });
  if (!assignedTo) {
    io.to('whatsapp:unassigned').emit('whatsapp:message:deleted', { _id });
    io.to('whatsapp:unassigned:filtered').emit('whatsapp:message:deleted', { _id });
    io.to('whatsapp:unassigned:first').emit('whatsapp:message:deleted', { _id });
  } else {
    const assignedId = assignedTo?._id ?? assignedTo;
    if (assignedId) io.to(`whatsapp:by-assigned:${assignedId}`).emit('whatsapp:message:deleted', { _id });
  }
}

/** Notify unassigned rooms that a message was assigned (removed from unassigned lists) */
function emitWhatsappMessageLeftUnassigned(messageId) {
  const io = getIO();
  if (!io) return;
  io.to('whatsapp:unassigned').emit('whatsapp:message:deleted', { _id: messageId });
  io.to('whatsapp:unassigned:filtered').emit('whatsapp:message:deleted', { _id: messageId });
  io.to('whatsapp:unassigned:first').emit('whatsapp:message:deleted', { _id: messageId });
}

// Same value as in Meta Configuration → Verify token
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'plutotours123';

/**
 * GET /webhook — Meta calls this to verify your webhook URL.
 * In browser/Postman without query params you get 403 — that's correct.
 * Test with: ?hub.mode=subscribe&hub.verify_token=plutotours123&hub.challenge=12345
 */
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

/**
 * POST /webhook — Meta sends incoming WhatsApp messages here.
 * Saves phone + message to MongoDB for CRM.
 */
router.post('/webhook', async (req, res) => {
  const value = req.body.entry?.[0]?.changes?.[0]?.value;

  // Handle Incoming Message
  if (value?.messages) {
    const message = value.messages[0];

    const createPayload = buildIncomingWhatsappMessageCreatePayload(message);
    createPayload.assignedTo = await latestAssignedExecutiveForPhone(createPayload.phone);
    const doc = await WhatsappMessage.create(createPayload);

    if (createPayload.metaMediaId) {
      scheduleFetchAndStoreIncomingWhatsappMedia(doc._id, createPayload);
    }

    const messagePayload = await WhatsappMessage.findById(doc._id)
      .populate('assignedTo', 'name email')
      .lean();
    await notifyIncomingWhatsappOnGoogleCalendar(messagePayload);
    emitWhatsappMessageToViewRooms(messagePayload);
    emitWhatsappExecNotification(messagePayload);

    // Real-time for filtered unassigned: emit only if this message would appear in GET /message/unassigned
    const io = getIO();
    if (io && !messagePayload.assignedTo) {
      try {
        const leads = await Lead.find({ mobile: { $exists: true, $ne: null } })
          .select('mobile')
          .lean();
        const leadPhoneSet = new Set(
          leads.map((l) => normalizePhone(l.mobile)).filter(Boolean)
        );
        const normPhone = normalizePhone(doc.phone);
        if (normPhone && !leadPhoneSet.has(normPhone)) {
          const firstFromThisPhone = await WhatsappMessage.countDocuments({
            phone: doc.phone,
            assignedTo: null,
            direction: 'incoming',
          });
          if (firstFromThisPhone === 1) {
            io.to('whatsapp:unassigned:filtered').emit(
              'whatsapp:message:unassigned:filtered:new',
              messagePayload
            );
          }
        }
        // Real-time for first-per-phone unassigned: emit when this is the first unassigned from this phone
        const firstUnassignedFromPhone = await WhatsappMessage.countDocuments({
          phone: doc.phone,
          assignedTo: null,
        });
        if (firstUnassignedFromPhone === 1) {
          io.to('whatsapp:unassigned:first').emit(
            'whatsapp:message:unassigned:first:new',
            messagePayload
          );
        }
      } catch (e) {
        console.error('Filtered unassigned emit check:', e);
      }
    }

    console.log("✅ Incoming message saved");
  }

  // Handle Status Updates
  if (value?.statuses) {
    const status = value.statuses[0];
    const metaMessageId = status?.id ? String(status.id) : null;
    const statusType = String(status?.status || '').toLowerCase();
    if (metaMessageId && ['sent', 'delivered', 'read', 'failed'].includes(statusType)) {
      const statusErrors =
        statusType === 'failed' ? metaStatusErrorsForStorage(status) : null;
      if (statusType === 'failed') {
        console.log('📩 Status: failed for', metaMessageId, statusErrors || status?.errors || '(no errors array)');
      } else {
        console.log('📩 Status:', statusType, 'for', metaMessageId);
      }
      await WhatsappMessage.findOneAndUpdate(
        { metaMessageId, direction: 'outgoing' },
        {
          $set: {
            status: statusType,
            statusTimestamp: status.timestamp ? String(status.timestamp) : null,
            statusErrors,
          },
        }
      );

      const updated = await WhatsappMessage.findOne({ metaMessageId, direction: 'outgoing' })
        .populate('assignedTo', 'name email')
        .lean();

      if (updated) {
        emitWhatsappMessageUpdatedToViewRooms(updated);
      }
    }
  }

  res.sendStatus(200);
});

/**
 * GET /messages — CRM: list all WhatsApp messages (newest first).
 * Frontend: GET /api/whatsapp/messages
 */
router.get('/messages', async (req, res) => {
  try {
    const messages = await WhatsappMessage.find()
      .sort({ createdAt: -1 })
      .populate('assignedTo', 'name email')
      .lean();
    res.json(messages);
  } catch (err) {
    console.error('WhatsApp messages list error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /messages/by-phone/:phone — Get all messages for a specific customer phone.
 * Phone can be with or without country code (e.g. 917807150922 or 7807150922).
 */
router.get('/messages/by-phone/:phone', async (req, res) => {
  try {
    const raw = String(req.params.phone || '').replace(/\D/g, '');
    if (!raw) {
      return res.status(400).json({ success: false, message: 'Invalid phone' });
    }
    // Match exact phone or with 91 prefix (e.g. 7807150922 -> 917807150922)
    const query = raw.length <= 10 && !raw.startsWith('91')
      ? { $or: [ { phone: raw }, { phone: '91' + raw } ] }
      : { phone: raw };
    const messages = await WhatsappMessage.find(query)
      .sort({ createdAt: 1 })
      .populate('assignedTo', 'name email')
      .lean();
    res.json(messages);
  } catch (err) {
    console.error('WhatsApp messages by-phone error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /messages/unassigned — Get messages where assignedTo is null (unassigned conversations).
 * Returns unique phones with their latest message, newest first.
 */
router.get('/messages/unassigned', async (req, res) => {
  try {
    const messages = await WhatsappMessage.find({ assignedTo: null })
      .sort({ createdAt: -1 })
      .populate('assignedTo', 'name email')
      .lean();
    res.json(messages);
  } catch (err) {
    console.error('WhatsApp unassigned messages error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /messages/unassigned/first — Get first message (earliest) per phone where assignedTo is null.
 * - Deduplicates by phone (normalized last 10 digits: +91, 0780, 091… all match).
 * - Skip phone if Lead.mobile exists AND latest lead for that phone is older than 10 days.
 * - Include if no lead OR lead created within last 10 days.
 */
router.get('/messages/unassigned/first', async (req, res) => {
  try {
    const leads = await Lead.find({ mobile: { $exists: true, $ne: null } })
      .select('mobile createdAt')
      .lean();
    const latestLeadByPhone = buildLatestLeadCreatedAtByPhone(leads);

    const messages = await WhatsappMessage.find({ assignedTo: null, direction: 'incoming' })
      .sort({ createdAt: 1 })
      .populate('assignedTo', 'name email')
      .lean();

    const seenPhones = new Set();
    const result = [];

    for (const msg of messages) {
      const normPhone = normalizePhone(msg.phone);
      if (!normPhone) continue;
      if (shouldSkipPhoneForUnassignedFirst(normPhone, latestLeadByPhone)) continue;
      if (seenPhones.has(normPhone)) continue;
      seenPhones.add(normPhone);
      result.push(msg);
    }

    // For UI convenience, return newest first
    result.sort((a, b) => b.createdAt - a.createdAt);

    res.json(result);
  } catch (err) {
    console.error('WhatsApp first-unassigned-per-phone error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /message/unassigned — Filtered unassigned messages for WhatsApp inbox.
 * - Skip phones that already exist as leads (by Lead.mobile, normalized to last 10 digits).
 * - Only include the first incoming message we ever got from each phone.
 * - Final list is sorted by createdAt desc for UI.
 */
router.get('/message/unassigned', async (req, res) => {
  try {
    const leads = await Lead.find({ mobile: { $exists: true, $ne: null } })
      .select('mobile')
      .lean();

    const leadPhoneSet = new Set(
      leads
        .map((l) => normalizePhone(l.mobile))
        .filter(Boolean)
    );

    const messages = await WhatsappMessage.find({
      assignedTo: null,
      direction: 'incoming',
    })
      .sort({ createdAt: 1 })
      .populate('assignedTo', 'name email')
      .lean();

    const seenPhones = new Set();
    const result = [];

    for (const msg of messages) {
      const normPhone = normalizePhone(msg.phone);
      if (!normPhone) continue;
      if (leadPhoneSet.has(normPhone)) continue;
      if (seenPhones.has(normPhone)) continue;
      seenPhones.add(normPhone);
      result.push(msg);
    }

    result.sort((a, b) => b.createdAt - a.createdAt);

    res.json(result);
  } catch (err) {
    console.error('WhatsApp filtered unassigned messages error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /messages/by-assigned/:executiveId — Get messages assigned to a specific executive.
 */
router.get('/messages/by-assigned/:executiveId', async (req, res) => {
  try {
    const executiveId = req.params.executiveId;
    if (!isValidObjectId(executiveId)) {
      return res.status(400).json({ success: false, message: 'Invalid executive ID' });
    }
    const messages = await WhatsappMessage.find({ assignedTo: executiveId })
      .sort({ createdAt: -1 })
      .populate('assignedTo', 'name email')
      .lean();
    res.json(messages);
  } catch (err) {
    console.error('WhatsApp messages by-assigned error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /messages/:id/assign — Update assignedTo for a single WhatsApp message.
 * Body: { assignedTo: string | null }
 */
router.put('/messages/:id/assign', async (req, res) => {
  try {
    const id = req.params.id;
    const { assignedTo } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid message ID' });
    }

    let assigneeId = null;
    if (assignedTo !== null && assignedTo !== undefined && assignedTo !== '') {
      if (!isValidObjectId(String(assignedTo))) {
        return res.status(400).json({ success: false, message: 'Invalid assignedTo ID' });
      }
      assigneeId = String(assignedTo);
    }

    const previous = await WhatsappMessage.findById(id).lean();
    if (!previous) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const updated = await WhatsappMessage.findByIdAndUpdate(
      id,
      { $set: { assignedTo: assigneeId } },
      { new: true }
    )
      .populate('assignedTo', 'name email')
      .lean();

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    if (previous.assignedTo == null && assigneeId != null) {
      emitWhatsappMessageLeftUnassigned(id);
    }
    emitWhatsappMessageToViewRooms(updated);
    res.json(updated);
  } catch (err) {
    console.error('WhatsApp assign message error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /messages/assign/bulk — Update assignedTo for multiple WhatsApp messages.
 * Body: { messageIds: string[], assignedTo: string | null }
 */
router.put('/messages/assign/bulk', async (req, res) => {
  try {
    const { messageIds, assignedTo } = req.body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ success: false, message: 'messageIds array is required' });
    }
    if (!messageIds.every((id) => isValidObjectId(String(id)))) {
      return res.status(400).json({ success: false, message: 'One or more messageIds are invalid' });
    }

    let assigneeId = null;
    if (assignedTo !== null && assignedTo !== undefined && assignedTo !== '') {
      if (!isValidObjectId(String(assignedTo))) {
        return res.status(400).json({ success: false, message: 'Invalid assignedTo ID' });
      }
      assigneeId = String(assignedTo);
    }

    const previousMessages = await WhatsappMessage.find({ _id: { $in: messageIds } })
      .select('_id assignedTo')
      .lean();

    await WhatsappMessage.updateMany(
      { _id: { $in: messageIds } },
      { $set: { assignedTo: assigneeId } }
    );

    const updatedMessages = await WhatsappMessage.find({ _id: { $in: messageIds } })
      .populate('assignedTo', 'name email')
      .lean();

    if (assigneeId != null) {
      previousMessages.forEach((prev) => {
        if (prev.assignedTo == null) emitWhatsappMessageLeftUnassigned(prev._id);
      });
    }
    updatedMessages.forEach((msg) => emitWhatsappMessageToViewRooms(msg));

    res.json({
      success: true,
      message: 'AssignedTo updated for selected messages',
      updatedCount: updatedMessages.length,
      messages: updatedMessages,
    });
  } catch (err) {
    console.error('WhatsApp bulk assign messages error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /send-reply — Send a WhatsApp message to a customer (reply within 24h window).
 * Body: { phone, message, executiveId? }
 * Meta API: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 */
router.post('/send-reply', async (req, res) => {
  try {
    const { phone, message, executiveId, assignedTo } = req.body;
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
      return res.status(500).json({
        success: false,
        message: 'WhatsApp not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in .env',
      });
    }
    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: phone and message',
      });
    }

    // Phone: strip + and spaces (e.g. "917807150922")
    const to = String(phone).replace(/\D/g, '');

    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: String(message) },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('WhatsApp send-reply API error:', data);
      return res.status(response.status).json({
        success: false,
        message: data.error?.message || 'Failed to send WhatsApp message',
        details: data.error || data,
      });
    }

    // Save outgoing message to MongoDB for CRM history (only set assignedTo if valid ObjectId)
    const assigneeInput = executiveId ?? assignedTo;
    const assigneeId = isValidObjectId(String(assigneeInput || '')) ? String(assigneeInput) : null;
    const doc = await WhatsappMessage.create({
      phone: to,
      message: String(message),
      direction: 'outgoing',
      assignedTo: assigneeId,
      metaMessageId: data.messages?.[0]?.id || null,
      status: 'sent',
    });

    const messagePayload = await WhatsappMessage.findById(doc._id)
      .populate('assignedTo', 'name email')
      .lean();
    emitWhatsappMessageToViewRooms(messagePayload);

    console.log('✅ Outgoing WhatsApp message sent to', to);
    res.json({
      success: true,
      message: 'Message sent',
      messageId: data.messages?.[0]?.id,
    });
  } catch (err) {
    console.error('WhatsApp send-reply error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Internal server error',
    });
  }
});

/**
 * POST /send-media — Send document / image / video / audio via public HTTPS URL (24h reply window).
 * Meta requires a direct HTTPS link the WhatsApp servers can fetch (no auth).
 * Body: { phone, link, type?: 'document'|'image'|'video'|'audio', filename?, caption?, executiveId? }
 * - PDFs and generic files: type "document" (filename recommended).
 * - Photos: type "image".
 */
router.post('/send-media', async (req, res) => {
  try {
    const { phone, link, type, filename, caption, executiveId, assignedTo } = req.body;
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
      return res.status(500).json({
        success: false,
        message: 'WhatsApp not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in .env',
      });
    }
    if (!phone || !link) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: phone and link (public HTTPS URL to the file)',
      });
    }

    const mediaLink = String(link).trim();
    if (!mediaLink.toLowerCase().startsWith('https://')) {
      return res.status(400).json({
        success: false,
        message: 'link must be a public HTTPS URL (WhatsApp Cloud API requirement)',
      });
    }

    const mediaType = WHATSAPP_MEDIA_TYPES.includes(String(type || '').toLowerCase())
      ? String(type).toLowerCase()
      : 'document';

    const mediaObject = { link: mediaLink };
    if (caption != null && String(caption).trim() !== '') {
      mediaObject.caption = String(caption).trim().slice(0, 1024);
    }
    if (mediaType === 'document') {
      mediaObject.filename = (filename && String(filename).trim()) || filenameFromMediaUrl(mediaLink);
    }

    const to = String(phone).replace(/\D/g, '');
    if (!to.length) {
      return res.status(400).json({ success: false, message: 'Invalid phone number' });
    }

    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: mediaType,
      [mediaType]: mediaObject,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('WhatsApp send-media API error:', data);
      return res.status(response.status).json({
        success: false,
        message: data.error?.message || 'Failed to send WhatsApp media',
        details: data.error || data,
      });
    }

    const assigneeInput = executiveId ?? assignedTo;
    const assigneeId = isValidObjectId(String(assigneeInput || '')) ? String(assigneeInput) : null;
    const displayName =
      mediaType === 'document' ? mediaObject.filename || 'document' : mediaType;
    const summary = `[${mediaType}] ${displayName}${mediaObject.caption ? `: ${mediaObject.caption}` : ''}`;

    const doc = await WhatsappMessage.create({
      phone: to,
      message: summary,
      direction: 'outgoing',
      assignedTo: assigneeId,
      metaMessageId: data.messages?.[0]?.id || null,
      messageType: mediaType,
      mediaUrl: mediaLink,
      caption: mediaObject.caption || null,
      filename: mediaType === 'document' ? mediaObject.filename || null : null,
      status: 'sent',
    });

    const messagePayload = await WhatsappMessage.findById(doc._id)
      .populate('assignedTo', 'name email')
      .lean();
    emitWhatsappMessageToViewRooms(messagePayload);

    console.log('✅ Outgoing WhatsApp media sent to', to, mediaType);
    res.json({
      success: true,
      message: 'Media sent',
      messageId: data.messages?.[0]?.id,
    });
  } catch (err) {
    console.error('WhatsApp send-media error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Internal server error',
    });
  }
});

/**
 * GET /inbound-received/:token — Customer-sent image/document stored on this server (no auth; unguessable token).
 */
router.get('/inbound-received/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').replace(/[^a-f0-9]/gi, '');
    if (token.length !== 64) {
      return res.status(404).end();
    }
    const doc = await WhatsappInboundMedia.findOne({ token }).lean();
    if (!doc) {
      return res.status(404).end();
    }
    const filePath = path.join(WHATSAPP_INBOUND_DIR, doc.storedFilename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).end();
    }
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    const name = doc.originalFilename || 'file';
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(name)}`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('WhatsApp inbound-received GET error:', err);
    if (!res.headersSent) res.status(500).end();
  }
});

/**
 * GET /media/:token — Public HTTPS URL for WhatsApp servers to download an uploaded file (no auth).
 * After POST /upload-media, pass returned publicUrl as "link" to POST /send-media.
 * Set PUBLIC_BASE_URL=https://your-domain.com in .env (no trailing slash).
 */
router.get('/media/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').replace(/[^a-f0-9]/gi, '');
    if (token.length !== 64) {
      return res.status(404).end();
    }
    const doc = await WhatsappOutboundMedia.findOne({ token }).lean();
    if (!doc) {
      return res.status(404).end();
    }
    const filePath = path.join(WHATSAPP_OUTBOUND_DIR, doc.storedFilename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).end();
    }
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    const name = doc.originalFilename || 'document';
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(name)}`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('WhatsApp public media GET error:', err);
    if (!res.headersSent) res.status(500).end();
  }
});

/**
 * POST /upload-media — Store file on server + metadata in MongoDB; returns URL for POST /send-media.
 * Multipart field name: file. Requires JWT (same as rest of CRM).
 */
router.post(
  '/upload-media',
  verifyToken,
  (req, res, next) => {
    whatsappOutboundUpload.single('file')(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File too large (max 100MB)' });
      }
      return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Missing multipart field "file"',
        });
      }
      const token = req.whatsappUploadToken;
      if (!token) {
        return res.status(500).json({ success: false, message: 'Upload token missing' });
      }
      await WhatsappOutboundMedia.create({
        token,
        storedFilename: req.file.filename,
        originalFilename: req.file.originalname || '',
        mimeType: req.file.mimetype || 'application/octet-stream',
        size: req.file.size || 0,
      });
      const base = (process.env.PUBLIC_BASE_URL || process.env.API_PUBLIC_URL || '').replace(/\/+$/, '');
      const pathPart = `/api/whatsapp/media/${token}`;
      const publicUrl = base ? `${base}${pathPart}` : null;
      res.json({
        success: true,
        token,
        publicUrl,
        relativePath: pathPart,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        hint: publicUrl
          ? 'POST /api/whatsapp/send-media with body { phone, link: publicUrl, type: "document", filename }'
          : 'Set PUBLIC_BASE_URL in .env to receive a full https URL for WhatsApp',
      });
    } catch (err) {
      console.error('WhatsApp CRM upload-media error:', err);
      try {
        if (req.file?.path) fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  }
);

/**
 * POST /send-template — Send a WhatsApp template message (e.g. new_first_message).
 * Use this when the lead has not messaged in 24h or to start the conversation from CRM.
 * Body: { phone, templateName, language?, components? } — components only if template has variables (e.g. {{1}}).
 */
router.post('/send-template', async (req, res) => {
  try {
    const { phone, templateName, language = 'en', components, executiveId, assignedTo } = req.body;
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
      return res.status(500).json({
        success: false,
        message: 'WhatsApp not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in .env',
      });
    }
    if (!phone || !templateName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: phone and templateName',
      });
    }

    // Phone: digits only, with country code (e.g. 919876543210)
    const to = String(phone).replace(/\D/g, '');
    if (!to.length) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number',
      });
    }

    const templatePayload = {
      name: String(templateName),
      language: { code: String(language) },
    };
    if (Array.isArray(components) && components.length > 0) {
      templatePayload.components = components;
    }

    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: templatePayload,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('WhatsApp send-template API error:', data);
      return res.status(response.status).json({
        success: false,
        message: data.error?.message || 'Failed to send WhatsApp template',
        details: data.error || data,
      });
    }

    const assigneeInput = executiveId ?? assignedTo;
    const assigneeId = isValidObjectId(String(assigneeInput || '')) ? String(assigneeInput) : null;

    // Save outgoing template as a message in CRM for history
    const doc = await WhatsappMessage.create({
      phone: to,
      message: `[Template: ${templateName}]`,
      direction: 'outgoing',
      assignedTo: assigneeId,
      metaMessageId: data.messages?.[0]?.id || null,
      status: 'sent',
    });

    const messagePayload = await WhatsappMessage.findById(doc._id)
      .populate('assignedTo', 'name email')
      .lean();
    emitWhatsappMessageToViewRooms(messagePayload);

    console.log('✅ WhatsApp template sent to', to, 'template:', templateName);
    res.json({
      success: true,
      message: 'Template sent',
      messageId: data.messages?.[0]?.id,
    });
  } catch (err) {
    console.error('WhatsApp send-template error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Internal server error',
    });
  }
});

/**
 * DELETE /messages/:id — Delete a WhatsApp message by ID (CRM only; does not delete on WhatsApp).
 */
router.delete('/messages/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid message ID' });
    }
    const doc = await WhatsappMessage.findById(id).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }
    await WhatsappMessage.findByIdAndDelete(id);

    emitWhatsappMessageDeleted({
      _id: doc._id,
      phone: doc.phone,
      assignedTo: doc.assignedTo,
    });

    console.log('✅ WhatsApp message deleted:', id);
    res.json({ success: true, message: 'Message deleted' });
  } catch (err) {
    console.error('WhatsApp delete message error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
