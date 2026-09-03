import mongoose from 'mongoose';
import Lead from '../models/lead.model.js';
import Maker from '../models/maker.model.js';
import {
  createLead,
  updateLead,
  deleteLead,
  updateLeadStatusNote,
} from '../controllers/lead.controller.js';
import { runController } from '../utils/runController.js';

const SEARCH_LIMIT = 20;
const WRITE_TOOLS = new Set(['create_lead', 'update_lead', 'delete_lead']);

const LEAD_PREVIEW_FIELDS = [
  '_id',
  'leadId',
  'name',
  'mobile',
  'email',
  'destination',
  'travelDate',
  'leadStatus',
  'budget',
  'from',
  'adults',
  'kids',
  'days',
  'nights',
  'converted',
  'totalAmount',
  'paidAmount',
  'remainingAmount',
  'publish',
  'assignedUserId',
  'assignedAt',
  'createdAt',
  'source',
  'guestLocation',
];

const UPDATE_FIELDS = [
  'name',
  'email',
  'mobile',
  'destination',
  'travelDate',
  'budget',
  'leadStatus',
  'converted',
  'adults',
  'kids',
  'days',
  'nights',
  'from',
  'guestLocation',
  'foodPreference',
  'stayPreference',
  'packageCategory',
  'tourType',
  'packageType',
  'persons',
  'totalAmount',
  'source',
  'assignedUserId',
  'profession',
  'ageGroup',
];

const CREATE_FIELDS = [
  ...UPDATE_FIELDS,
  'publish',
  'mealPlans',
  'noOfRooms',
  'extraBeds',
  'stayPreference',
  'EP',
];

export const AI_LEAD_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_leads',
      description:
        'Search accessible leads. Executive: own created or assigned. Admin/manager: isAssignedLead true for their company only (ptw or demand). Never mix companies. Returns up to 20 rows plus total count. Date filters are full IST calendar days. For Assigned Leads tab "yesterday/today/date" counts use assignedToday/assignedYesterday/assignedOn.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Customer name, partial match' },
          mobile: { type: 'string' },
          leadId: { type: 'string', description: 'Business lead id like PTW-1023' },
          destination: { type: 'string' },
          leadStatus: { type: 'string' },
          assignedUserName: { type: 'string', description: 'Executive first or last name' },
          converted: { type: 'boolean' },
          createdToday: { type: 'boolean', description: 'createdAt during today IST' },
          createdYesterday: { type: 'boolean', description: 'createdAt during yesterday IST' },
          createdOn: { type: 'string', description: 'YYYY-MM-DD, createdAt that IST day only' },
          createdFrom: { type: 'string', description: 'YYYY-MM-DD start (IST). Alone = that one day.' },
          createdTo: { type: 'string', description: 'YYYY-MM-DD end inclusive (IST)' },
          assignedToday: { type: 'boolean', description: 'assignedAt during today IST. Use for aaj kitni leads.' },
          assignedYesterday: { type: 'boolean', description: 'assignedAt during yesterday IST. Use for kal kitni leads on Assigned Leads tab.' },
          assignedOn: { type: 'string', description: 'YYYY-MM-DD, assignedAt that IST day only' },
          assignedFrom: { type: 'string', description: 'YYYY-MM-DD start (IST). Alone = that one day.' },
          assignedTo: { type: 'string', description: 'YYYY-MM-DD end inclusive (IST)' },
          travelFrom: { type: 'string', description: 'YYYY-MM-DD travelDate start IST' },
          travelTo: { type: 'string', description: 'YYYY-MM-DD travelDate end inclusive IST' },
          countOnly: { type: 'boolean' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_lead',
      description: 'Get one accessible lead by Mongo _id or business leadId.',
      parameters: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Mongo _id or leadId' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_lead',
      description:
        'Create a lead. Call only when name and mobile are known. Do not call for bulk creates.',
      parameters: {
        type: 'object',
        required: ['name', 'mobile'],
        properties: {
          name: { type: 'string' },
          mobile: { type: 'string' },
          email: { type: 'string' },
          destination: { type: 'string' },
          travelDate: { type: 'string' },
          budget: { type: 'string' },
          leadStatus: { type: 'string' },
          adults: { type: 'string' },
          kids: { type: 'string' },
          days: { type: 'string' },
          nights: { type: 'string' },
          from: { type: 'string' },
          guestLocation: { type: 'string' },
          publish: { type: 'string', description: 'ptw or demand. Omit to use user company.' },
          source: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_lead',
      description:
        'Update one lead by Mongo _id. If multiple people match a name, search first and ask which id. Use note/timing to append a follow-up via existing status-note logic.',
      parameters: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Mongo _id from search_leads/get_lead' },
          name: { type: 'string' },
          mobile: { type: 'string' },
          email: { type: 'string' },
          destination: { type: 'string' },
          travelDate: { type: 'string' },
          budget: { type: 'string' },
          leadStatus: { type: 'string' },
          converted: { type: 'boolean' },
          adults: { type: 'string' },
          kids: { type: 'string' },
          assignedUserId: { type: 'string' },
          totalAmount: { type: 'number' },
          note: { type: 'string', description: 'Follow-up note to append' },
          timing: { type: 'string', description: 'Follow-up timing string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_lead',
      description: 'Delete one lead by Mongo _id. Never delete multiple leads.',
      parameters: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Mongo _id' },
        },
      },
    },
  },
];

