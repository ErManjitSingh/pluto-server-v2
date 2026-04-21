/** Same routes as whatsapp-webhook.route.js; uses WhatsappMessageDemand model + demand socket rooms. Outbound: WHATSAPP_*_DEMAND. */
import express from 'express';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import WhatsappMessageDemand from '../models/whatsappMessageDemand.model.js';
import WhatsappOutboundMedia from '../models/whatsappOutboundMedia.model.js';
import WhatsappInboundMedia from '../models/whatsappInboundMedia.model.js';
import Lead from '../models/lead.model.js';
import { getIO } from '../socket/socket.js';
import { storeIncomingWhatsappMediaFromMeta, WHATSAPP_INBOUND_DIR } from '../utils/whatsappMediaUrl.js';
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

/** Demand-only Socket.IO rooms (no overlap with main `whatsapp:*` rooms). */
const D = {
  root: 'whatsapp:demand',
  all: 'whatsapp:demand:all',
  unassigned: 'whatsapp:demand:unassigned',
  unassignedFiltered: 'whatsapp:demand:unassigned:filtered',
  unassignedFirst: 'whatsapp:demand:unassigned:first',
  byPhone: (phone) => `whatsapp:demand:by-phone:${phone}`,
  byAssigned: (id) => `whatsapp:demand:by-assigned:${id}`,
};

function emitWhatsappDemandMessageToViewRooms(messagePayload) {
  const io = getIO();
  if (!io) return;
  io.to(D.root).emit('whatsapp-demand:message:new', messagePayload);
  io.to(D.all).emit('whatsapp-demand:message:new', messagePayload);
  io.to(D.byPhone(messagePayload.phone)).emit('whatsapp-demand:message:new', messagePayload);
  if (!messagePayload.assignedTo) {
    io.to(D.unassigned).emit('whatsapp-demand:message:new', messagePayload);
  } else {
    const assignedId = messagePayload.assignedTo?._id ?? messagePayload.assignedTo;
    if (assignedId) io.to(D.byAssigned(assignedId)).emit('whatsapp-demand:message:new', messagePayload);
  }
}

function emitWhatsappDemandMessageUpdatedToViewRooms(messagePayload) {
  const io = getIO();
  if (!io) return;
  io.to(D.root).emit('whatsapp-demand:message:updated', messagePayload);
  io.to(D.all).emit('whatsapp-demand:message:updated', messagePayload);
  io.to(D.byPhone(messagePayload.phone)).emit('whatsapp-demand:message:updated', messagePayload);
  if (!messagePayload.assignedTo) {
    io.to(D.unassigned).emit('whatsapp-demand:message:updated', messagePayload);
    io.to(D.unassignedFiltered).emit('whatsapp-demand:message:updated', messagePayload);
    io.to(D.unassignedFirst).emit('whatsapp-demand:message:updated', messagePayload);
  } else {
    const assignedId = messagePayload.assignedTo?._id ?? messagePayload.assignedTo;
    if (assignedId) io.to(D.byAssigned(assignedId)).emit('whatsapp-demand:message:updated', messagePayload);
  }
}

function buildIncomingWhatsappDemandMessageCreatePayload(message) {
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

function publicApiBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || process.env.API_PUBLIC_URL || '').replace(/\/+$/, '');
}

function scheduleFetchAndStoreIncomingWhatsappDemandMedia(docId, createPayload) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN_DEMAND;
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
      const pathPart = `/api/whatsapp-demand/inbound-received/${stored.token}`;
      const mediaUrl = base ? `${base}${pathPart}` : pathPart;
      const setFields = { mediaUrl };
      if (!createPayload.filename) {
        setFields.filename = stored.originalFilename;
      }
      await WhatsappMessageDemand.updateOne({ _id: docId }, { $set: setFields });
      const updated = await WhatsappMessageDemand.findById(docId).populate('assignedTo', 'name email').lean();
      if (updated) emitWhatsappDemandMessageUpdatedToViewRooms(updated);
    })().catch((e) => console.error('Incoming WhatsApp demand media store:', e));
  });
}

function emitWhatsappDemandMessageDeleted(deletedPayload) {
  const io = getIO();
  if (!io) return;
  const { _id, phone, assignedTo } = deletedPayload;
  io.to(D.root).emit('whatsapp-demand:message:deleted', { _id });
  io.to(D.all).emit('whatsapp-demand:message:deleted', { _id });
  if (phone) io.to(D.byPhone(phone)).emit('whatsapp-demand:message:deleted', { _id });
  if (!assignedTo) {
    io.to(D.unassigned).emit('whatsapp-demand:message:deleted', { _id });
    io.to(D.unassignedFiltered).emit('whatsapp-demand:message:deleted', { _id });
    io.to(D.unassignedFirst).emit('whatsapp-demand:message:deleted', { _id });
  } else {
    const assignedId = assignedTo?._id ?? assignedTo;
    if (assignedId) io.to(D.byAssigned(assignedId)).emit('whatsapp-demand:message:deleted', { _id });
  }
}

