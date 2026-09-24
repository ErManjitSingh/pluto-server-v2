import mongoose from 'mongoose';
import PackageTracker from '../models/packagetracker.model.js';
import Lead from '../models/lead.model.js';

const LEAD_STATUS_GROUPS = {
  open: ['New Lead', 'Open', 'Open Lead'],
  active: ['Work in Progress', 'Follow Up', 'Active', 'Active Lead'],
  dead: ['Lost', 'Tour Cancelled', 'Tour Postponed', 'Dead', 'Dead Lead', 'Not Interested']
};

const GROUP_ALIASES = {
  open: 'open',
  'open lead': 'open',
  active: 'active',
  'active lead': 'active',
  dead: 'dead',
  'dead lead': 'dead'
};

let backfillStarted = false;

function leadIdMatchers(leadId) {
  const id = String(leadId);
  const matchIds = [id];
  if (mongoose.Types.ObjectId.isValid(id)) {
    matchIds.push(new mongoose.Types.ObjectId(id));
  }
  return matchIds;
}

export function resolvePackageTrackerLeadStatuses(query) {
  if (query.leadStatus) {
    const statuses = String(query.leadStatus)
      .split(',')
      .map((status) => status.trim())
      .filter(Boolean);
    return statuses.length ? statuses : null;
  }

  if (!query.leadGroup) return null;

  const key = GROUP_ALIASES[String(query.leadGroup).trim().toLowerCase()];
  if (!key) return [];
  return LEAD_STATUS_GROUPS[key];
}

export async function syncPackageTrackerLeadStatus(leadId, leadStatus) {
  if (!leadId || leadStatus == null || leadStatus === '') return;

  try {
    const matchIds = leadIdMatchers(leadId);
    await PackageTracker.updateMany(
      { 'users.user.leaddetails._id': { $in: matchIds } },
      {
        $set: {
          'users.$[u].leadStatus': leadStatus,
          'users.$[u].user.leaddetails.leadStatus': leadStatus
        }
      },
      { arrayFilters: [{ 'u.user.leaddetails._id': { $in: matchIds } }] }
    );
  } catch (error) {
    console.error('Package tracker lead status sync failed:', error.message);
  }
}

async function fillLeadStatusBatch(docs) {
  const leadIds = new Set();
  for (const doc of docs) {
    for (const entry of doc.users || []) {
      const id = entry?.user?.leaddetails?._id;
      if (id) leadIds.add(String(id));
    }
  }

  const objectIds = [...leadIds]
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const leads = objectIds.length
    ? await Lead.find({ _id: { $in: objectIds } }).select('leadStatus').lean()
    : [];

  const docIds = docs.map((doc) => doc._id);
  const ops = [];

  for (const lead of leads) {
    if (!lead.leadStatus) continue;
    const matchIds = leadIdMatchers(lead._id);
    ops.push({
      updateMany: {
        filter: {
          _id: { $in: docIds },
          'users.user.leaddetails._id': { $in: matchIds }
        },
        update: {
          $set: {
            'users.$[u].leadStatus': lead.leadStatus,
            'users.$[u].user.leaddetails.leadStatus': lead.leadStatus
          }
        },
        arrayFilters: [{
          'u.user.leaddetails._id': { $in: matchIds },
          'u.leadStatus': { $exists: false }
        }]
      }
    });
  }

  if (ops.length) {
    await PackageTracker.bulkWrite(ops, { ordered: false });
  }

  await PackageTracker.updateMany(
    { _id: { $in: docIds } },
    [{
      $set: {
        users: {
          $map: {
            input: '$users',
            as: 'u',
            in: {
              $mergeObjects: [
                '$$u',
                {
                  leadStatus: {
                    $ifNull: [
                      '$$u.leadStatus',
                      { $ifNull: ['$$u.user.leaddetails.leadStatus', ''] }
                    ]
                  }
                }
              ]
            }
          }
        }
      }
    }]
  );
}

async function runBackfill() {
  const pendingFilter = { 'users.leadStatus': { $exists: false } };
  const total = await PackageTracker.countDocuments(pendingFilter);
  if (!total) return;

  console.log(`Package tracker lead status backfill started (${total} packages)`);
  const cursor = PackageTracker.find(pendingFilter)
    .select('_id users.user.leaddetails._id')
    .lean()
    .cursor();

  let batch = [];
  let done = 0;

  for await (const doc of cursor) {
    batch.push(doc);
    if (batch.length >= 100) {
      await fillLeadStatusBatch(batch);
      done += batch.length;
      batch = [];
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }

  if (batch.length) {
    await fillLeadStatusBatch(batch);
    done += batch.length;
  }

  console.log(`Package tracker lead status backfill finished (${done} packages)`);
}

export function startPackageTrackerLeadStatusBackfill() {
  if (backfillStarted) return;
  backfillStarted = true;
  setImmediate(() => {
    runBackfill().catch((error) => {
      console.error('Package tracker lead status backfill failed:', error.message);
    });
  });
}
