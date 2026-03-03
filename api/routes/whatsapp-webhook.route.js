import express from 'express';
import mongoose from 'mongoose';
import WhatsappMessage from '../models/whatsappMessage.model.js';
import { getIO } from '../socket/socket.js';

const router = express.Router();

function isValidObjectId(id) {
  if (!id || typeof id !== 'string') return false;
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
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
  } else {
    const assignedId = assignedTo?._id ?? assignedTo;
    if (assignedId) io.to(`whatsapp:by-assigned:${assignedId}`).emit('whatsapp:message:deleted', { _id });
  }
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
