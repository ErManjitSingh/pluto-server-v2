import mongoose from 'mongoose';
import TargetManagement from '../models/targetmanagement.model.js';

const REASON_QUESTION = 'Why your target not achieved?';

const MONTH_INDEX = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

const toTargetsArray = (payload) => {
  if (Array.isArray(payload.targets)) return payload.targets;

  if (
    payload.targetData !== undefined ||
    payload.numberOfLeads !== undefined ||
    payload.companyName !== undefined ||
    payload.userId !== undefined ||
    payload.teamLeaderId !== undefined ||
    payload.managerId !== undefined
  ) {
    return [
      {
        targetData: payload.targetData,
        numberOfLeads: payload.numberOfLeads,
        companyName: payload.companyName ?? null,
        userId: payload.userId,
        teamLeaderId: payload.teamLeaderId ?? null,
        managerId: payload.managerId ?? null,
        ...(Array.isArray(payload.targetAchieve) ? { targetAchieve: payload.targetAchieve } : {}),
      },
    ];
  }

  return [];
};

const runListQuery = async (filters) => {
  return TargetManagement.find(filters).sort({ createdAt: -1 }).lean().maxTimeMS(15000);
};

export const createTargetManagement = async (req, res, next) => {
  try {
    const month = req.body.month ? String(req.body.month).toLowerCase() : null;
    const targets = toTargetsArray(req.body);

    if (!month) {
      return res.status(400).json({ message: 'month is required' });
    }
    if (!targets.length) {
      return res.status(400).json({ message: 'targets array (or target fields) is required' });
    }

    // Atomic upsert to avoid read-modify-write overhead and race conditions
    const updatedDoc = await TargetManagement.findOneAndUpdate(
      { month },
      {
        $setOnInsert: { month },
        $push: { targets: { $each: targets } },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    const statusCode = updatedDoc.createdAt && updatedDoc.updatedAt && updatedDoc.createdAt.getTime() === updatedDoc.updatedAt.getTime() ? 201 : 200;
    return res.status(statusCode).json(updatedDoc);
  } catch (error) {
    next(error);
  }
};

export const getTargetManagements = async (req, res, next) => {
  try {
    const filters = {};

    if (req.query.month) filters.month = String(req.query.month).toLowerCase();
    if (req.query.userId) filters['targets.userId'] = req.query.userId;
    if (req.query.teamLeaderId) filters['targets.teamLeaderId'] = req.query.teamLeaderId;
    if (req.query.managerId) filters['targets.managerId'] = req.query.managerId;
    if (req.query.companyName) filters['targets.companyName'] = req.query.companyName;

    const targets = await runListQuery(filters);
    return res.status(200).json(targets);
  } catch (error) {
    next(error);
  }
};

export const getTargetManagement = async (req, res, next) => {
  try {
    const target = await TargetManagement.findById(req.params.id).lean().maxTimeMS(15000);

    if (!target) {
      return res.status(404).json({ message: 'Target management not found' });
    }

    return res.status(200).json(target);
  } catch (error) {
    next(error);
  }
};

export const getTargetManagementsByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const userIdStr = String(userId);

    const docs = await TargetManagement.aggregate([
      { $match: { 'targets.userId': userId } },
      { $sort: { createdAt: -1 } },
      {
        $project: {
          month: 1,
          createdAt: 1,
          updatedAt: 1,
          targets: {
            $filter: {
              input: '$targets',
              as: 't',
              cond: { $eq: [{ $toString: '$$t.userId' }, userIdStr] },
            },
          },
        },
      },
    ]).option({ maxTimeMS: 15000 });

    return res.status(200).json(docs);
  } catch (error) {
    next(error);
  }
};

const filterTargetsInDocs = async (matchField, matchValue) => {
  const valueStr = String(matchValue);
  const queryField = `targets.${matchField}`;

  return TargetManagement.aggregate([
    { $match: { [queryField]: matchValue } },
    { $sort: { createdAt: -1 } },
    {
      $project: {
        month: 1,
        createdAt: 1,
        updatedAt: 1,
        targets: {
          $filter: {
            input: '$targets',
            as: 't',
            cond: { $eq: [{ $toString: `$$t.${matchField}` }, valueStr] },
          },
        },
      },
    },
  ]).option({ maxTimeMS: 15000 });
};