function emitWhatsappDemandMessageLeftUnassigned(messageId) {
  const io = getIO();
  if (!io) return;
  io.to(D.unassigned).emit('whatsapp-demand:message:deleted', { _id: messageId });
  io.to(D.unassignedFiltered).emit('whatsapp-demand:message:deleted', { _id: messageId });
  io.to(D.unassignedFirst).emit('whatsapp-demand:message:deleted', { _id: messageId });
}

// Meta verify token for the demand webhook URL (falls back to main WhatsApp verify token)
const VERIFY_TOKEN =
  process.env.WHATSAPP_VERIFY_TOKEN_DEMAND || process.env.WHATSAPP_VERIFY_TOKEN || 'plutotours123';

/**
 * GET /webhook — Meta calls this to verify your webhook URL.
 * In browser/Postman without query params you get 403 — that's correct.
 * Test with: /api/whatsapp-demand/webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=12345
 */
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ WhatsApp demand webhook verified');
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

    const createPayload = buildIncomingWhatsappDemandMessageCreatePayload(message);
    const doc = await WhatsappMessageDemand.create(createPayload);

    if (createPayload.metaMediaId) {
      scheduleFetchAndStoreIncomingWhatsappDemandMedia(doc._id, createPayload);
    }

    const messagePayload = await WhatsappMessageDemand.findById(doc._id)
      .populate('assignedTo', 'name email')
      .lean();
    emitWhatsappDemandMessageToViewRooms(messagePayload);

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
          const firstFromThisPhone = await WhatsappMessageDemand.countDocuments({
            phone: doc.phone,
            assignedTo: null,
            direction: 'incoming',
          });
          if (firstFromThisPhone === 1) {
            io.to(D.unassignedFiltered).emit(
              'whatsapp-demand:message:unassigned:filtered:new',
              messagePayload
            );
          }
        }
        // Real-time for first-per-phone unassigned: emit when this is the first unassigned from this phone
        const firstUnassignedFromPhone = await WhatsappMessageDemand.countDocuments({
          phone: doc.phone,
          assignedTo: null,
        });
        if (firstUnassignedFromPhone === 1) {
          io.to(D.unassignedFirst).emit(
            'whatsapp-demand:message:unassigned:first:new',
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
      console.log("📩 Demand status:", statusType, "for", metaMessageId);
      await WhatsappMessageDemand.findOneAndUpdate(
        { metaMessageId, direction: 'outgoing' },
        {
          $set: {
            status: statusType,
            statusTimestamp: status.timestamp ? String(status.timestamp) : null,
          },
        }
      );

      const updated = await WhatsappMessageDemand.findOne({ metaMessageId, direction: 'outgoing' })
        .populate('assignedTo', 'name email')
        .lean();

      if (updated) {
        emitWhatsappDemandMessageUpdatedToViewRooms(updated);
      }
    }
  }

  res.sendStatus(200);
});

/**
 * GET /messages — CRM: list all WhatsApp messages (newest first).
 * Frontend: GET /api/whatsapp-demand/messages
 */
