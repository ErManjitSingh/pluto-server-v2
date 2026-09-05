/**
 * Pure helpers for the campaign layer — no DB access, no imports from services,
 * so this file is safe to import from the WhatsApp webhook routes.
 */

/** Canonical WhatsApp storage format, identical to the whatsapp webhook routes (e.g. 917018566969). */
export const normalizePhoneForStorage = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  const last10 = digits.slice(-10);
  if (last10.length === 10) return `91${last10}`;
  return digits;
};

/** Last 10 digits — used to match Lead.mobile. */
export const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '').slice(-10);

export const isValidEmail = (email) =>
  typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

export const publicBaseUrl = () =>
  String(process.env.PUBLIC_BASE_URL || process.env.API_PUBLIC_URL || '').replace(/\/+$/, '');

/* ------------------------------------------------------------------ *
 * Placeholder rendering — {{name}}, {{destination}} … from the lead
 * ------------------------------------------------------------------ */

/** Lead fields exposed to campaign templates. Anything else renders as an empty string. */
const LEAD_VARIABLE_FIELDS = [
  'name',
  'email',
  'mobile',
  'destination',
  'guestLocation',
  'from',
  'days',
  'nights',
  'adults',
  'kids',
  'persons',
  'budget',
  'travelDate',
  'tourType',
  'packageType',
  'packageCategory',
  'leadStatus',
  'source',
  'executiveName',
  'executivePhone',
  'executiveEmail',
];

export const buildLeadVariables = (lead = {}) => {
  const vars = {};
  for (const field of LEAD_VARIABLE_FIELDS) {
    const value = lead[field];
    vars[field] = value == null ? '' : String(value);
  }
  vars.phone = vars.mobile;
  vars.firstName = (vars.name || '').trim().split(/\s+/)[0] || '';
  return vars;
};

export const renderTemplateString = (input, variables = {}) => {
  if (typeof input !== 'string' || !input.includes('{{')) return input;
  return input.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) => {
    const value = variables[key];
    return value == null ? '' : String(value);
  });
};

/** Render placeholders inside a Meta `template.components` array without changing its shape. */
export const renderWhatsappComponents = (components, variables = {}) => {
  if (!Array.isArray(components) || components.length === 0) return null;
  const walk = (node) => {
    if (typeof node === 'string') return renderTemplateString(node, variables);
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const out = {};
      for (const [key, value] of Object.entries(node)) out[key] = walk(value);
      return out;
    }
    return node;
  };
  return walk(components);
};

/* ------------------------------------------------------------------ *
 * Email open / click tracking
 * ------------------------------------------------------------------ */

export const openTrackingUrl = (baseUrl, token) =>
  `${baseUrl}/api/campaigns/track/open/${token}.png`;

export const clickTrackingUrl = (baseUrl, token, targetUrl) =>
  `${baseUrl}/api/campaigns/track/click/${token}?u=${encodeURIComponent(targetUrl)}`;

