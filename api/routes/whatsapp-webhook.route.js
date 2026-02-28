import express from 'express';
import WhatsappMessage from '../models/whatsappMessage.model.js';

const router = express.Router();

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

    await WhatsappMessage.create({
      phone: message.from,
      message: message.text?.body || `[${message.type}]`,
      direction: 'incoming',
      metaMessageId: message.id || null,
    });

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

export default router;
