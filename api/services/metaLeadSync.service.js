import Lead from '../models/lead.model.js';
import SystemLock from '../models/systemLock.model.js';
import mongoose from 'mongoose';
import { getNextLeadIdAndPublishPrefer } from './leadId.service.js';
import { initializeLeadRemainingAmount } from '../controllers/banktransactions.controller.js';

const META_SYNC_LOCK_ID = 'meta_lead_sync';
/** Lock TTL — longer than a full sync so a crashed holder cannot block forever, but short enough to recover. */
const META_SYNC_LOCK_TTL_MS = 25 * 60 * 1000;

/** In-process guard (same Node process: scheduled + manual API). */
let metaSyncInProgress = false;

function isDuplicateKeyError(err) {
  return Boolean(err && (err.code === 11000 || err.code === 11001));
}

/**
 * Acquire Mongo advisory lock so only one instance (PM2/cluster/multi-server) runs sync.
 * @returns {Promise<boolean>}
 */
async function acquireMetaSyncLock() {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + META_SYNC_LOCK_TTL_MS);
  const holder = `pid:${process.pid}`;

  try {
    await SystemLock.create({
      _id: META_SYNC_LOCK_ID,
      expiresAt,
      lockedAt: now,
      holder
    });
    return true;
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;

    // Steal only if previous lock expired (crashed / stuck process).
    const stolen = await SystemLock.findOneAndUpdate(
      { _id: META_SYNC_LOCK_ID, expiresAt: { $lte: now } },
      { $set: { expiresAt, lockedAt: now, holder } },
      { new: true }
    );
    return Boolean(stolen);
  }
}

async function releaseMetaSyncLock() {
  try {
    await SystemLock.deleteOne({ _id: META_SYNC_LOCK_ID });
  } catch (err) {
    console.error('Meta sync lock release error:', err.message);
  }
}

/**
 * Create one CRM lead for a publish type. Returns saved doc, or null if skipped / duplicate race lost.
 */
async function createMetaPublishLead({
  payload,
  metaId,
  publish,
  metaLeadCreatedTime,
  fixedUserId
}) {
  const leadMetaId = `${metaId}_${publish}`;

  const existing = await Lead.findOne({ lead_meta_id: leadMetaId }).select('_id').lean();
  if (existing) return null;

  if (await shouldSkipByMobileAndPublish(payload.mobile, publish, metaLeadCreatedTime)) {
    return null;
  }

  const { leadId } = await getNextLeadIdAndPublishPrefer(publish);
  const leadData = {
    ...payload,
    lead_meta_id: leadMetaId,
    leadId,
    publish,
    isAssignedLead: true,
    isCommonLead: true,
    createdBy: fixedUserId
  };

  try {
    const savedLead = await new Lead(leadData).save();
    try {
      if (savedLead.totalAmount !== undefined && savedLead.totalAmount !== null) {
        await initializeLeadRemainingAmount(savedLead._id);
      }
    } catch (err) {
      console.error(`Error initializing remaining amount for meta lead (${publish}):`, err.message);
    }
    return savedLead;
  } catch (err) {
    // Another instance won the race — unique lead_meta_id blocked the insert.
    if (isDuplicateKeyError(err)) {
      console.warn(`⏭️  Meta lead skipped (duplicate lead_meta_id): ${leadMetaId}`);
      return null;
    }
    throw err;
  }
}

const META_GRAPH_BASE = 'https://graph.facebook.com/v25.0';

