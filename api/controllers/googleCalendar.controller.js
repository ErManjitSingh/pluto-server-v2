import { oauth2Client } from '../config/googleCalendar.js';
import Maker from '../models/maker.model.js';

/**
 * GET /api/google-calendar/connect
 * Generate Google OAuth URL for the logged-in maker/executive.
 */
export const connectGoogleCalendar = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Ensure maker exists for this authenticated id
    const maker = await Maker.findById(userId);
    if (!maker) {
      return res.status(404).json({ message: 'Maker not found' });
    }

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/calendar'],
      state: userId.toString(),
    });

    res.json({ url });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/google-calendar/callback
 * Handle Google OAuth callback, store tokens on User, then redirect to CRM.
 */
export const googleCalendarCallback = async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send('<h1>Invalid Google Calendar authorization.</h1>');
    }

    const { tokens } = await oauth2Client.getToken(code);

    await Maker.findByIdAndUpdate(state, {
      googleAccessToken: tokens.access_token || null,
      googleRefreshToken: tokens.refresh_token || null,
      googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    });

    const redirectUrl =
      process.env.CRM_SETTINGS_REDIRECT_URL || 'https://crm.ptwholidays.in/settings';

    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Google Calendar callback error:', error);
    res
      .status(500)
      .send('<h1>Google Calendar authorization failed. Please try again.</h1>');
  }
};

