import { google } from 'googleapis';

/**
 * Shared OAuth2 client for Google Calendar integration.
 * Uses env variables:
 * - GOOGLE_CALENDAR_CLIENT_ID
 * - GOOGLE_CALENDAR_CLIENT_SECRET
 * - GOOGLE_CALENDAR_REDIRECT_URI
 */
export const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CALENDAR_CLIENT_ID,
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
  process.env.GOOGLE_CALENDAR_REDIRECT_URI
);