export function isWriteTool(name) {
  return WRITE_TOOLS.has(name);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeMobileDigits(mobile) {
  if (mobile == null) return null;
  const digits = String(mobile).replace(/\D/g, '');
  if (!digits) return null;
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function publishFromCompany(companyName) {
  const c = String(companyName || '').toLowerCase();
  if (c.includes('demand')) return 'demand';
  if (c.includes('ptw')) return 'ptw';
  return undefined;
}

const IST_MS = 5.5 * 60 * 60 * 1000;
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function ymdFromIstParts(y, m0, d) {
  return `${y}-${pad2(m0 + 1)}-${pad2(d)}`;
}

function istYmdFromDate(date) {
  const ist = new Date(date.getTime() + IST_MS);
  return ymdFromIstParts(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
}

function istDayRangeForYmd(ymd) {
  const m = String(ymd || '').match(YMD_RE);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const startUtc = Date.UTC(y, mo, d, 0, 0, 0, 0) - IST_MS;
  return {
    start: new Date(startUtc),
    end: new Date(startUtc + DAY_MS),
    ymd: `${m[1]}-${m[2]}-${m[3]}`,
  };
}

function extractYmd(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  const direct = s.match(YMD_RE);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return istYmdFromDate(d);
}

export function istCalendarLabels() {
  const todayYmd = istYmdFromDate(new Date());
  const today = istDayRangeForYmd(todayYmd);
  const yesterdayYmd = istYmdFromDate(new Date(today.start.getTime() - 1));
  return { today: todayYmd, yesterday: yesterdayYmd, timezone: 'Asia/Kolkata' };
}

function resolveIstRange({ today, yesterday, on, from, to }) {
  const labels = istCalendarLabels();
  if (today) {
    const r = istDayRangeForYmd(labels.today);
    return r ? { ...r, kind: 'today' } : null;
  }
  if (yesterday) {
    const r = istDayRangeForYmd(labels.yesterday);
    return r ? { ...r, kind: 'yesterday' } : null;
  }
  if (on) {
    const ymd = extractYmd(on);
    const r = ymd && istDayRangeForYmd(ymd);
    return r ? { ...r, kind: 'on' } : null;
  }
  const fromYmd = extractYmd(from);
  const toYmd = extractYmd(to);
  if (fromYmd && !toYmd) {
    const r = istDayRangeForYmd(fromYmd);
    return r ? { ...r, kind: 'from-day' } : null;
  }
  if (!fromYmd && toYmd) {
    const r = istDayRangeForYmd(toYmd);
    return r ? { ...r, kind: 'to-day' } : null;
  }
  if (fromYmd && toYmd) {
    const startR = istDayRangeForYmd(fromYmd);
    const endR = istDayRangeForYmd(toYmd);
    if (!startR || !endR) return null;
    return {
      start: startR.start,
      end: endR.end,
      ymd: `${fromYmd}..${toYmd}`,
      kind: 'range',
    };
  }
  return null;
}

function mongoRange(range) {
  const out = {};
  if (range.start) out.$gte = range.start;
  if (range.end) out.$lt = range.end;
  return out;
}

function dateFilterMeta(field, range) {
  if (!range) return null;
  return {
    field,
    istDay: range.ymd,
    kind: range.kind,
    from: range.start?.toISOString(),
    to: range.end?.toISOString(),
  };
}

function pick(obj, fields) {
  const out = {};
  for (const key of fields) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

function leadPreview(lead) {
  if (!lead) return null;
  const doc = typeof lead.toObject === 'function' ? lead.toObject() : lead;
  const preview = pick(doc, LEAD_PREVIEW_FIELDS);
  preview.id = doc._id ? String(doc._id) : undefined;
  const notes = Array.isArray(doc.leadstatusnote) ? doc.leadstatusnote : [];
  const last = notes.length ? notes[notes.length - 1] : null;
  if (last) {
    preview.lastNote = {
      leadstatus: last.leadstatus || null,
      note: last.note || null,
      timing: last.timing || null,
    };
  }
  return preview;
}

function parseDate(value) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function userAccessFilter(userId) {
  return {
    $or: [
      { createdBy: userId, isCommonLead: { $ne: true } },
      { isAssignedLead: true, assignedUserId: userId },
    ],
  };
}

function isManagerOrAdmin(maker) {
  const type = String(maker?.userType || '').trim().toLowerCase();
  const designation = String(maker?.designation || '').trim().toLowerCase();
  return type === 'admin' || type === 'manager' || designation === 'admin' || designation === 'manager';
}

function companyAssignedFilter(maker) {
  const publish = publishFromCompany(maker?.companyName);
  if (!isManagerOrAdmin(maker) || !publish) return null;
  return { isAssignedLead: true, publish };
}

function leadAccessFilter(user, maker) {
  return companyAssignedFilter(maker) || userAccessFilter(user.id);
}

function compactToolPayload(payload) {
  return JSON.stringify(payload);
}

async function searchLeads(user, maker, args = {}) {
  const filter = { ...leadAccessFilter(user, maker) };
  const and = [];

  if (args.name) {
    and.push({ name: { $regex: escapeRegex(args.name.trim()), $options: 'i' } });
  }
  if (args.destination) {
    and.push({
      destination: { $regex: escapeRegex(args.destination.trim()), $options: 'i' },
    });
  }
  if (args.leadStatus) {
    and.push({
      leadStatus: { $regex: `^${escapeRegex(args.leadStatus.trim())}$`, $options: 'i' },
    });
  }
  if (args.leadId) {
    and.push({ leadId: { $regex: escapeRegex(String(args.leadId).trim()), $options: 'i' } });
  }
  const mobile = normalizeMobileDigits(args.mobile);
  if (mobile) {
    and.push({ mobile: { $regex: `${mobile}$` } });
  }
  if (args.assignedUserName) {
    const q = escapeRegex(args.assignedUserName.trim());
    const makers = await Maker.find({
      $or: [
        { firstName: { $regex: q, $options: 'i' } },
        { lastName: { $regex: q, $options: 'i' } },
      ],
    })
      .select('_id')
      .limit(10)
      .lean();
    if (!makers.length) {
      return { ok: true, total: 0, shown: 0, leads: [], scope: companyAssignedFilter(maker) || 'own' };
    }
    and.push({ assignedUserId: { $in: makers.map((m) => m._id) } });
  }
  if (typeof args.converted === 'boolean') {
    and.push({ converted: args.converted });
  }

  const createdRange = resolveIstRange({
    today: args.createdToday,
    yesterday: args.createdYesterday,
    on: args.createdOn,
    from: args.createdFrom,
    to: args.createdTo,
  });
  if (createdRange) {
    and.push({ createdAt: mongoRange(createdRange) });
  }

  const assignedRange = resolveIstRange({
    today: args.assignedToday,
    yesterday: args.assignedYesterday,
    on: args.assignedOn,
    from: args.assignedFrom,
    to: args.assignedTo,
  });
  if (assignedRange) {
    and.push({ assignedAt: mongoRange(assignedRange) });
  }

  const travelRange = resolveIstRange({
    from: args.travelFrom,
    to: args.travelTo,
  });
  if (travelRange) {
    and.push({ travelDate: mongoRange(travelRange) });
  }

  const dateFilter = [
    dateFilterMeta('createdAt', createdRange),
    dateFilterMeta('assignedAt', assignedRange),
    dateFilterMeta('travelDate', travelRange),
  ].filter(Boolean);

  if (and.length) filter.$and = and;

  const total = await Lead.countDocuments(filter);
  const scope = companyAssignedFilter(maker) || 'own';
  if (args.countOnly) {
    return { ok: true, total, leads: [], scope, dateFilter };
  }

  const sort = assignedRange && !createdRange ? { assignedAt: -1 } : { createdAt: -1 };
  const leads = await Lead.find(filter)
    .select(LEAD_PREVIEW_FIELDS.join(' ') + ' leadstatusnote')
    .sort(sort)
    .limit(SEARCH_LIMIT)
    .lean();

  return {
    ok: true,
    total,
    shown: leads.length,
    leads: leads.map(leadPreview),
    scope,
    dateFilter,
  };
}

async function getLeadByIdOrLeadId(user, maker, id) {
  const raw = String(id || '').trim();
  if (!raw) {
    return { ok: false, message: 'id is required' };
  }

  const access = leadAccessFilter(user, maker);
  const projection = LEAD_PREVIEW_FIELDS.join(' ') + ' leadstatusnote';

  if (mongoose.isValidObjectId(raw)) {
    const byId = await Lead.findOne({ _id: raw, ...access }).select(projection).lean();
    if (byId) return { ok: true, lead: leadPreview(byId) };
  }

  const lead = await Lead.findOne({
    ...access,
    leadId: { $regex: `^${escapeRegex(raw)}$`, $options: 'i' },
  })
    .select(projection)
    .lean();

  if (!lead) {
    return { ok: false, message: 'Lead not found' };
  }
  return { ok: true, lead: leadPreview(lead) };
}

function buildCreateBody(args, maker) {
  const body = pick(args, CREATE_FIELDS);
  if (!body.publish) {
    const fromCompany = publishFromCompany(maker?.companyName);
    if (fromCompany) body.publish = fromCompany;
  }
  if (body.travelDate) {
    const parsed = parseDate(body.travelDate);
    if (parsed) body.travelDate = parsed;
  }
  return body;
}

function buildUpdateBody(args) {
  const body = pick(args, UPDATE_FIELDS);
  if (body.travelDate) {
    const parsed = parseDate(body.travelDate);
    if (parsed) body.travelDate = parsed;
  }
  return body;
}

function missingCreateFields(args = {}) {
  const missing = [];
  if (!String(args.name || '').trim()) missing.push('name');
  if (!String(args.mobile || '').trim()) missing.push('mobile');
  return missing;
}

function confirmPreview(tool, args) {
  if (tool === 'create_lead') {
    return pick(args, ['name', 'mobile', 'email', 'destination', 'travelDate', 'budget', 'leadStatus', 'publish']);
  }
  if (tool === 'update_lead') {
    return pick(args, ['id', 'leadStatus', 'converted', 'destination', 'travelDate', 'budget', 'note', 'timing', 'assignedUserId', 'name', 'mobile']);
  }
  return pick(args, ['id']);
}

export function inspectWriteTool(name, args = {}) {
  if (name === 'create_lead') {
    const missing = missingCreateFields(args);
    if (missing.length) {
      return {
        kind: 'need_more',
        message: `Missing required fields: ${missing.join(', ')}`,
        missing,
      };
    }
  }

  if (name === 'update_lead' || name === 'delete_lead') {
    if (!String(args.id || '').trim()) {
      return { kind: 'need_more', message: 'Lead id is required. Search first.' };
    }
  }

  if (name === 'update_lead') {
    const body = buildUpdateBody(args);
    const hasNote = Boolean(args.note || args.timing);
    if (!Object.keys(body).length && !hasNote) {
      return { kind: 'need_more', message: 'No update fields provided.' };
    }
  }

  return {
    kind: 'confirm',
    tool: name,
    args,
    preview: confirmPreview(name, args),
  };
}

async function executeCreate(user, maker, args) {
  const body = buildCreateBody(args, maker);
  const wrapped = await runController(createLead, { user, body });
  const data = wrapped.data || {};
  const leadDoc = data.lead?._id ? data.lead : data._id ? data : data.lead;
  return {
    ok: wrapped.statusCode < 400,
    statusCode: wrapped.statusCode,
    created: data.created !== false && wrapped.statusCode === 201,
    message: data.message || (wrapped.statusCode === 201 ? 'Lead created' : undefined),
    lead: leadPreview(leadDoc),
  };
}

async function executeUpdate(user, maker, args) {
  const id = String(args.id).trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, message: 'id must be the Mongo _id from search_leads/get_lead' };
  }

  const fieldBody = buildUpdateBody(args);
  let updated = null;

  if (Object.keys(fieldBody).length) {
    const wrapped = await runController(updateLead, {
      user,
      params: { id },
      body: fieldBody,
    });
    if (wrapped.statusCode >= 400) {
      return {
        ok: false,
        statusCode: wrapped.statusCode,
        message: wrapped.data?.message || 'Lead not found',
      };
    }
    updated = wrapped.data;
  }

  if (args.note || args.timing) {
    const accessible = await Lead.findOne({
      _id: id,
      $or: [
        { createdBy: user.id },
        { isAssignedLead: true, assignedUserId: user.id },
      ],
    })
      .select('_id leadStatus')
      .lean();

    if (!accessible) {
      return { ok: false, message: 'Lead not found' };
    }

    const leadstatus = args.leadStatus || accessible.leadStatus || 'Follow Up';
    const noteBody = {
      leadstatus,
      note: args.note || '',
      timing: args.timing || '',
      userid: user.id,
      teamleaderid: maker?.teamLeaderId || undefined,
      managerid: maker?.managerId || undefined,
    };
    const wrappedNote = await runController(updateLeadStatusNote, {
      user,
      params: { id },
      body: noteBody,
    });
    if (wrappedNote.statusCode >= 400) {
      return {
        ok: false,
        statusCode: wrappedNote.statusCode,
        message: wrappedNote.data?.message || 'Could not add follow-up note',
      };
    }
    updated = wrappedNote.data;
  }

  return {
    ok: true,
    message: 'Lead updated',
    lead: leadPreview(updated),
  };
}

async function executeDelete(user, args) {
  const id = String(args.id).trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, message: 'id must be the Mongo _id from search_leads/get_lead' };
  }
  const wrapped = await runController(deleteLead, {
    user,
    params: { id },
  });
  return {
    ok: wrapped.statusCode < 400,
    statusCode: wrapped.statusCode,
    message: wrapped.data?.message || (wrapped.statusCode < 400 ? 'Lead deleted successfully' : 'Lead not found'),
  };
}

