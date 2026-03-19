import Lead from '../models/lead.model.js';
import mongoose from 'mongoose';
import { getNextLeadIdAndPublish } from './leadId.service.js';
import { initializeLeadRemainingAmount } from '../controllers/banktransactions.controller.js';

const META_GRAPH_BASE = 'https://graph.facebook.com/v25.0';

// Form ID -> Form name (from Meta Lead Ad forms)
const FORM_ID_TO_NAME = {
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
  '2674038349644478', '1223842246538694', '1471047764590067', '740770488625534',
  '1606772576983358', '803369272680705', '1382788463517327', '1595736464927418',
  '1528098575144345', '1908365669781665', '1398680488634977', '1245471024064781',
  '1367808738124925', '1393329672350546', '4254475408166247', '4078392495747198',
  '814847136887082', '1981206252297495', '1616441215777324', '1415240969129159',
  '1146314916381605', '1876547592761895', '2472954876232013', '409968121678852',
  '463909945988547'
];

function getFormIds() {
  const fromEnv = process.env.META_FORM_IDS;
  if (fromEnv && typeof fromEnv === 'string') {
    return fromEnv.split(',').map((id) => id.trim()).filter(Boolean);
  }
  return DEFAULT_FORM_IDS;
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

/**
 * Check if we should skip creating lead due to mobile duplicate:
 * If same mobile exists and the most recent lead from that mobile is within 10 days of this meta lead's time, skip.
 * Returns true = skip (do not post), false = allow post.
 */
async function shouldSkipByMobile(mobile, metaLeadCreatedTime) {
  const normalized = normalizeMobile(mobile);
  if (!normalized) return false;

  const metaTime = metaLeadCreatedTime ? new Date(metaLeadCreatedTime).getTime() : Date.now();
  // Simple: treat the incoming Meta mobile as canonical and look for an exact match
  const latestByMobile = await Lead.findOne({ mobile })
    .sort({ createdAt: -1 })
    .select('createdAt')
    .lean();
  if (!latestByMobile) return false;

  const lastCreated = new Date(latestByMobile.createdAt).getTime();
  const gapMs = metaTime - lastCreated;
  return gapMs < TEN_DAYS_MS;
}

/**
 * Transform one Meta lead item to base CRM payload (no lead_meta_id - we set that per ptw/demand).
 * Includes sourceFormId and sourceFormName for source display.
 */
function transformMetaLeadToPayload(metaLead, formId) {
  const fieldData = metaLead.field_data || [];
  const name = getFieldValue(fieldData, 'full_name');
  const mobile = getFieldValue(fieldData, 'phone_number');
  const email = getFieldValue(fieldData, 'email');
  const travelType = getFieldValue(fieldData, 'your_travel_type_');
  const lookingFor = getFieldValue(fieldData, 'what_you_are_looking_for_?');
  const travelDateStr = getFieldValue(fieldData, 'your_travel_date_?');
  const formName = formId ? (FORM_ID_TO_NAME[formId] || formId) : '';

  return {
    name: name || '',
    mobile: mobile || '',
    email: email || '',
    packageType: travelType || lookingFor || undefined,
    destination: travelDateStr || undefined,
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
 */
export async function syncMetaLeads() {
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) {
    console.warn('⚠️ Meta lead sync skipped: META_ACCESS_TOKEN not set');
    return { success: false, reason: 'META_ACCESS_TOKEN not set', created: 0 };
  }

  const formIds = getFormIds();
  const fixedUserId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
  let created = 0;

  try {
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

        const payload = transformMetaLeadToPayload(metaLead, formId);

        // Skip if same mobile already submitted within 10 days (do not post duplicate)
        if (await shouldSkipByMobile(payload.mobile, metaLead.created_time)) {
          continue;
        }

        // 1) PTW lead: create if lead_meta_id "{metaId}_ptw" does not exist
        const existingPtw = await Lead.findOne({ lead_meta_id: `${metaId}_ptw` });
        if (!existingPtw) {
          const { leadId, publish } = await getNextLeadIdAndPublish();
          const leadData = {
            ...payload,
            lead_meta_id: `${metaId}_ptw`,
            leadId,
            publish,
            isAssignedLead: true,
            isCommonLead: true,
            createdBy: fixedUserId
          };
          const newLead = new Lead(leadData);
          const savedLead = await newLead.save();
          try {
            if (savedLead.totalAmount !== undefined && savedLead.totalAmount !== null) {
              await initializeLeadRemainingAmount(savedLead._id);
            }
          } catch (err) {
            console.error('Error initializing remaining amount for meta lead (ptw):', err.message);
          }
          created++;
        }

        // 2) Demand lead: create if lead_meta_id "{metaId}_demand" does not exist
        const existingDemand = await Lead.findOne({ lead_meta_id: `${metaId}_demand` });
        if (!existingDemand) {
          const { leadId, publish } = await getNextLeadIdAndPublish();
          const leadData = {
            ...payload,
            lead_meta_id: `${metaId}_demand`,
            leadId,
            publish,
            isAssignedLead: true,
            isCommonLead: true,
            createdBy: fixedUserId
          };
          const newLead = new Lead(leadData);
          const savedLead = await newLead.save();
          try {
            if (savedLead.totalAmount !== undefined && savedLead.totalAmount !== null) {
              await initializeLeadRemainingAmount(savedLead._id);
            }
          } catch (err) {
            console.error('Error initializing remaining amount for meta lead (demand):', err.message);
          }
          created++;
        }
      }
    }

    if (created > 0) {
      console.log(`✅ Meta lead sync: ${created} new lead(s) created`);
    }
    return { success: true, created };
  } catch (error) {
    console.error('❌ Meta lead sync error:', error);
    return { success: false, error: error.message, created };
  }
}
