import mongoose from 'mongoose';
import Attendance from '../models/attendance.model.js';
import Maker from '../models/maker.model.js';

const ATTENDANCE_TZ = 'Asia/Kolkata';

function isValidObjectId(id) {
  if (!id || typeof id !== 'string') return false;
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
}

/** Local calendar date in YYYY-MM-DD (default: India). */
export function toDateString(date = new Date(), timeZone = ATTENDANCE_TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);
}

export function toMonthString(dateStr) {
  return String(dateStr).slice(0, 7);
}

function clampCount(value) {
  const count = Math.floor(Number(value));
  if (!Number.isFinite(count) || count < 0) return 0;
  return Math.min(count, 999);
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseCurrentLocation(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  const latitude = value.latitude != null && value.latitude !== '' ? Number(value.latitude) : null;
  const longitude = value.longitude != null && value.longitude !== '' ? Number(value.longitude) : null;
  const accuracy = value.accuracy != null && value.accuracy !== '' ? Number(value.accuracy) : null;
  const address = value.address != null ? String(value.address).trim() : null;
  if (
    (latitude != null && Number.isNaN(latitude)) ||
    (longitude != null && Number.isNaN(longitude)) ||
    (accuracy != null && Number.isNaN(accuracy))
  ) {
    return undefined;
  }
  if (latitude == null && longitude == null && accuracy == null && !address) return null;
  return { latitude, longitude, accuracy, address: address || null };
}

async function loadMakerSnapshot(userId) {
  const maker = await Maker.findById(userId)
    .select('firstName lastName email designation teamLeaderId teamLeaderName managerId managerName')
    .lean();
  if (!maker) return null;
  const userName = [maker.firstName, maker.lastName].filter(Boolean).join(' ').trim() || null;
  return {
    userName,
    email: maker.email || null,
    designation: maker.designation || null,
    teamLeaderId: maker.teamLeaderId || null,
    teamLeaderName: maker.teamLeaderName || null,
    managerId: maker.managerId || null,
    managerName: maker.managerName || null,
  };
}

/**
 * POST /mark — Mark attendance for today (or a given date).
 * Body: { userId, date?, status?, note?, image?, currentLocation? }
 */
export const markAttendance = async (req, res, next) => {
  try {
    const { userId, status = 'present', note, image, currentLocation } = req.body;
    const date = req.body.date ? String(req.body.date).trim() : toDateString();

    if (!userId || !isValidObjectId(String(userId))) {
      return res.status(400).json({ success: false, message: 'Valid userId is required' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'date must be YYYY-MM-DD' });
    }
    if (!['present', 'absent', 'half-day', 'late'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const parsedLocation = parseCurrentLocation(currentLocation);
    if (currentLocation !== undefined && parsedLocation === undefined) {
      return res.status(400).json({
        success: false,
        message: 'currentLocation latitude, longitude, and accuracy must be numbers',
      });
    }

    const existing = await Attendance.findOne({ userId, date }).lean();
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Attendance already marked for this date',
        data: existing,
        alreadyMarked: true,
      });
    }

    const snapshot = await loadMakerSnapshot(userId);
    if (!snapshot) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const doc = await Attendance.create({
      userId,
      date,
      month: toMonthString(date),
      status,
      markedAt: new Date(),
      note: note != null ? String(note).trim() : null,
      image: image != null ? String(image).trim() : null,
      currentLocation: parsedLocation,
      ...snapshot,
    });

    return res.status(201).json({
      success: true,
      message: 'Attendance marked successfully',
      data: doc,
      alreadyMarked: false,
    });
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await Attendance.findOne({
        userId: req.body.userId,
        date: req.body.date ? String(req.body.date).trim() : toDateString(),
      }).lean();
      return res.status(409).json({
        success: false,
        message: 'Attendance already marked for this date',
        data: existing,
        alreadyMarked: true,
      });
    }
    next(error);
  }
};

/**
 * POST /logout — Stamp logout time and logout photo on the day's attendance.
 * Body: { userId, date?, logoutImage, logoutLocation? }
 */
