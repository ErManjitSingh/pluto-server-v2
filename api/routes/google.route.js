import express from 'express';

const router = express.Router();

const privacyPolicyContent = `
  <h2>Overview</h2>
  <p>This CRM integrates with Google Calendar to schedule follow-ups for executives. We use calendar access only to create and manage follow-up events on your behalf.</p>

  <h2>Data We Access</h2>
  <p>When you connect Google Calendar, we may read availability and create events. We use the minimum permissions required for scheduling follow-ups.</p>

  <h2>Data We Do Not Store or Share</h2>
  <p>We do not store or share personal calendar data outside the organization. Your calendar details are not sold, shared with third parties, or used for marketing.</p>

  <h2>Data Security</h2>
  <p>Calendar access is used only within your organization’s CRM. We follow standard security practices to protect any data processed via the integration.</p>

  <h2>Contact</h2>
  <p>For privacy questions about the Google integration, contact your organization administrator or our support team.</p>
`;

const termsContent = `
  <h2>Use of Google Integration</h2>
  <p>This CRM integrates with Google Calendar to schedule follow-ups for executives. By using this integration, you agree to use it only for legitimate business purposes within your organization.</p>

  <h2>Acceptable Use</h2>
  <p>You may use the Google Calendar integration to create and manage follow-up meetings and events. You must not use it to access, store, or share calendar data outside the organization or in violation of your organization’s policies.</p>

  <h2>No Storage or Sharing</h2>
  <p>We do not store or share personal calendar data outside the organization. Calendar data is processed only to support scheduling and is not retained for other purposes.</p>

  <h2>Google’s Terms</h2>
  <p>Use of Google Calendar is also subject to Google’s Terms of Service and Privacy Policy. Ensure your use complies with those terms.</p>

  <h2>Contact</h2>
  <p>For questions about these terms or the Google integration, contact your organization administrator or our support team.</p>
`;

/**
 * GET /api/google/privacy-policy — Google integration privacy policy (HTML).
 */
router.get('/privacy-policy', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Google Integration – Privacy Policy</title>
      </head>
      <body style="font-family: Arial, sans-serif; padding: 40px; max-width: 640px; margin: 0 auto;">
        <h1>Google Integration – Privacy Policy</h1>
        ${privacyPolicyContent}
      </body>
    </html>
  `);
});

/**
 * GET /api/google/terms — Google integration terms (HTML).
 */
router.get('/terms', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Google Integration – Terms</title>
      </head>
      <body style="font-family: Arial, sans-serif; padding: 40px; max-width: 640px; margin: 0 auto;">
        <h1>Google Integration – Terms</h1>
        ${termsContent}
      </body>
    </html>
  `);
});

export default router;
