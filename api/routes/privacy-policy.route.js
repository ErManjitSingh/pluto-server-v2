import express from 'express';

const router = express.Router();

const PRIVACY_POLICY_TEXT = `Demand Setu Privacy Policy
We collect WhatsApp messages for CRM management purposes only.
We do not share data with third parties.
Contact: info@ptwholidays.com`;

/**
 * GET /api/privacy-policy — Returns static privacy policy text.
 */
router.get('/', (req, res) => {
  res.json({
    success: true,
    policy: PRIVACY_POLICY_TEXT,
    contact: 'info@ptwholidays.com',
  });
});

export default router;