export const logoutAttendance = async (req, res, next) => {
  try {
    const { userId, logoutLocation } = req.body;
    const date = req.body.date ? String(req.body.date).trim() : toDateString();
    const logoutImage = req.body.logoutImage != null ? String(req.body.logoutImage).trim() : '';

    if (!userId || !isValidObjectId(String(userId))) {
      return res.status(400).json({ success: false, message: 'Valid userId is required' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'date must be YYYY-MM-DD' });
    }
    if (!logoutImage) {
      return res.status(400).json({ success: false, message: 'Logout photo is required' });
    }

    const parsedLocation = parseCurrentLocation(logoutLocation);
    if (logoutLocation !== undefined && parsedLocation === undefined) {
      return res.status(400).json({
        success: false,
        message: 'logoutLocation latitude, longitude, and accuracy must be numbers',
      });
    }

    const existing = await Attendance.findOne({ userId, date });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Mark attendance before logout',
        marked: false,
      });
    }

    existing.logoutAt = new Date();
    existing.logoutImage = logoutImage;
    if (parsedLocation) existing.logoutLocation = parsedLocation;
    await existing.save();

    return res.status(200).json({
      success: true,
      message: 'Logout time saved',
      loggedOut: true,
      data: existing,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /follow-up — Save one hourly follow-up on that day's attendance row.
 * Body: { userId, dateKey, slotKey, windowStart, windowEnd, afterOffice, followups, prospects, pipeline, details, submittedAt }
 */
export const saveHourlyFollowUp = async (req, res, next) => {
  try {
    const userId = req.body.userId != null ? String(req.body.userId) : '';
    const date = String(req.body.dateKey || req.body.date || '').trim() || toDateString();
    const slotKey = req.body.slotKey != null ? String(req.body.slotKey).trim() : '';
    const details = req.body.details != null ? String(req.body.details).trim() : '';

    if (!isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Valid userId is required' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'dateKey must be YYYY-MM-DD' });
    }
    if (!slotKey || !slotKey.startsWith(date)) {
      return res.status(400).json({ success: false, message: 'slotKey must belong to this date' });
    }
    if (!details) {
      return res.status(400).json({ success: false, message: 'details is required' });
    }
    if (details.length > 2000) {
      return res.status(400).json({ success: false, message: 'details must be 2000 characters or less' });
    }

    const attendance = await Attendance.findOne({ userId, date });
    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "Mark today's attendance before saving this hour",
        marked: false,
      });
    }

    const entry = {
      slotKey,
      windowStart: parseDate(req.body.windowStart),
      windowEnd: parseDate(req.body.windowEnd),
      afterOffice: Boolean(req.body.afterOffice),
      followups: clampCount(req.body.followups),
      prospects: clampCount(req.body.prospects),
      pipeline: clampCount(req.body.pipeline),
      details,
      submittedAt: parseDate(req.body.submittedAt) || new Date(),
    };

    if (!Array.isArray(attendance.hourlyFollowUps)) attendance.hourlyFollowUps = [];
    const index = attendance.hourlyFollowUps.findIndex((row) => row.slotKey === slotKey);
    if (index >= 0) attendance.hourlyFollowUps.set(index, entry);
    else attendance.hourlyFollowUps.push(entry);
    await attendance.save();

    return res.status(index >= 0 ? 200 : 201).json({
      success: true,
      message: index >= 0 ? 'Hourly follow-up updated' : 'Hourly follow-up saved',
      data: attendance,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /today/:userId — Check whether user marked attendance today (for CRM button state).
 */
export const getTodayAttendance = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }

    const date = req.query.date ? String(req.query.date).trim() : toDateString();
    const record = await Attendance.findOne({ userId, date }).lean();

    return res.status(200).json({
      success: true,
      date,
      marked: Boolean(record),
      loggedOut: Boolean(record?.logoutAt),
      data: record,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /user/:userId — Day-wise or month-wise records for one user.
 * Query: ?month=2026-06 or ?date=2026-06-17
 */
export const getAttendanceByUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }

    const filter = { userId };
    if (req.query.month) filter.month = String(req.query.month).trim();
    if (req.query.date) filter.date = String(req.query.date).trim();

    const records = await Attendance.find(filter).sort({ date: -1 }).lean();

    const summary = {
      total: records.length,
      present: records.filter((r) => r.status === 'present').length,
      absent: records.filter((r) => r.status === 'absent').length,
      halfDay: records.filter((r) => r.status === 'half-day').length,
      late: records.filter((r) => r.status === 'late').length,
    };

    return res.status(200).json({
      success: true,
      userId,
      month: req.query.month || null,
      date: req.query.date || null,
      summary,
      data: records,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /user/:userId/month/:month — Calendar-style month view for one user.
 */
export const getAttendanceByUserMonth = async (req, res, next) => {
  try {
    const { userId, month } = req.params;
    if (!isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, message: 'month must be YYYY-MM' });
    }

    const records = await Attendance.find({ userId, month }).sort({ date: 1 }).lean();
    const byDate = {};
    for (const row of records) {
      byDate[row.date] = row;
    }

    return res.status(200).json({
      success: true,
      userId,
      month,
      totalMarkedDays: records.length,
      byDate,
      data: records,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /month/:month — All users' attendance for a month (admin / HR view).
 */
export const getAttendanceByMonth = async (req, res, next) => {
  try {
    const { month } = req.params;
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, message: 'month must be YYYY-MM' });
    }

    const filter = { month };
    if (req.query.teamLeaderId) filter.teamLeaderId = String(req.query.teamLeaderId);
    if (req.query.managerId) filter.managerId = String(req.query.managerId);
    if (req.query.status) filter.status = String(req.query.status);

    const records = await Attendance.find(filter).sort({ date: -1, userName: 1 }).lean();

    return res.status(200).json({
      success: true,
      month,
      total: records.length,
      data: records,
    });
  } catch (error) {
    next(error);
  }
};

/** GET /team-leader/:teamLeaderId/month/:month */
export const getAttendanceByTeamLeader = async (req, res, next) => {
  try {
    const { teamLeaderId, month } = req.params;
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, message: 'month must be YYYY-MM' });
    }

    const records = await Attendance.find({ teamLeaderId, month })
      .sort({ date: -1, userName: 1 })
      .lean();

    const byUser = {};
    for (const row of records) {
      const key = String(row.userId);
      if (!byUser[key]) {
        byUser[key] = { userId: row.userId, userName: row.userName, days: [] };
      }
      byUser[key].days.push(row);
    }

    return res.status(200).json({
      success: true,
      teamLeaderId,
      month,
      totalRecords: records.length,
      users: Object.values(byUser),
      data: records,
    });
  } catch (error) {
    next(error);
  }
};

/** GET /manager/:managerId/month/:month */
export const getAttendanceByManager = async (req, res, next) => {
  try {
    const { managerId, month } = req.params;
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, message: 'month must be YYYY-MM' });
    }

    const records = await Attendance.find({ managerId, month })
      .sort({ date: -1, userName: 1 })
      .lean();

    const byUser = {};
    for (const row of records) {
      const key = String(row.userId);
      if (!byUser[key]) {
        byUser[key] = { userId: row.userId, userName: row.userName, days: [] };
      }
      byUser[key].days.push(row);
    }

    return res.status(200).json({
      success: true,
      managerId,
      month,
      totalRecords: records.length,
      users: Object.values(byUser),
      data: records,
    });
  } catch (error) {
    next(error);
  }
};