// Form ID -> Form name (from Meta Lead Ad forms)
const FORM_ID_TO_NAME = {
  '1903635730309193': 'Shimla Manali Tour package',
  '1796326498004957': 'Rajasthan Tour Package',
  '1403948758244400': 'Kerala Tour Package',
  '2674038349644478': 'Hotel JK Dharamshala-copy',
  '1223842246538694': 'Hotel JK Dharamshala',
  '1471047764590067': 'Leh Tour Packages-copy-copy',
  '740770488625534': 'Andaman Beach Escape — Just ₹19,000/Person-copy',
  '1606772576983358': 'Andaman Beach Escape — Just ₹19,000/Person',
  '803369272680705': 'Spiti Tour Packass',
  '1382788463517327': 'Meghalaya Tour Packages-copy-copy-copy',
  '1595736464927418': 'Spiti Tour Packagess',
  '1528098575144345': 'Spiti Tour Packages-copy',
  '1908365669781665': 'Gujarat  Tour Packages',
  '1398680488634977': 'Only Job',
  '1245471024064781': 'Shimla–Manali Tour Packages-copy',
  '1367808738124925': 'Meghalaya Tour Packages-copy-copy',
  '1393329672350546': 'Arunachal  Tour Packages-copy-copy',
  '4254475408166247': 'Meghalaya Tour Packages-copy',
  '4078392495747198': 'Spiti Tour Packages',
  '814847136887082': 'DUBAI TOUR PACKAGE-copy',
  '1981206252297495': 'Vietnam Tour Packages',
  '1616441215777324': 'Bali Tour package',
  '1415240969129159': 'DUBAI TOUR PACKAGE',
  '1146314916381605': 'DS Amarnath Query',
  '1876547592761895': 'DS Bhutan Query-copy',
  '2472954876232013': 'DS Bhutan Query',
  '409968121678852': 'DS Himachal Query form-copy',
  '463909945988547': 'DS Himachal Query form'
};

// Form IDs from Meta (FB/Instagram Lead Ads) - can override via env META_FORM_IDS (comma-separated)
const DEFAULT_FORM_IDS = [
  '1903635730309193', '1796326498004957', '1403948758244400', '2674038349644478', '1223842246538694',
  '1471047764590067',
  '740770488625534', '1606772576983358', '803369272680705', '1382788463517327',
  '1595736464927418', '1528098575144345', '1908365669781665', '1398680488634977',
  '1245471024064781', '1367808738124925', '1393329672350546', '4254475408166247',
  '4078392495747198', '814847136887082', '1981206252297495', '1616441215777324',
  '1415240969129159', '1146314916381605', '1876547592761895', '2472954876232013',
  '409968121678852', '463909945988547'
];

function getFormIds() {
  const fromEnv = process.env.META_FORM_IDS;
  if (fromEnv && typeof fromEnv === 'string') {
    return fromEnv.split(',').map((id) => id.trim()).filter(Boolean);
  }
  return DEFAULT_FORM_IDS;
}

/** Min Meta `created_time` (inclusive). Only leads on or after this instant are posted. Override with META_LEAD_SYNC_MIN_CREATED_AT (ISO 8601, e.g. 2026-07-22T14:00:00+05:30). */
function getMetaLeadSyncMinCreatedAtMs() {
  const env = process.env.META_LEAD_SYNC_MIN_CREATED_AT;
  if (env && typeof env === 'string' && env.trim()) {
    const t = Date.parse(env.trim());
    if (!Number.isNaN(t)) return t;
  }
  return Date.parse('2026-07-22T14:00:00+05:30');
}

function isMetaLeadOnOrAfterMinCreated(metaLead) {
  if (!metaLead.created_time) return false;
  const t = new Date(metaLead.created_time).getTime();
  if (Number.isNaN(t)) return false;
  return t >= getMetaLeadSyncMinCreatedAtMs();
}

/**
 * Extract value from Meta field_data by field name (first value in values array)
 */
function getFieldValue(fieldData, name) {
  const field = fieldData.find((f) => f.name === name);
  if (!field || !field.values || !field.values.length) return undefined;
  return field.values[0];
}

const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

/** Normalize mobile for duplicate check (trim, strip spaces) */
function normalizeMobile(mobile) {
  if (mobile == null || typeof mobile !== 'string') return '';
  return mobile.replace(/\s+/g, '').trim();
}

