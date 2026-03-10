import express from 'express';
import mongoose from 'mongoose';
import WhatsappMessage from '../models/whatsappMessage.model.js';
import Lead from '../models/lead.model.js';
import { getIO } from '../socket/socket.js';

const router = express.Router();

function isValidObjectId(id) {
  if (!id || typeof id !== 'string') return false;
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
}

function normalizePhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '').slice(-10);
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

    const doc = await WhatsappMessage.create({
      phone: message.from,
      message: message.text?.body || `[${message.type}]`,
      direction: 'incoming',
      metaMessageId: message.id || null,
    });

    const messagePayload = await WhatsappMessage.findById(doc._id)
      .populate('assignedTo', 'name email')
      .lean();
    emitWhatsappMessageToViewRooms(messagePayload);

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

  // Handle Status Updates (ignore)
  if (value?.statuses) {
    console.log("📦 Status update received");
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
 * No lead check; purely deduplicates by phone and keeps only the first message from each number.
 */
router.get('/messages/unassigned/first', async (req, res) => {
  try {
    const messages = await WhatsappMessage.find({ assignedTo: null })
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
    const { phone, message, executiveId } = req.body;
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
    const assigneeId = isValidObjectId(executiveId) ? executiveId : null;
    const doc = await WhatsappMessage.create({
      phone: to,
      message: String(message),
      direction: 'outgoing',
      assignedTo: assigneeId,
      metaMessageId: data.messages?.[0]?.id || null,
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
