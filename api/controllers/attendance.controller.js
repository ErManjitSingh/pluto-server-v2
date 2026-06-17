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
 * Body: { userId, date?, status?, note? }
 */
export const markAttendance = async (req, res, next) => {
  try {
    const { userId, status = 'present', note } = req.body;
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

/** PUT /update/:id — Update status or note for an existing record. */
export const updateAttendance = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;

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