export async function executeLeadTool(name, args, { user, maker, executeWrites = false } = {}) {
  try {
    if (name === 'search_leads') {
      return { kind: 'result', data: await searchLeads(user, maker, args || {}) };
    }
    if (name === 'get_lead') {
      return { kind: 'result', data: await getLeadByIdOrLeadId(user, maker, args?.id) };
    }

    if (!WRITE_TOOLS.has(name)) {
      return { kind: 'result', data: { ok: false, message: `Unknown tool: ${name}` } };
    }

    if (!executeWrites) {
      const inspected = inspectWriteTool(name, args || {});
      if (inspected.kind === 'need_more') {
        return { kind: 'result', data: { ok: false, ...inspected } };
      }
      return { kind: 'confirm', ...inspected };
    }

    if (name === 'create_lead') {
      return { kind: 'result', data: await executeCreate(user, maker, args || {}) };
    }
    if (name === 'update_lead') {
      return { kind: 'result', data: await executeUpdate(user, maker, args || {}) };
    }
    if (name === 'delete_lead') {
      return { kind: 'result', data: await executeDelete(user, args || {}) };
    }
  } catch (error) {
    return {
      kind: 'result',
      data: { ok: false, message: error.message || 'Tool failed' },
    };
  }

  return { kind: 'result', data: { ok: false, message: `Unknown tool: ${name}` } };
}

export { compactToolPayload, leadPreview, SEARCH_LIMIT };
