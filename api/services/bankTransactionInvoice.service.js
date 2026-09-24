import mongoose from 'mongoose';
import BankTransaction from '../models/banktransactions.model.js';

export const INVOICE_NUMBER_START = 1148;
export const INVOICE_CUTOFF = new Date('2026-09-01T08:54:28.397Z');

const COUNTER_ID = 'bankTransactionInvoice';

const leadInvoiceSchema = new mongoose.Schema(
  {
    _id: { type: String },
    invoiceNumber: { type: Number, required: true },
  },
  { collection: 'banktransactionleadinvoices', versionKey: false }
);

const invoiceCounterSchema = new mongoose.Schema(
  {
    _id: { type: String },
    seq: { type: Number, required: true },
  },
  { collection: 'banktransactioninvoicecounters', versionKey: false }
);

const LeadInvoice =
  mongoose.models.BankTransactionLeadInvoice ||
  mongoose.model('BankTransactionLeadInvoice', leadInvoiceSchema);

const InvoiceCounter =
  mongoose.models.BankTransactionInvoiceCounter ||
  mongoose.model('BankTransactionInvoiceCounter', invoiceCounterSchema);

let tail = Promise.resolve();
let backfillStarted = false;

function locked(task) {
  const run = tail.then(task, task);
  tail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function leadKey(leadId) {
  if (leadId == null) return '';
  const value = String(leadId);
  return value.trim() ? value : '';
}

export function isInvoiceEligible(createdAt) {
  if (!createdAt) return false;
  return new Date(createdAt).getTime() > INVOICE_CUTOFF.getTime();
}

async function allocateNextInvoiceNumber() {
  const doc = await InvoiceCounter.findOneAndUpdate(
    { _id: COUNTER_ID },
    [
      {
        $set: {
          seq: {
            $add: [{ $ifNull: ['$seq', INVOICE_NUMBER_START - 1] }, 1],
          },
        },
      },
    ],
    { new: true, upsert: true }
  );
  return doc.seq;
}

async function syncCounter(highest) {
  await InvoiceCounter.findOneAndUpdate(
    { _id: COUNTER_ID },
    [
      {
        $set: {
          seq: {
            $max: [{ $ifNull: ['$seq', INVOICE_NUMBER_START - 1] }, highest],
          },
        },
      },
    ],
    { upsert: true }
  );
}

async function insertLeadInvoices(docs) {
  if (!docs.length) return;
  try {
    await LeadInvoice.insertMany(docs, { ordered: false });
  } catch (error) {
    const writeErrors = error.writeErrors || [];
    const onlyDupes =
      writeErrors.length > 0 && writeErrors.every((entry) => entry.code === 11000);
    if (error.code !== 11000 && !onlyDupes) throw error;
  }
}

async function resolveInvoiceNumberLocked(leadId) {
  const key = leadKey(leadId);
  if (!key) return undefined;

  const existing = await LeadInvoice.findById(key).lean();
  if (typeof existing?.invoiceNumber === 'number') return existing.invoiceNumber;

  const invoiceNumber = await allocateNextInvoiceNumber();
  try {
    await LeadInvoice.create({ _id: key, invoiceNumber });
    return invoiceNumber;
  } catch (error) {
    if (error.code === 11000) {
      const winner = await LeadInvoice.findById(key).lean();
      if (typeof winner?.invoiceNumber === 'number') return winner.invoiceNumber;
    }
    throw error;
  }
}

export function resolveInvoiceNumber(leadId) {
  return locked(() => resolveInvoiceNumberLocked(leadId));
}

async function backfillInvoiceNumbers() {
  const groups = await BankTransaction.aggregate([
    {
      $match: {
        createdAt: { $gt: INVOICE_CUTOFF },
        leadId: { $type: 'string', $ne: '' },
      },
    },
    {
      $group: {
        _id: '$leadId',
        firstCreatedAt: { $min: '$createdAt' },
        invoices: { $addToSet: '$invoiceNumber' },
      },
    },
    { $sort: { firstCreatedAt: 1, _id: 1 } },
  ]).allowDiskUse(true);

  const keys = groups.map((group) => leadKey(group._id)).filter(Boolean);
  const stored = keys.length
    ? await LeadInvoice.find({ _id: { $in: keys } }).lean()
    : [];
  const storedByLead = new Map(stored.map((doc) => [doc._id, doc.invoiceNumber]));

  const used = new Set();
  const assigned = new Map();
  const inserts = [];

  for (const group of groups) {
    const key = leadKey(group._id);
    if (!key) continue;
    const numbers = (group.invoices || []).filter((value) => typeof value === 'number');
    for (const number of numbers) used.add(number);

    if (typeof storedByLead.get(key) === 'number') {
      const invoiceNumber = storedByLead.get(key);
      assigned.set(key, invoiceNumber);
      used.add(invoiceNumber);
      continue;
    }

    if (!numbers.length) continue;
    const invoiceNumber = Math.min(...numbers);
    assigned.set(key, invoiceNumber);
    inserts.push({ _id: key, invoiceNumber });
  }

  let highest = INVOICE_NUMBER_START - 1;
  for (const number of used) {
    if (number > highest) highest = number;
  }
  const counter = await InvoiceCounter.findById(COUNTER_ID).lean();
  if (typeof counter?.seq === 'number' && counter.seq > highest) {
    highest = counter.seq;
  }

  let next = highest + 1;
  for (const group of groups) {
    const key = leadKey(group._id);
    if (!key || assigned.has(key)) continue;
    assigned.set(key, next);
    used.add(next);
    inserts.push({ _id: key, invoiceNumber: next });
    if (next > highest) highest = next;
    next += 1;
  }

  await insertLeadInvoices(inserts);
  await syncCounter(highest);

  const ops = [];
  for (const [key, invoiceNumber] of assigned) {
    ops.push({
      updateMany: {
        filter: {
          leadId: key,
          createdAt: { $gt: INVOICE_CUTOFF },
          invoiceNumber: { $ne: invoiceNumber },
        },
        update: { $set: { invoiceNumber } },
      },
    });
  }

  let updatedLeads = 0;
  for (let i = 0; i < ops.length; i += 200) {
    const chunk = ops.slice(i, i + 200);
    const result = await BankTransaction.bulkWrite(chunk, {
      ordered: false,
      timestamps: false,
    });
    updatedLeads += result.modifiedCount || 0;
  }

  console.log(
    `Bank transaction invoice backfill finished (${assigned.size} leads, ${updatedLeads} transactions updated)`
  );
}

export function startBankTransactionInvoiceBackfill() {
  if (backfillStarted) return;
  backfillStarted = true;
  locked(() => backfillInvoiceNumbers()).catch((error) => {
    console.error('Bank transaction invoice backfill failed:', error.message);
  });
}
