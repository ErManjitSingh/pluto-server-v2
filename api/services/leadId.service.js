import LeadCounter from '../models/leadCounter.model.js';

/**
 * Get next leadId and publish in sequence: ptw1, demand1, ptw2, demand2, ptw3, demand3...
 * Odd counter -> leadId "ptw{N}", publish "ptw"
 * Even counter -> leadId "demand{N}", publish "demand"
 * @returns { Promise<{ leadId: string, publish: string }> }
 */
export async function getNextLeadIdAndPublish() {
  const doc = await LeadCounter.findOneAndUpdate(
    { name: 'leadSequence' },
    { $inc: { lastCounter: 1 } },
    { new: true, upsert: true }
  ).exec();

  const counter = doc.lastCounter;
  const isPtw = counter % 2 === 1;
  const num = isPtw ? Math.ceil(counter / 2) : counter / 2;
  const leadId = isPtw ? `ptw${num}` : `demand${num}`;
  const publish = isPtw ? 'ptw' : 'demand';

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