/** Digits only — used so +91..., 91..., spaces all match the same subscriber */
function digitsOnly(mobile) {
  return normalizeMobile(mobile).replace(/\D/g, '');
}

/**
 * Last 10 digits for India-style dedupe (same person even if Meta sends +91 vs 0 vs 10 digits).
 */
function phoneMatchKey(mobile) {
  const d = digitsOnly(mobile);
  if (d.length < 10) return '';
  return d.slice(-10);
}

/**
 * Find most recent lead whose phone matches by digit key (not string equality).
 */
async function findLatestLeadByPhoneDigits(mobile) {
  const key = phoneMatchKey(mobile);
  if (!key) return null;

  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const candidates = await Lead.find({
    $or: [{ mobile: mobile }, { mobile: new RegExp(`${escaped}$`) }]
  })
    .sort({ createdAt: -1 })
    .limit(80)
    .select('mobile createdAt publish')
    .lean();

  for (const doc of candidates) {
    if (phoneMatchKey(doc.mobile) === key) return doc;
  }
  return null;
}

function normalizePublish(publish) {
  if (publish == null) return '';
  return String(publish).trim().toLowerCase();
}

/**
 * Find most recent lead for same phone digits AND same publish.
 */
async function findLatestLeadByPhoneDigitsAndPublish(mobile, publish) {
  const key = phoneMatchKey(mobile);
  if (!key) return null;
  const publishKey = normalizePublish(publish);
  if (!publishKey) return null;

  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const candidates = await Lead.find({
    publish: publishKey,
    $or: [{ mobile: mobile }, { mobile: new RegExp(`${escaped}$`) }]
  })
    .sort({ createdAt: -1 })
    .limit(80)
    .select('mobile createdAt publish')
    .lean();

  for (const doc of candidates) {
    if (phoneMatchKey(doc.mobile) === key) return doc;
  }
  return null;
}

/**
 * Check if we should skip creating lead due to mobile duplicate:
 * If same mobile exists (any common formatting) and the most recent such lead is within 10 days of this meta lead's time, skip.
 * Returns true = skip (do not post), false = allow post.
 */
async function shouldSkipByMobile(mobile, metaLeadCreatedTime) {
  const key = phoneMatchKey(mobile);
  if (!key) return false;

  const metaTime = metaLeadCreatedTime ? new Date(metaLeadCreatedTime).getTime() : Date.now();
  const latestByMobile = await findLatestLeadByPhoneDigits(mobile);
  if (!latestByMobile) return false;

  const lastCreated = new Date(latestByMobile.createdAt).getTime();
  // Same Meta lead submitted twice: created_time may be seconds apart from our DB time — use abs so we never miss duplicates
  return Math.abs(metaTime - lastCreated) < TEN_DAYS_MS;
}

/**
 * Skip duplicates by mobile+publish within 10 days.
 * Returns true = skip (do not create this publish type), false = allow create.
 */
async function shouldSkipByMobileAndPublish(mobile, publish, metaLeadCreatedTime) {
  const publishKey = normalizePublish(publish);
  if (!publishKey) return false;

  const metaTime = metaLeadCreatedTime ? new Date(metaLeadCreatedTime).getTime() : Date.now();
  const latestByMobileAndPublish = await findLatestLeadByPhoneDigitsAndPublish(mobile, publishKey);
  if (!latestByMobileAndPublish) return false;

  const lastCreated = new Date(latestByMobileAndPublish.createdAt).getTime();
  return Math.abs(metaTime - lastCreated) < TEN_DAYS_MS;
}

/**
 * Transform one Meta lead item to base CRM payload (no lead_meta_id - we set that per ptw/demand).
 * Includes sourceFormId and sourceFormName for source display.
 */
