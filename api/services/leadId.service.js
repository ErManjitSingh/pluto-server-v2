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

  const wantOdd = pref === 'ptw';

  const parityMatch = wantOdd
    ? { $eq: ['$$mod1', 1] }
    : { $eq: ['$$mod1', 0] };

  const pipeline = [
    {
      $set: {
        lastCounter: {
          $let: {
            vars: {
              c: { $ifNull: ['$lastCounter', 0] }
            },
            in: {
              $let: {
                vars: {
                  next1: { $add: ['$$c', 1] },
                  mod1: { $mod: [{ $add: ['$$c', 1] }, 2] }
                },
                in: {
                  $cond: [parityMatch, '$$next1', { $add: ['$$c', 2] }]
                }
              }
            }
          }
        }
      }
    }
  ];

  const doc = await LeadCounter.findOneAndUpdate(
    { name: 'leadSequence' },
    pipeline,
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
