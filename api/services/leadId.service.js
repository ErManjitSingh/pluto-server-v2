import LeadCounter from '../models/leadCounter.model.js';
import Lead from '../models/lead.model.js';

function normalizePublish(publish) {
  const p = (publish || '').toString().toLowerCase();
  return p === 'demand' ? 'demand' : 'ptw';
}

async function getSmallestMissingNumberFor(prefix) {
  const re = new RegExp(`^${prefix}\\d+$`);
  const docs = await Lead.find({ leadId: re }).select('leadId').lean();

  const used = new Set();
  for (const d of docs) {
    const s = (d.leadId || '').toString();
    const n = parseInt(s.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > 0) used.add(n);
  }

  let i = 1;
  while (used.has(i)) i++;
  return i;
}

/**
 * Get next leadId and publish in sequence: ptw1, demand1, ptw2, demand2, ptw3, demand3...
 * Odd counter -> leadId "ptw{N}", publish "ptw"
 * Even counter -> leadId "demand{N}", publish "demand"
 * @returns { Promise<{ leadId: string, publish: string }> }
 */
export async function getNextLeadIdAndPublish() {
  // Ensure counter doc exists and has nextPublish set (for gap-filling IDs).
  const counterDoc = await LeadCounter.findOneAndUpdate(
    { name: 'leadSequence' },
    { $setOnInsert: { nextPublish: 'ptw' } },
    { new: true, upsert: true }
  ).exec();

  const publish = normalizePublish(counterDoc?.nextPublish);
  const num = await getSmallestMissingNumberFor(publish);
  const leadId = `${publish}${num}`;

  await LeadCounter.updateOne(
    { name: 'leadSequence' },
    { $set: { nextPublish: publish === 'ptw' ? 'demand' : 'ptw' } }
  ).exec();

  return { leadId, publish };
}

/**
 * Same global counter as getNextLeadIdAndPublish, but picks the next counter value whose
 * parity matches the requested publish (ptw = odd counter, demand = even).
 * If the natural next step would be the wrong type, lastCounter advances by 2 once
 * (may leave a gap in the opposite type's numbering — same as skipping that slot).
 */
export async function getNextLeadIdAndPublishPrefer(publishPreference) {
  const pref = (publishPreference || '').toString().toLowerCase();
  if (pref !== 'ptw' && pref !== 'demand') {
    return getNextLeadIdAndPublish();
  }

  // Gap-filling: choose smallest missing number for the requested type.
  const publish = normalizePublish(pref);
  const num = await getSmallestMissingNumberFor(publish);
  const leadId = `${publish}${num}`;

  return { leadId, publish };
}

/**
 * Get next leadId only (for manual crm-create-lead when leadId not provided)
 * Uses same sequence as getNextLeadIdAndPublish so manual and Meta leads share the sequence.
 */
export async function getNextLeadId() {
  const { leadId } = await getNextLeadIdAndPublish();
  return leadId;
}
