import ManagerTarget from '../models/managertarget.model.js';

const NUMBER_FIELDS = [
  'totalTargetAmount',
  'totalLeadsAssigned',
  'achieved',
  'inProgress',
  'behind',
  'convertedLeads',
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

  const detailsResult = parseConvertedLeadDetails(input.convertedLeadDetails);
  if (detailsResult.error) return { error: detailsResult.error };
  entry.convertedLeadDetails = detailsResult.details;

  return { entry };
}

function parseConvertedLeadDetails(value) {
  if (value == null) return { details: [] };
  if (!Array.isArray(value)) {
    return { error: 'convertedLeadDetails must be an array' };
  }

  const details = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!item || typeof item !== 'object') {
      return { error: `convertedLeadDetails[${index}] must be an object` };
    }
    const name = String(item.name ?? '').trim();
    const mobile = String(item.mobile ?? '').trim();
    const destination = String(item.destination ?? '').trim();
    if (!name || !mobile || !destination) {
      return { error: `convertedLeadDetails[${index}] needs name, mobile and destination` };
    }
    details.push({ name, mobile, destination });
  }

  return { details };
}

function mergeConvertedLeadDetails(previousMonth, entry) {
  const previousCount = Number(previousMonth?.convertedLeads);
  const previousDetails = Array.isArray(previousMonth?.convertedLeadDetails)
    ? previousMonth.convertedLeadDetails.map((item) => ({
      name: item.name,
      mobile: item.mobile,
      destination: item.destination,
    }))
    : [];
  const incoming = entry.convertedLeadDetails;
  const hasPrevious = Number.isFinite(previousCount);
  const added = hasPrevious ? entry.convertedLeads - previousCount : 0;

  if (!hasPrevious) {
    return { details: incoming };
  }

  if (added > 0) {
    if (incoming.length === added) {
      return { details: [...previousDetails, ...incoming] };
    }
    if (incoming.length === previousDetails.length + added) {
      return { details: incoming };
    }
    return {
      error: `convertedLeads increased by ${added}. Send ${added} convertedLeadDetails with name, mobile and destination`,
    };
  }

  if (!incoming.length || incoming.length === previousDetails.length) {
    return { details: incoming.length ? incoming : previousDetails };
  }

  return { details: previousDetails };
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

function yearMonthFromLabel(month) {
  const match = /^([a-z]+)(\d{4})$/.exec(String(month || ''));
  if (!match || MONTH_INDEX[match[1]] == null) return null;
  return `${match[2]}-${String(MONTH_INDEX[match[1]] + 1).padStart(2, '0')}`;
}

function normalizeDate(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return raw;
}

function sortDays(days) {
  return [...days].sort((left, right) => String(right.date).localeCompare(String(left.date)));
}

function shapeDay(day) {
  return {
    date: day.date,
    reason: day.reason || '',
  };
}

function parseDayDifference(input) {
  if (!input || typeof input !== 'object') {
    return { error: 'Day difference must be an object' };
  }

  const date = normalizeDate(input.date);
  if (!date) {
    return { error: 'date must be YYYY-MM-DD' };
  }

  const reason = String(input.reason ?? '').trim();
  if (!reason) {
    return { error: 'reason is required' };
  }
  if (reason.length > 1000) {
    return { error: 'reason must be 1000 characters or less' };
  }

  return { entry: { date, reason } };
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

    const existing = await ManagerTarget.findOne({ companyName }).select({ months: 1 }).lean();
    const existingByMonth = new Map((existing?.months || []).map((item) => [item.month, item]));

    const byMonth = new Map();
    for (const entry of parsed) {
      const merged = mergeConvertedLeadDetails(existingByMonth.get(entry.month), entry);
      if (merged.error) {
        return res.status(400).json({ message: merged.error });
      }
      entry.convertedLeadDetails = merged.details;
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
      .select({ companyName: 1, months: 1, dayDifferences: 1 })
      .lean()
      .maxTimeMS(8000);

    const months = sortMonths(doc?.months || []).map((item) => ({
      ...item,
      convertedLeads: item.convertedLeads ?? 0,
      convertedLeadDetails: item.convertedLeadDetails || [],
    }));
    const dayDifferences = sortDays(doc?.dayDifferences || []).map(shapeDay);

    if (monthQuery) {
      const month = months.find((item) => item.month === monthQuery);
      if (!month) {
        return res.status(404).json({ message: 'No data for this company and month' });
      }
      const yearMonth = yearMonthFromLabel(monthQuery);
      return res.status(200).json({
        companyName,
        ...month,
        dayDifferences: yearMonth
          ? dayDifferences.filter((item) => item.date.startsWith(yearMonth))
          : [],
      });
    }

    return res.status(200).json({
      companyName,
      months,
      dayDifferences,
    });
  } catch (error) {
    next(error);
  }
};

export const saveDayDifference = async (req, res, next) => {
  try {
    const companyName = normalizeCompany(req.body?.companyName);
    if (!companyName) {
      return res.status(400).json({ message: 'companyName must be ptw or demand setu' });
    }

    const parsed = parseDayDifference(req.body);
    if (parsed.error) {
      return res.status(400).json({ message: parsed.error });
    }

    const saved = await ManagerTarget.findOneAndUpdate(
      { companyName },
      [
        {
          $set: {
            companyName,
            dayDifferences: {
              $concatArrays: [
                {
                  $filter: {
                    input: { $ifNull: ['$dayDifferences', []] },
                    as: 'item',
                    cond: { $ne: ['$$item.date', parsed.entry.date] },
                  },
                },
                [parsed.entry],
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

    const day = (saved.dayDifferences || []).find((item) => item.date === parsed.entry.date);

    return res.status(200).json({
      companyName: saved.companyName,
      ...shapeDay(day || parsed.entry),
    });
  } catch (error) {
    next(error);
  }
};

export const getDayDifference = async (req, res, next) => {
  try {
    const companyName = normalizeCompany(req.params.companyName);
    if (!companyName) {
      return res.status(400).json({ message: 'companyName must be ptw or demand setu' });
    }

    const dateQuery = req.query.date != null && String(req.query.date).trim() !== ''
      ? normalizeDate(req.query.date)
      : null;
    if (req.query.date != null && String(req.query.date).trim() !== '' && !dateQuery) {
      return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
    }

    const monthQuery = req.query.month != null && String(req.query.month).trim() !== ''
      ? String(req.query.month).trim()
      : null;
    if (monthQuery && !/^\d{4}-\d{2}$/.test(monthQuery)) {
      return res.status(400).json({ message: 'month must be YYYY-MM' });
    }

    const doc = await ManagerTarget.findOne({ companyName })
      .select({ companyName: 1, dayDifferences: 1 })
      .lean()
      .maxTimeMS(8000);

    let days = sortDays(doc?.dayDifferences || []).map(shapeDay);
    if (dateQuery) days = days.filter((item) => item.date === dateQuery);
    else if (monthQuery) days = days.filter((item) => item.date.startsWith(monthQuery));

    if (dateQuery) {
      const day = days[0];
      if (!day) {
        return res.status(404).json({ message: 'No difference saved for this date' });
      }
      return res.status(200).json({
        companyName,
        ...day,
      });
    }

    return res.status(200).json({
      companyName,
      dayDifferences: days,
    });
  } catch (error) {
    next(error);
  }
};