function transformMetaLeadToPayload(metaLead, formId) {
  const fieldData = metaLead.field_data || [];
  const name = getFieldValue(fieldData, 'full_name');
  const mobile =
    getFieldValue(fieldData, 'phone_number') ||
    getFieldValue(fieldData, 'phone');
  const email = getFieldValue(fieldData, 'email');
  const travelType = getFieldValue(fieldData, 'your_travel_type_');
  const lookingFor = getFieldValue(fieldData, 'what_you_are_looking_for_?');
  const travelDateStr =
    getFieldValue(fieldData, 'your_travel_date_?') ||
    getFieldValue(fieldData, 'travel_date_?');
  const persons = getFieldValue(fieldData, 'no_of_person_?');
  const formName = formId ? (FORM_ID_TO_NAME[formId] || formId) : '';

  return {
    name: name || '',
    mobile: mobile || '',
    email: email || '',
    packageType: travelType || lookingFor || undefined,
    destination: travelDateStr || undefined,
    persons: persons || undefined,
    source: 'meta',
    sourceFormId: formId || undefined,
    sourceFormName: formName || undefined,
    submittedAt: metaLead.created_time ? new Date(metaLead.created_time) : new Date(),
    leadStatus: 'New Lead'
  };
}

/**
 * Fetch leads for one form from Meta Graph API
 */
async function fetchLeadsForForm(formId, accessToken) {
  const url = `${META_GRAPH_BASE}/${formId}/leads?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meta API ${res.status}: ${text}`);
  }
  const json = await res.json();
  return json.data || [];
}

/**
 * Sync Meta leads: for each Meta lead, create TWO CRM leads (one ptw, one demand) if not already present.
 * Uses lead_meta_id "{metaId}_ptw" and "{metaId}_demand" to skip duplicates.
 * Guarded by in-process + Mongo lock so parallel runs cannot create PTW/Demand duplicates.
 */
export async function syncMetaLeads() {
  if (metaSyncInProgress) {
    console.log('⏭️  Meta lead sync skipped (already running in this process)');
    return { success: false, reason: 'already_running', created: 0 };
  }

  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) {
    console.warn('⚠️ Meta lead sync skipped: META_ACCESS_TOKEN not set');
    return { success: false, reason: 'META_ACCESS_TOKEN not set', created: 0 };
  }

  metaSyncInProgress = true;
  let lockAcquired = false;
  let created = 0;

  try {
    lockAcquired = await acquireMetaSyncLock();
    if (!lockAcquired) {
      console.log('⏭️  Meta lead sync skipped (another instance holds the lock)');
      return { success: false, reason: 'lock_not_acquired', created: 0 };
    }

    const formIds = getFormIds();
    const fixedUserId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');

    for (const formId of formIds) {
      let leads;
      try {
        leads = await fetchLeadsForForm(formId, accessToken);
      } catch (err) {
        console.error(`Meta lead fetch error for form ${formId}:`, err.message);
        continue;
      }

      for (const metaLead of leads) {
        const metaId = metaLead.id;
        if (!metaId) continue;

        if (!isMetaLeadOnOrAfterMinCreated(metaLead)) {
          continue;
        }

        const payload = transformMetaLeadToPayload(metaLead, formId);
        const createArgs = {
          payload,
          metaId,
          metaLeadCreatedTime: metaLead.created_time,
          fixedUserId
        };

        // 1) PTW then 2) Demand — same helpers + unique lead_meta_id for both
        if (await createMetaPublishLead({ ...createArgs, publish: 'ptw' })) created++;
        if (await createMetaPublishLead({ ...createArgs, publish: 'demand' })) created++;
      }
    }

    if (created > 0) {
      console.log(`✅ Meta lead sync: ${created} new lead(s) created`);
    }
    return { success: true, created };
  } catch (error) {
    console.error('❌ Meta lead sync error:', error);
    return { success: false, error: error.message, created };
  } finally {
    if (lockAcquired) {
      await releaseMetaSyncLock();
    }
    metaSyncInProgress = false;
  }
}
