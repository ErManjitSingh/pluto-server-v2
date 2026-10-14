import ManagerTarget from '../models/managertarget.model.js';

const NUMBER_FIELDS = [
  'totalTargetAmount',
  'totalLeadsAssigned',
  'achieved',
  'inProgress',
  'behind',
];

const MONTH_INDEX = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

function normalizeCompany(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

  if (raw === 'ptw') return 'ptw';
  if (raw === 'demand setu' || raw === 'demandsetu') return 'demand setu';
  return null;
}

function normalizeMonth(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  const match = /^([a-z]{3,9})(\d{4})$/.exec(raw);
  if (!match || MONTH_INDEX[match[1]] == null) return null;
  return `${match[1]}${match[2]}`;
}

function monthSortValue(month) {
  const match = /^([a-z]+)(\d{4})$/.exec(month);
  if (!match) return 0;
  return Number(match[2]) * 12 + (MONTH_INDEX[match[1]] ?? 0);
}

function parseMonthEntry(input) {
  if (!input || typeof input !== 'object') {
    return { error: 'Each month entry must be an object' };
  }

  const month = normalizeMonth(input.month);
  if (!month) {
    return { error: 'month must be like oct2026' };
  }

  const entry = { month };
  for (const field of NUMBER_FIELDS) {
    const value = Number(input[field]);
    if (!Number.isFinite(value) || value < 0) {
      return { error: `${field} must be a number greater than or equal to 0` };
    }
    entry[field] = value;
  }

  return { entry };
}

function collectEntries(body) {
  if (Array.isArray(body?.months) && body.months.length) {
    return body.months;
  }
  return [body];
}

function sortMonths(months) {
  return [...months].sort((left, right) => monthSortValue(right.month) - monthSortValue(left.month));
}

export const saveManagerTarget = async (req, res, next) => {
  try {
    const companyName = normalizeCompany(req.body?.companyName);
    if (!companyName) {
      return res.status(400).json({ message: 'companyName must be ptw or demand setu' });
    }

    const parsed = [];
    for (const item of collectEntries(req.body)) {
      const result = parseMonthEntry(item);
      if (result.error) {
        return res.status(400).json({ message: result.error });
      }
      parsed.push(result.entry);
    }

    const byMonth = new Map();
    for (const entry of parsed) {
      byMonth.set(entry.month, entry);
    }
    const entries = [...byMonth.values()];
    const monthsToReplace = entries.map((entry) => entry.month);

    const saved = await ManagerTarget.findOneAndUpdate(
      { companyName },
      [
        {
          $set: {
            companyName,
            months: {
              $concatArrays: [
                {
                  $filter: {
                    input: { $ifNull: ['$months', []] },
                    as: 'item',
                    cond: { $not: [{ $in: ['$$item.month', monthsToReplace] }] },
                  },
                },
                entries,
              ],
            },
          },
        },
      ],
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    ).lean();

    return res.status(200).json({
      companyName: saved.companyName,
      months: sortMonths(saved.months || []),
    });
  } catch (error) {
    next(error);
  }
};

export const getManagerTargetByCompany = async (req, res, next) => {
  try {
    const companyName = normalizeCompany(req.params.companyName);
    if (!companyName) {
      return res.status(400).json({ message: 'companyName must be ptw or demand setu' });
    }

    const monthQuery = req.query.month != null && String(req.query.month).trim() !== ''
      ? normalizeMonth(req.query.month)
      : null;

    if (req.query.month != null && String(req.query.month).trim() !== '' && !monthQuery) {
      return res.status(400).json({ message: 'month must be like oct2026' });
    }

    const doc = await ManagerTarget.findOne({ companyName })
      .select({ companyName: 1, months: 1 })
      .lean()
      .maxTimeMS(8000);

    const months = sortMonths(doc?.months || []);

    if (monthQuery) {
      const month = months.find((item) => item.month === monthQuery);
      if (!month) {
        return res.status(404).json({ message: 'No data for this company and month' });
      }
      return res.status(200).json({
        companyName,
        ...month,
      });
    }

    return res.status(200).json({
      companyName,
      months,
    });
  } catch (error) {
    next(error);
  }
};
