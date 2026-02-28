import express from 'express';

const router = express.Router();

// Same value as in Meta Configuration → Verify token
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'plutotours123';

/**
 * GET /webhook — Meta calls this to verify your webhook URL.
 * In Meta Configuration set Verify token to: plutotours123 (or WHATSAPP_VERIFY_TOKEN from .env)
 */
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    console.warn('❌ Webhook verification failed — mode or token mismatch');
    res.sendStatus(403);
  }
});

/**
 * POST /webhook — Meta sends incoming WhatsApp messages here.
 * Extract phone (from), message text (body), then save to MongoDB / create lead as needed.
 */
router.post('/webhook', (req, res) => {
  console.log('Incoming WhatsApp message:');
  console.log(JSON.stringify(req.body, null, 2));

  // TODO: Extract and persist:
  // - entry[0].changes[0].value.messages[0].from  → phone
  // - entry[0].changes[0].value.messages[0].text.body → message text
  // Then save to MongoDB / create lead in CRM

  res.sendStatus(200);
});

export default router;