/** PUT /update/:id — Update status, note, image, or currentLocation for an existing record. */
export const updateAttendance = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, note, image, currentLocation } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid attendance id' });
    }

    const setFields = {};
    if (status !== undefined) {
      if (!['present', 'absent', 'half-day', 'late'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      setFields.status = status;
    }
    if (note !== undefined) setFields.note = note != null ? String(note).trim() : null;
    if (image !== undefined) setFields.image = image != null ? String(image).trim() : null;
    if (currentLocation !== undefined) {
      const parsedLocation = parseCurrentLocation(currentLocation);
      if (parsedLocation === undefined) {
        return res.status(400).json({
          success: false,
          message: 'currentLocation latitude, longitude, and accuracy must be numbers',
        });
      }
      setFields.currentLocation = parsedLocation;
    }

    if (Object.keys(setFields).length === 0) {
      return res.status(400).json({ success: false, message: 'Nothing to update' });
    }

    const updated = await Attendance.findByIdAndUpdate(id, { $set: setFields }, { new: true, runValidators: true });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }

    return res.status(200).json({ success: true, message: 'Attendance updated', data: updated });
  } catch (error) {
    next(error);
  }
};

/** DELETE /delete/:id */
export const deleteAttendance = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid attendance id' });
    }

    const deleted = await Attendance.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }

    return res.status(200).json({ success: true, message: 'Attendance deleted' });
  } catch (error) {
    next(error);
  }
};