const UNTRACKABLE_HREF = /^\s*(mailto:|tel:|sms:|#|\{\{)/i;

/**
 * Rewrite outbound links through the click redirect and append a 1x1 open pixel.
 * There is no ESP webhook in this stack, so this is how opens/clicks are observed.
 */
export const injectEmailTracking = (html, { token, baseUrl, trackOpens = true, trackClicks = true }) => {
  if (!baseUrl || !token) return html || '';
  let output = String(html || '');

  if (trackClicks) {
    output = output.replace(
      /(<a\b[^>]*?\bhref\s*=\s*)(["'])(.*?)\2/gi,
      (match, prefix, quote, url) => {
        if (!url || UNTRACKABLE_HREF.test(url)) return match;
        if (url.startsWith(`${baseUrl}/api/campaigns/track/`)) return match;
        return `${prefix}${quote}${clickTrackingUrl(baseUrl, token, url)}${quote}`;
      }
    );
  }

  if (trackOpens) {
    const pixel = `<img src="${openTrackingUrl(baseUrl, token)}" width="1" height="1" alt="" style="display:block;border:0;outline:none;" />`;
    output = /<\/body\s*>/i.test(output)
      ? output.replace(/<\/body\s*>/i, `${pixel}</body>`)
      : `${output}${pixel}`;
  }

  return output;
};

export const htmlToPlainText = (html) =>
  String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();

/* ------------------------------------------------------------------ *
 * Status progression
 * ------------------------------------------------------------------ */

/**
 * Statuses only move forward. Meta can deliver `read` before `delivered`, and
 * webhook retries can replay an older status, so an out-of-order update is ignored.
 */
export const WHATSAPP_STATUS_RANK = { pending: 0, sent: 1, delivered: 2, read: 3 };
export const EMAIL_STATUS_RANK = { pending: 0, sent: 1, delivered: 2, opened: 3, clicked: 4 };

export const isForwardStatus = (rankMap, current, next) => {
  if (next === 'failed') return current !== 'failed';
  if (current === 'failed') return false;
  const currentRank = rankMap[current] ?? 0;
  const nextRank = rankMap[next] ?? 0;
  return nextRank > currentRank;
};

/* ------------------------------------------------------------------ *
 * Stats
 * ------------------------------------------------------------------ */

const emptyChannelStats = () => ({
  total: 0,
  pending: 0,
  sent: 0,
  delivered: 0,
  failed: 0,
});

/**
 * Turn a raw aggregation row into the funnel the CRM displays.
 * Counts are cumulative: a `read` message also counts as sent and delivered.
 */
export const buildCampaignStats = (row = {}) => ({
  totalLeads: row.total || 0,
  whatsapp: {
    ...emptyChannelStats(),
    total: row.waEnabled || 0,
    pending: row.waPending || 0,
    sent: row.waSent || 0,
    delivered: row.waDelivered || 0,
    read: row.waRead || 0,
    failed: row.waFailed || 0,
  },
  email: {
    ...emptyChannelStats(),
    total: row.emEnabled || 0,
    pending: row.emPending || 0,
    sent: row.emSent || 0,
    delivered: row.emDelivered || 0,
    opened: row.emOpened || 0,
    clicked: row.emClicked || 0,
    failed: row.emFailed || 0,
    totalOpens: row.emOpenCount || 0,
    totalClicks: row.emClickCount || 0,
  },
  overall: {
    /** One "send" per enabled channel per lead. */
    totalSends: (row.waEnabled || 0) + (row.emEnabled || 0),
    successfulSends: (row.waSent || 0) + (row.emSent || 0),
    failedSends: (row.waFailed || 0) + (row.emFailed || 0),
    pendingSends: (row.waPending || 0) + (row.emPending || 0),
  },
});

/** `$sum` expression counting recipients where the channel is on and its status is in `statuses`. */
const countWhere = (channel, statuses) => ({
  $sum: {
    $cond: [
      {
        $and: [
          { $eq: [`$${channel}.enabled`, true] },
          { $in: [`$${channel}.status`, statuses] },
        ],
      },
      1,
      0,
    ],
  },
});

/** `$group` stage shared by the single-campaign and campaign-list stats queries. */
export const campaignStatsGroupStage = (idExpression) => ({
  $group: {
    _id: idExpression,
    total: { $sum: 1 },
    waEnabled: { $sum: { $cond: [{ $eq: ['$whatsapp.enabled', true] }, 1, 0] } },
    waPending: countWhere('whatsapp', ['pending']),
    waSent: countWhere('whatsapp', ['sent', 'delivered', 'read']),
    waDelivered: countWhere('whatsapp', ['delivered', 'read']),
    waRead: countWhere('whatsapp', ['read']),
    waFailed: countWhere('whatsapp', ['failed']),
    emEnabled: { $sum: { $cond: [{ $eq: ['$email.enabled', true] }, 1, 0] } },
    emPending: countWhere('email', ['pending']),
    emSent: countWhere('email', ['sent', 'delivered', 'opened', 'clicked']),
    emDelivered: countWhere('email', ['delivered', 'opened', 'clicked']),
    emOpened: countWhere('email', ['opened', 'clicked']),
    emClicked: countWhere('email', ['clicked']),
    emFailed: countWhere('email', ['failed']),
    emOpenCount: { $sum: '$email.openCount' },
    emClickCount: { $sum: '$email.clickCount' },
  },
});

/** 1x1 transparent GIF returned by the open-tracking endpoint. */
export const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);
