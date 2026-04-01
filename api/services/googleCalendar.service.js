import { google } from 'googleapis';
import { oauth2Client } from '../config/googleCalendar.js';

/**
 * Parse timing string like "9/5/2026 5.30pm" (m/d/yyyy, h.mm am/pm) to a JS Date
 * representing the correct instant in UTC, assuming the input is in IST (Asia/Kolkata).
 * Returns null if parsing fails.
 */
function parseTimingToUtcDateAssumingIST(timingStr) {
  if (!timingStr || typeof timingStr !== 'string') return null;
  const s = timingStr.trim();
  const match = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})\s+(\d{1,2})\.(\d{2})\s*(am|pm)$/i);
  if (!match) return null;
  const [, n1, n2, year, hour, min, ampm] = match;
  let h = parseInt(hour, 10);
  const mn = parseInt(min, 10);
  const y = parseInt(year, 10);
  const month = parseInt(n1, 10) - 1;
  const day = parseInt(n2, 10);

  if (ampm.toLowerCase() === 'pm' && h !== 12) h += 12;
  if (ampm.toLowerCase() === 'am' && h === 12) h = 0;

  // Convert IST wall time -> UTC instant by subtracting 5h30m
  const utcMs = Date.UTC(y, month, day, h, mn, 0, 0) - (5.5 * 60 * 60 * 1000);
  const date = new Date(utcMs);
  if (isNaN(date.getTime())) return null;
  return date;
}

/**
 * Create or update a Google Calendar event for a follow-up based on lead status timing.
 * - user: Maker document with googleRefreshToken
 * - options: { lead, leadstatus, note, timing, startDate?, durationMinutes?, googleEventId?, summaryPrefix? }
 * Returns Google eventId (string) or null.
 */
export const createCalendarEvent = async (user, options) => {
  const {
    lead,
    leadstatus,
    note,
    timing,
    startDate: startDateOverride,
    durationMinutes,
    googleEventId,
    summaryPrefix,
    transparency
  } = options || {};

  if (!user || !user.googleRefreshToken) {
    return null;
  }

  // If startDateOverride is provided: treat it as an instant (Date.now()).
  // If timing is provided: treat it as IST wall time and convert to correct UTC instant.
  const startDate =
    startDateOverride instanceof Date ? startDateOverride : parseTimingToUtcDateAssumingIST(timing);
  if (!startDate || isNaN(startDate.getTime())) return null;

  // 30-minute default duration (overrideable for assignment "instant" events)
  const dur = Number.isFinite(durationMinutes) ? Math.max(1, durationMinutes) : 30;
  const endDate = new Date(startDate.getTime() + dur * 60 * 1000);

  // Ensure access token is fresh (Google will use refresh_token)
  oauth2Client.setCredentials({
    refresh_token: user.googleRefreshToken,
  });
  await oauth2Client.getAccessToken();

  const calendar = google.calendar({
    version: 'v3',
    auth: oauth2Client,
  });

  const summaryParts = [];
  if (summaryPrefix) summaryParts.push(summaryPrefix);
  if (lead?.name) summaryParts.push(`Lead: ${lead.name}`);
  if (leadstatus) summaryParts.push(`Status: ${leadstatus}`);

  const event = {
    summary: summaryParts.join(' | ') || 'Lead follow-up',
    description: [
      note ? `Note: ${note}` : null,
      lead?.mobile ? `Lead mobile: ${lead.mobile}` : null,
      lead?.email ? `Lead email: ${lead.email}` : null,
      lead?._id ? `Lead ID: ${lead._id.toString()}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    // Use absolute instants (RFC3339 with Z) to avoid server timezone issues.
    start: { dateTime: startDate.toISOString() },
    end: { dateTime: endDate.toISOString() },
    ...(transparency ? { transparency } : null),
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: timing ? 10 : 0 }, // follow-up: 10 min before; assignment: immediate
      ],
    },
  };

  let response;
  if (googleEventId) {
    // Update existing event to prevent duplicates
    response = await calendar.events.update({
      calendarId: 'primary',
      eventId: googleEventId,
      requestBody: event,
    });
  } else {
    // Create new event
    response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });
  }

  return response?.data?.id || null;
};

