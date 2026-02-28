import express from 'express';

const router = express.Router();

/**
 * GET /api/privacy-policy — Privacy policy as HTML page.
 */
router.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Demand Setu Privacy Policy</title>
      </head>
      <body style="font-family: Arial; padding: 40px;">
        <h2>Demand Setu Privacy Policy</h2>

        <p>
          We collect WhatsApp messages for CRM management purposes only.
        </p>

        <p>
          We do not share data with third parties.
        </p>

        <p>
          📧 Contact: info@ptwholidays.com
        </p>
      </body>
    </html>
  `);
});

/**
 * GET /api/privacy-policy/data-deletion — Data deletion instructions (HTML).
 */
router.get('/data-deletion', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Data Deletion Instructions</title>
      </head>
      <body style="font-family: Arial; padding: 40px;">
        <h2>Data Deletion Instructions</h2>

        <p>
          If you would like to request deletion of your WhatsApp conversation
          data from Pluto Tours CRM, please contact us at:
        </p>

        <p>
          📧 Email: plutotoursit@gmail.com
        </p>

        <p>
          Include your WhatsApp phone number in the email. We will delete
          your data within 7 working days.
        </p>

        <p>
          Data stored includes:
        </p>
        <ul>
          <li>WhatsApp phone number</li>
          <li>Message content</li>
          <li>Message timestamps</li>
        </ul>

        <p>
          If you have any questions regarding data processing, contact us at the email above.
        </p>
      </body>
    </html>
  `);
});

export default router;
