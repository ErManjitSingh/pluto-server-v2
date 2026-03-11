import Lead from '../models/lead.model.js';
import mongoose from 'mongoose';
import { getNextLeadIdAndPublish } from './leadId.service.js';
import { initializeLeadRemainingAmount } from '../controllers/banktransactions.controller.js';

const META_GRAPH_BASE = 'https://graph.facebook.com/v25.0';

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

/**
 * Transform one Meta lead item to base CRM payload (no lead_meta_id - we set that per ptw/demand)
 */
function transformMetaLeadToPayload(metaLead) {
  const fieldData = metaLead.field_data || [];
  const name = getFieldValue(fieldData, 'full_name');
  const mobile = getFieldValue(fieldData, 'phone_number');
  const email = getFieldValue(fieldData, 'email');
  const travelType = getFieldValue(fieldData, 'your_travel_type_');
  const lookingFor = getFieldValue(fieldData, 'what_you_are_looking_for_?');
  const travelDateStr = getFieldValue(fieldData, 'your_travel_date_?');

  return {
    name: name || '',
    mobile: mobile || '',
    email: email || '',
    packageType: travelType || lookingFor || undefined,
    destination: travelDateStr || undefined,
    source: 'meta',
    submittedAt: metaLead.created_time ? new Date(metaLead.created_time) : new Date()
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

        const payload = transformMetaLeadToPayload(metaLead);

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