export const getTargetManagementsByTeamLeaderId = async (req, res, next) => {
  try {
    const { teamLeaderId } = req.params;
    const targets = await filterTargetsInDocs('teamLeaderId', teamLeaderId);
    return res.status(200).json(targets);
  } catch (error) {
    next(error);
  }
};

export const getTargetManagementsByManagerId = async (req, res, next) => {
  try {
    const { managerId } = req.params;
    const targets = await filterTargetsInDocs('managerId', managerId);
    return res.status(200).json(targets);
  } catch (error) {
    next(error);
  }
};

export const getTargetManagementsByCompanyName = async (req, res, next) => {
  try {
    const { companyName } = req.params;
    const targets = await filterTargetsInDocs('companyName', companyName);
    return res.status(200).json(targets);
  } catch (error) {
    next(error);
  }
};

export const updateTargetManagement = async (req, res, next) => {
  try {
    const payload = { ...req.body };

    if (payload.month) {
      payload.month = String(payload.month).toLowerCase();
    }

    if (!payload.targets) {
      const derivedTargets = toTargetsArray(payload);
      if (derivedTargets.length) {
        payload.targets = derivedTargets;
      }
    }

    delete payload.targetData;
    delete payload.numberOfLeads;
    delete payload.companyName;
    delete payload.userId;
    delete payload.teamLeaderId;
    delete payload.managerId;

    if (Array.isArray(payload.targets)) {
      const existing = await TargetManagement.findById(req.params.id);
      if (existing) {
        payload.targets = preserveTargetAchieve(existing.targets, payload.targets);
      }
    }

    const updatedTarget = await TargetManagement.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true, runValidators: true }
    );

    if (!updatedTarget) {
      return res.status(404).json({ message: 'Target management not found' });
    }

    return res.status(200).json(updatedTarget);
  } catch (error) {
    next(error);
  }
};

// Update a specific target item inside targets[] by target _id
export const updateSpecificTarget = async (req, res, next) => {
  try {
    const { targetId } = req.params;
    const { targetData, numberOfLeads, companyName, userId, teamLeaderId, managerId } = req.body;
    const setPayload = {};
    if (targetData !== undefined) setPayload['targets.$.targetData'] = targetData;
    if (numberOfLeads !== undefined) setPayload['targets.$.numberOfLeads'] = numberOfLeads;
    if (companyName !== undefined) setPayload['targets.$.companyName'] = companyName;
    if (userId !== undefined) setPayload['targets.$.userId'] = userId;
    if (teamLeaderId !== undefined) setPayload['targets.$.teamLeaderId'] = teamLeaderId;
    if (managerId !== undefined) setPayload['targets.$.managerId'] = managerId;

    if (Object.keys(setPayload).length === 0) {
      return res.status(400).json({ message: 'At least one field is required for update' });
    }

    const updatedDoc = await TargetManagement.findOneAndUpdate(
      { 'targets._id': targetId },
      { $set: setPayload },
      { new: true, runValidators: true }
    );

    if (!updatedDoc) {
      return res.status(404).json({ message: 'Target item not found' });
    }

    return res.status(200).json(updatedDoc);
  } catch (error) {
    next(error);
  }
};