router.get('/messages', async (req, res) => {
  try {
    const messages = await WhatsappMessageDemand.find()
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
    const messages = await WhatsappMessageDemand.find(query)
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
    const messages = await WhatsappMessageDemand.find({ assignedTo: null })
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
 * No lead check; purely deduplicates by phone and keeps only the first message from each number.
 */
router.get('/messages/unassigned/first', async (req, res) => {
  try {
    const messages = await WhatsappMessageDemand.find({ assignedTo: null })
      .sort({ createdAt: 1 })
      .populate('assignedTo', 'name email')
      .lean();

    const seenPhones = new Set();
    const result = [];

    for (const msg of messages) {
      const normPhone = normalizePhone(msg.phone);
      if (!normPhone) continue;
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

    const messages = await WhatsappMessageDemand.find({
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
    const messages = await WhatsappMessageDemand.find({ assignedTo: executiveId })
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

    const previous = await WhatsappMessageDemand.findById(id).lean();
    if (!previous) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const updated = await WhatsappMessageDemand.findByIdAndUpdate(
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
      emitWhatsappDemandMessageLeftUnassigned(id);
    }
    emitWhatsappDemandMessageToViewRooms(updated);
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

    const previousMessages = await WhatsappMessageDemand.find({ _id: { $in: messageIds } })
      .select('_id assignedTo')
      .lean();

    await WhatsappMessageDemand.updateMany(
      { _id: { $in: messageIds } },
      { $set: { assignedTo: assigneeId } }
    );

    const updatedMessages = await WhatsappMessageDemand.find({ _id: { $in: messageIds } })
      .populate('assignedTo', 'name email')
      .lean();

    if (assigneeId != null) {
      previousMessages.forEach((prev) => {
        if (prev.assignedTo == null) emitWhatsappDemandMessageLeftUnassigned(prev._id);
      });
    }
    updatedMessages.forEach((msg) => emitWhatsappDemandMessageToViewRooms(msg));

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
    const { phone, message, executiveId } = req.body;
    const token = process.env.WHATSAPP_ACCESS_TOKEN_DEMAND;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID_DEMAND;

    if (!token || !phoneNumberId) {
      return res.status(500).json({
        success: false,
        message:
          'WhatsApp demand not configured. Set WHATSAPP_ACCESS_TOKEN_DEMAND and WHATSAPP_PHONE_NUMBER_ID_DEMAND in .env',
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
    const assigneeId = isValidObjectId(executiveId) ? executiveId : null;
    const doc = await WhatsappMessageDemand.create({
      phone: to,
      message: String(message),
      direction: 'outgoing',
      assignedTo: assigneeId,
      metaMessageId: data.messages?.[0]?.id || null,
      status: 'sent',
    });

    const messagePayload = await WhatsappMessageDemand.findById(doc._id)
      .populate('assignedTo', 'name email')
      .lean();
    emitWhatsappDemandMessageToViewRooms(messagePayload);

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
 * Body: { phone, link, type?: 'document'|'image'|'video'|'audio', filename?, caption?, executiveId? }
 */
router.post('/send-media', async (req, res) => {
  try {
    const { phone, link, type, filename, caption, executiveId } = req.body;
    const token = process.env.WHATSAPP_ACCESS_TOKEN_DEMAND;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID_DEMAND;

    if (!token || !phoneNumberId) {
      return res.status(500).json({
        success: false,
        message:
          'WhatsApp demand not configured. Set WHATSAPP_ACCESS_TOKEN_DEMAND and WHATSAPP_PHONE_NUMBER_ID_DEMAND in .env',
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

    const assigneeId = isValidObjectId(executiveId) ? executiveId : null;
    const displayName =
      mediaType === 'document' ? mediaObject.filename || 'document' : mediaType;
    const summary = `[${mediaType}] ${displayName}${mediaObject.caption ? `: ${mediaObject.caption}` : ''}`;

    const doc = await WhatsappMessageDemand.create({
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

    const messagePayload = await WhatsappMessageDemand.findById(doc._id)
      .populate('assignedTo', 'name email')
      .lean();
    emitWhatsappDemandMessageToViewRooms(messagePayload);

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
 * GET /inbound-received/:token — Customer-sent media stored on this server (demand line; no auth).
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
    console.error('WhatsApp demand inbound-received GET error:', err);
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
    console.error('WhatsApp demand public media GET error:', err);
    if (!res.headersSent) res.status(500).end();
  }
});

/**
 * POST /upload-media — Store file on server + metadata in MongoDB; returns URL for POST /send-media (demand line).
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
      const pathPart = `/api/whatsapp-demand/media/${token}`;
      const publicUrl = base ? `${base}${pathPart}` : null;
      res.json({
        success: true,
        token,
        publicUrl,
        relativePath: pathPart,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        hint: publicUrl
          ? 'POST /api/whatsapp-demand/send-media with body { phone, link: publicUrl, type: "document", filename }'
          : 'Set PUBLIC_BASE_URL in .env to receive a full https URL for WhatsApp',
      });
    } catch (err) {
      console.error('WhatsApp demand CRM upload-media error:', err);
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
    const { phone, templateName, language = 'en', components } = req.body;
    const token = process.env.WHATSAPP_ACCESS_TOKEN_DEMAND;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID_DEMAND;

    if (!token || !phoneNumberId) {
      return res.status(500).json({
        success: false,
        message:
          'WhatsApp demand not configured. Set WHATSAPP_ACCESS_TOKEN_DEMAND and WHATSAPP_PHONE_NUMBER_ID_DEMAND in .env',
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

    // Save outgoing template as a message in CRM for history
    const doc = await WhatsappMessageDemand.create({
      phone: to,
      message: `[Template: ${templateName}]`,
      direction: 'outgoing',
      assignedTo: null,
      metaMessageId: data.messages?.[0]?.id || null,
      status: 'sent',
    });

    const messagePayload = await WhatsappMessageDemand.findById(doc._id)
      .populate('assignedTo', 'name email')
      .lean();
    emitWhatsappDemandMessageToViewRooms(messagePayload);

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
    const doc = await WhatsappMessageDemand.findById(id).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }
    await WhatsappMessageDemand.findByIdAndDelete(id);

    emitWhatsappDemandMessageDeleted({
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