// Delete a specific target item inside targets[] by target _id
export const deleteSpecificTarget = async (req, res, next) => {
  try {
    const { targetId } = req.params;

    const updatedDoc = await TargetManagement.findOneAndUpdate(
      { 'targets._id': targetId },
      { $pull: { targets: { _id: targetId } } },
      { new: true }
    );

    if (!updatedDoc) {
      return res.status(404).json({ message: 'Target item not found' });
    }

    return res.status(200).json({
      message: 'Target item deleted successfully',
      data: updatedDoc,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteTargetManagement = async (req, res, next) => {
  try {
    const deletedTarget = await TargetManagement.findByIdAndDelete(req.params.id);

    if (!deletedTarget) {
      return res.status(404).json({ message: 'Target management not found' });
    }

    return res.status(200).json({ message: 'Target management deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const deleteAllTargetManagement = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.month) {
      const month = String(req.query.month).toLowerCase();
      if (!parseTargetMonth(month)) {
        return res.status(400).json({ message: 'month must be like may2026' });
      }
      filter.month = month;
    }

    const result = await TargetManagement.deleteMany(filter);
    const scope = filter.month ? ` for ${filter.month}` : '';
    return res.status(200).json({
      message: `Successfully deleted ${result.deletedCount} target management record(s)${scope}`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    next(error);
  }
};

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const parseTargetMonth = (month) => {
  const raw = String(month || '').trim().toLowerCase();
  const match = raw.match(/^([a-z]{3,9})(\d{4})$/);
  if (!match || MONTH_INDEX[match[1]] === undefined) return null;
  const year = Number(match[2]);
  const monthIndex = MONTH_INDEX[match[1]];
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return { month: raw, year, monthIndex, daysInMonth };
};

const todayInKolkata = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const isIsoDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [year, month, day] = String(value).split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
};

const monthDate = (parsed, day) => {
  const month = String(parsed.monthIndex + 1).padStart(2, '0');
  const date = String(day).padStart(2, '0');
  return `${parsed.year}-${month}-${date}`;
};

const dateBelongsToMonth = (date, parsed) => {
  if (!isIsoDate(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  return year === parsed.year && month - 1 === parsed.monthIndex && day >= 1 && day <= parsed.daysInMonth;
};

const parseNonNegative = (value, field, { required = false } = {}) => {
  if (value === undefined || value === null || value === '') {
    if (required) return { error: `${field} is required` };
    return { value: undefined };
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return { error: `${field} must be a number >= 0` };
  }
  return { value: round2(number) };
};

const sameId = (left, right) => String(left ?? '') === String(right ?? '');

const preserveTargetAchieve = (existingTargets, incomingTargets) => {
  const used = new Set();
  return incomingTargets.map((incoming) => {
    if (incoming.targetAchieve !== undefined) return incoming;

    let prev = null;
    if (incoming._id) {
      prev = existingTargets.find((item) => sameId(item._id, incoming._id));
    } else {
      const candidates = existingTargets.filter((item) => {
        if (used.has(String(item._id))) return false;
        return (
          sameId(item.userId, incoming.userId) &&
          String(item.companyName || '') === String(incoming.companyName || '') &&
          sameId(item.teamLeaderId, incoming.teamLeaderId) &&
          sameId(item.managerId, incoming.managerId)
        );
      });
      if (candidates.length === 1) prev = candidates[0];
    }

    if (!prev) return incoming;
    used.add(String(prev._id));
    const targetAchieve = (prev.targetAchieve || []).map((row) =>
      typeof row.toObject === 'function' ? row.toObject() : row
    );
    return {
      ...incoming,
      _id: incoming._id || prev._id,
      targetAchieve,
    };
  });
};

const buildTargetAchieveView = (doc, target, today) => {
  const parsed = parseTargetMonth(doc.month);
  if (!parsed) return null;

  const monthlyTarget = Number(target.targetData) || 0;
  const monthlyLeads = Number(target.numberOfLeads) || 0;
  const dailyAmount = round2(parsed.daysInMonth ? monthlyTarget / parsed.daysInMonth : 0);
  const dailyLeads = round2(parsed.daysInMonth ? monthlyLeads / parsed.daysInMonth : 0);
  const logged = new Map((target.targetAchieve || []).map((row) => [row.date, row]));

  let totalAchievedAmount = 0;
  let totalNotAchievedAmount = 0;
  let totalAchievedLeads = 0;
  let totalNotAchievedLeads = 0;
  const days = [];
  const pendingReasons = [];

  for (let day = 1; day <= parsed.daysInMonth; day += 1) {
    const date = monthDate(parsed, day);
    const entry = logged.get(date);
    const entered = Boolean(entry);
    const achievedAmount = entered ? Number(entry.achievedAmount) || 0 : null;
    const notAchievedAmount = entered ? Number(entry.notAchievedAmount) || 0 : null;
    const achievedLeads = entered ? Number(entry.achievedLeads) || 0 : null;
    const notAchievedLeads = entered ? Number(entry.notAchievedLeads) || 0 : null;
    const reason = entered ? String(entry.reason || '').trim() : '';
    const compareAmount = entered ? achievedAmount : 0;
    const compareLeads = entered ? achievedLeads : 0;
    const amountShort = dailyAmount > 0 && round2(compareAmount) < dailyAmount;
    const leadsShort = dailyLeads > 0 && round2(compareLeads) < dailyLeads;
    const evaluated = date < today || entered;
    const isShort = evaluated && (amountShort || leadsShort);
    const needsReason = isShort && !reason;

    let status = 'logged';
    if (!entered && date > today) status = 'upcoming';
    else if (!entered && date === today) status = 'pending';
    else if (!entered) status = 'missing';

    if (entered) {
      totalAchievedAmount += achievedAmount;
      totalNotAchievedAmount += notAchievedAmount;
      totalAchievedLeads += achievedLeads;
      totalNotAchievedLeads += notAchievedLeads;
    }

    const row = {
      date,
      status,
      entered,
      achieveId: entered ? entry._id : null,
      dailyTargetAmount: dailyAmount,
      dailyTargetLeads: dailyLeads,
      achievedAmount,
      notAchievedAmount,
      achievedLeads,
      notAchievedLeads,
      shortfallAmount: evaluated ? round2(Math.max(0, dailyAmount - round2(compareAmount))) : 0,
      shortfallLeads: evaluated ? round2(Math.max(0, dailyLeads - round2(compareLeads))) : 0,
      isShort,
      needsReason,
      reason,
      question: needsReason ? REASON_QUESTION : null,
    };
    days.push(row);
    if (needsReason) {
      pendingReasons.push({
        date,
        question: REASON_QUESTION,
        achievedAmount,
        notAchievedAmount,
        shortfallAmount: row.shortfallAmount,
        shortfallLeads: row.shortfallLeads,
      });
    }
  }

  const daysSoFar = days.filter((day) => day.date < today || (day.date === today && day.entered)).length;
  const behindAmount = dailyAmount > 0 && round2(totalAchievedAmount) < round2(dailyAmount * daysSoFar);
  const behindLeads = dailyLeads > 0 && round2(totalAchievedLeads) < round2(dailyLeads * daysSoFar);

  return {
    targetManagementId: doc._id,
    targetId: target._id,
    month: doc.month,
    userId: target.userId,
    teamLeaderId: target.teamLeaderId ?? null,
    managerId: target.managerId ?? null,
    companyName: target.companyName ?? null,
    monthlyTarget: round2(monthlyTarget),
    monthlyLeads: round2(monthlyLeads),
    daysInMonth: parsed.daysInMonth,
    dailyAverageAmount: dailyAmount,
    dailyAverageLeads: dailyLeads,
    totalAchievedAmount: round2(totalAchievedAmount),
    totalNotAchievedAmount: round2(totalNotAchievedAmount),
    totalAchievedLeads: round2(totalAchievedLeads),
    totalNotAchievedLeads: round2(totalNotAchievedLeads),
    expectedAmountTillToday: round2(dailyAmount * daysSoFar),
    expectedLeadsTillToday: round2(dailyLeads * daysSoFar),
    behindSchedule: Boolean(daysSoFar && (behindAmount || behindLeads)),
    pendingReasonCount: pendingReasons.length,
    pendingReasons,
    days,
  };
};

const sortAchieveViews = (views) =>
  views.sort((left, right) => {
    const a = parseTargetMonth(left.month);
    const b = parseTargetMonth(right.month);
    if (!a || !b) return 0;
    if (a.year !== b.year) return b.year - a.year;
    if (a.monthIndex !== b.monthIndex) return b.monthIndex - a.monthIndex;
    return String(left.companyName || '').localeCompare(String(right.companyName || ''));
  });

const collectAchieveViews = async ({ month, targetId, userId, teamLeaderId, managerId, companyName }) => {
  const filters = {};
  if (month) filters.month = String(month).toLowerCase();
  if (targetId) {
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return { error: 'Invalid targetId', status: 400 };
    }
    filters['targets._id'] = targetId;
  }

  const docs = await TargetManagement.find(filters).sort({ createdAt: -1 });
  const today = todayInKolkata();
  const views = [];

  for (const doc of docs) {
    for (const target of doc.targets) {
      if (targetId && !sameId(target._id, targetId)) continue;
      if (userId !== undefined && userId !== null && userId !== '' && !sameId(target.userId, userId)) continue;
      if (
        teamLeaderId !== undefined &&
        teamLeaderId !== null &&
        teamLeaderId !== '' &&
        !sameId(target.teamLeaderId, teamLeaderId)
      ) {
        continue;
      }
      if (managerId !== undefined && managerId !== null && managerId !== '' && !sameId(target.managerId, managerId)) {
        continue;
      }
      if (
        companyName !== undefined &&
        companyName !== null &&
        companyName !== '' &&
        String(target.companyName || '') !== String(companyName)
      ) {
        continue;
      }
      const view = buildTargetAchieveView(doc, target, today);
      if (view) views.push(view);
    }
  }

  return { views: sortAchieveViews(views) };
};

const resolveSingleTarget = async ({ month, targetId, userId, companyName }) => {
  if (!targetId && (!month || userId === undefined || userId === null || userId === '')) {
    return { error: 'targetId or month + userId is required', status: 400 };
  }
  if (month && !parseTargetMonth(month)) {
    return { error: 'month must be like may2026', status: 400 };
  }

  const { views, error, status } = await collectAchieveViews({ month, targetId, userId, companyName });
  if (error) return { error, status };
  if (!views.length) return { error: 'Target not found', status: 404 };
  if (views.length > 1) {
    return {
      error: 'Multiple targets found. Send targetId.',
      status: 409,
      targets: views.map((view) => ({
        targetId: view.targetId,
        targetManagementId: view.targetManagementId,
        month: view.month,
        userId: view.userId,
        companyName: view.companyName,
      })),
    };
  }
  return { view: views[0] };
};

const loadTargetDocument = async (view) => {
  const doc = await TargetManagement.findById(view.targetManagementId);
  if (!doc) return null;
  const target = doc.targets.id(view.targetId);
  if (!target) return null;
  return { doc, target };
};

export const upsertTargetAchieve = async (req, res, next) => {
  try {
    const month = req.body.month ? String(req.body.month).toLowerCase() : undefined;
    const { targetId, userId, companyName } = req.body;
    const resolved = await resolveSingleTarget({ month, targetId, userId, companyName });
    if (resolved.error) {
      return res.status(resolved.status).json({
        message: resolved.error,
        ...(resolved.targets ? { targets: resolved.targets } : {}),
      });
    }

    const parsedMonth = parseTargetMonth(resolved.view.month);
    const today = todayInKolkata();
    const date = req.body.date ? String(req.body.date) : today;
    if (!dateBelongsToMonth(date, parsedMonth)) {
      return res.status(400).json({ message: 'date must be a valid day inside this target month (YYYY-MM-DD)' });
    }
    if (date > today) {
      return res.status(400).json({ message: 'Future date is not allowed' });
    }

    const achievedAmount = parseNonNegative(req.body.achievedAmount, 'achievedAmount', { required: true });
    const achievedLeads = parseNonNegative(req.body.achievedLeads, 'achievedLeads');
    const notAchievedAmount = parseNonNegative(req.body.notAchievedAmount, 'notAchievedAmount');
    const notAchievedLeads = parseNonNegative(req.body.notAchievedLeads, 'notAchievedLeads');
    const invalid = [achievedAmount, achievedLeads, notAchievedAmount, notAchievedLeads].find((item) => item.error);
    if (invalid) return res.status(400).json({ message: invalid.error });

    let reason = req.body.reason === undefined || req.body.reason === null ? undefined : String(req.body.reason).trim();
    if (reason !== undefined && reason.length > 1000) {
      return res.status(400).json({ message: 'reason must be 1000 characters or less' });
    }

    const loaded = await loadTargetDocument(resolved.view);
    if (!loaded) return res.status(404).json({ message: 'Target not found' });

    const { doc, target } = loaded;
    if (!target.targetAchieve) target.targetAchieve = [];
    const existing = target.targetAchieve.find((row) => row.date === date);
    if (reason === undefined) reason = String(existing?.reason || '').trim();

    const dailyAmount = round2(parsedMonth.daysInMonth ? Number(target.targetData || 0) / parsedMonth.daysInMonth : 0);
    const dailyLeads = round2(parsedMonth.daysInMonth ? Number(target.numberOfLeads || 0) / parsedMonth.daysInMonth : 0);
    const leadsValue = achievedLeads.value === undefined ? Number(existing?.achievedLeads || 0) : achievedLeads.value;
    const missedAmount =
      notAchievedAmount.value === undefined
        ? round2(Math.max(0, dailyAmount - achievedAmount.value))
        : notAchievedAmount.value;
    const missedLeads =
      notAchievedLeads.value === undefined ? round2(Math.max(0, dailyLeads - leadsValue)) : notAchievedLeads.value;

    if (existing) {
      existing.achievedAmount = achievedAmount.value;
      existing.notAchievedAmount = missedAmount;
      existing.achievedLeads = leadsValue;
      existing.notAchievedLeads = missedLeads;
      existing.reason = reason;
    } else {
      target.targetAchieve.push({
        date,
        achievedAmount: achievedAmount.value,
        notAchievedAmount: missedAmount,
        achievedLeads: leadsValue,
        notAchievedLeads: missedLeads,
        reason,
      });
    }

    await doc.save();
    const data = buildTargetAchieveView(doc, target, today);
    const day = data.days.find((item) => item.date === date);
    return res.status(200).json({
      message: day?.needsReason
        ? 'Daily achievement saved. Why your target not achieved?'
        : 'Daily achievement saved',
      needsReason: Boolean(day?.needsReason),
      question: day?.question ?? null,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const updateTargetAchieveReason = async (req, res, next) => {
  try {
    const month = req.body.month ? String(req.body.month).toLowerCase() : undefined;
    const { targetId, userId, companyName, date } = req.body;
    if (!date) return res.status(400).json({ message: 'date is required' });

    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ message: 'reason is required' });
    if (reason.length > 1000) {
      return res.status(400).json({ message: 'reason must be 1000 characters or less' });
    }

    const resolved = await resolveSingleTarget({ month, targetId, userId, companyName });
    if (resolved.error) {
      return res.status(resolved.status).json({
        message: resolved.error,
        ...(resolved.targets ? { targets: resolved.targets } : {}),
      });
    }

    const parsedMonth = parseTargetMonth(resolved.view.month);
    if (!dateBelongsToMonth(String(date), parsedMonth)) {
      return res.status(400).json({ message: 'date must be a valid day inside this target month (YYYY-MM-DD)' });
    }

    const loaded = await loadTargetDocument(resolved.view);
    if (!loaded) return res.status(404).json({ message: 'Target not found' });

    const entry = (loaded.target.targetAchieve || []).find((row) => row.date === String(date));
    if (!entry) {
      return res.status(404).json({ message: 'Daily achievement not found for this date. Save the achieved amount first.' });
    }

    entry.reason = reason;
    await loaded.doc.save();
    const data = buildTargetAchieveView(loaded.doc, loaded.target, todayInKolkata());
    const day = data.days.find((item) => item.date === String(date));
    return res.status(200).json({
      message: 'Reason saved',
      needsReason: Boolean(day?.needsReason),
      question: day?.question ?? null,
      data,
    });
  } catch (error) {
    next(error);
  }
};

const respondWithAchieveViews = (res, views, extra = {}) => {
  if (!views.length) return res.status(404).json({ message: 'Target not found' });
  return res.status(200).json({ count: views.length, ...extra, data: views });
};

export const getTargetAchieveStatus = async (req, res, next) => {
  try {
    const month = req.query.month ? String(req.query.month).toLowerCase() : undefined;
    if (month && !parseTargetMonth(month)) {
      return res.status(400).json({ message: 'month must be like may2026' });
    }
    const { targetId, userId, teamLeaderId, managerId, companyName } = req.query;
    if (!targetId && !userId && !teamLeaderId && !managerId && !companyName) {
      return res.status(400).json({ message: 'targetId, userId, teamLeaderId, managerId, or companyName is required' });
    }

    const { views, error, status } = await collectAchieveViews({
      month,
      targetId,
      userId,
      teamLeaderId,
      managerId,
      companyName,
    });
    if (error) return res.status(status).json({ message: error });
    return respondWithAchieveViews(res, views);
  } catch (error) {
    next(error);
  }
};

export const getTargetAchieveByUserId = async (req, res, next) => {
  try {
    const month = req.query.month ? String(req.query.month).toLowerCase() : undefined;
    if (month && !parseTargetMonth(month)) {
      return res.status(400).json({ message: 'month must be like may2026' });
    }
    const { views, error, status } = await collectAchieveViews({ month, userId: req.params.userId });
    if (error) return res.status(status).json({ message: error });
    return respondWithAchieveViews(res, views, { userId: req.params.userId });
  } catch (error) {
    next(error);
  }
};

export const getTargetAchieveByTeamLeaderId = async (req, res, next) => {
  try {
    const month = req.query.month ? String(req.query.month).toLowerCase() : undefined;
    if (month && !parseTargetMonth(month)) {
      return res.status(400).json({ message: 'month must be like may2026' });
    }
    const { views, error, status } = await collectAchieveViews({
      month,
      teamLeaderId: req.params.teamLeaderId,
    });
    if (error) return res.status(status).json({ message: error });
    return respondWithAchieveViews(res, views, { teamLeaderId: req.params.teamLeaderId });
  } catch (error) {
    next(error);
  }
};

export const getTargetAchieveByManagerId = async (req, res, next) => {
  try {
    const month = req.query.month ? String(req.query.month).toLowerCase() : undefined;
    if (month && !parseTargetMonth(month)) {
      return res.status(400).json({ message: 'month must be like may2026' });
    }
    const { views, error, status } = await collectAchieveViews({
      month,
      managerId: req.params.managerId,
    });
    if (error) return res.status(status).json({ message: error });
    return respondWithAchieveViews(res, views, { managerId: req.params.managerId });
  } catch (error) {
    next(error);
  }
};

export const deleteTargetAchieveDay = async (req, res, next) => {
  try {
    const { targetId, date } = req.params;
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ message: 'Invalid targetId' });
    }
    if (!isIsoDate(date)) {
      return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
    }

    const doc = await TargetManagement.findOne({ 'targets._id': targetId });
    if (!doc) return res.status(404).json({ message: 'Target not found' });
    const target = doc.targets.id(targetId);
    if (!target) return res.status(404).json({ message: 'Target not found' });

    if (!target.targetAchieve) target.targetAchieve = [];
    const before = target.targetAchieve.length;
    target.targetAchieve.pull({ date });
    if (target.targetAchieve.length === before) {
      return res.status(404).json({ message: 'Daily achievement not found for this date' });
    }

    await doc.save();
    return res.status(200).json({
      message: 'Daily achievement deleted',
      data: buildTargetAchieveView(doc, target, todayInKolkata()),
    });
  } catch (error) {
    next(error);
  }
};
