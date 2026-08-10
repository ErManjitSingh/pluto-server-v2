import mongoose from 'mongoose';
import TaskNotification from '../models/taskNotification.model.js';
import Maker from '../models/maker.model.js';
import { getIO } from '../socket/socket.js';
import { errorHandler } from '../utils/error.js';

const ALLOWED_CREATOR_TYPES = new Set([
  'admin',
  'Admin',
  'manager',
  'Manager',
  'TL',
  'TeamLeader',
  'teamleader'
]);

const emitToUsers = (userIds, event, payload) => {
  const io = getIO();
  if (!io || !userIds?.length) return;
  for (const id of userIds) {
    if (!id) continue;
    io.to(`user:${String(id)}`).emit(event, payload);
  }
};

const normalizeCompanyKey = (value) => {
  if (value == null) return null;
  const key = String(value).trim().toLowerCase();
  if (!key) return null;
  if (key === 'ptw' || key.includes('ptw')) return 'ptw';
  if (
    key === 'demandsetu' ||
    key === 'demand' ||
    key === 'demand setu' ||
    key.includes('demand')
  ) {
    return 'demandsetu';
  }
  return null;
};

const companyNameQuery = (companyKey) => {
  if (companyKey === 'ptw') {
    return { companyName: { $regex: /ptw/i } };
  }
  if (companyKey === 'demandsetu') {
    return { companyName: { $regex: /demand/i } };
  }
  return null;
};

const mapRecipients = (makers) =>
  (makers || []).map((m) => ({
    userId: m._id,
    firstName: m.firstName || '',
    lastName: m.lastName || '',
    companyName: m.companyName || '',
    userType: m.userType || '',
    seen: false,
    seenAt: null
  }));

const uniqueById = (makers) => {
  const map = new Map();
  for (const m of makers || []) {
    if (m?._id) map.set(String(m._id), m);
  }
  return [...map.values()];
};

async function resolveRecipients({ targetType, company, userIds }) {
  const select = 'firstName lastName companyName userType active';

  if (targetType === 'all') {
    const makers = await Maker.find({ active: { $ne: false } }).select(select).lean();
    return { recipients: mapRecipients(makers), companyKey: null };
  }

  if (targetType === 'company') {
    const companyKey = normalizeCompanyKey(company);
    if (!companyKey) {
      throw errorHandler(400, 'company must be ptw or demandsetu when targetType is company');
    }
    const q = companyNameQuery(companyKey);
    const makers = await Maker.find({ ...q, active: { $ne: false } }).select(select).lean();
    return { recipients: mapRecipients(makers), companyKey };
  }

  if (targetType === 'users') {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw errorHandler(400, 'userIds array is required when targetType is users');
    }
    const validIds = userIds
      .map((id) => String(id))
      .filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (!validIds.length) {
      throw errorHandler(400, 'No valid userIds provided');
    }
    const makers = await Maker.find({
      _id: { $in: validIds },
      active: { $ne: false }
    })
      .select(select)
      .lean();
    return { recipients: mapRecipients(uniqueById(makers)), companyKey: null };
  }

  throw errorHandler(400, 'targetType must be all, company, or users');
}

/**
 * POST create task notification
 * Body:
 *  - title (required)
 *  - message (optional)
 *  - targetType: 'all' | 'company' | 'users'
 *  - company: 'ptw' | 'demandsetu' (when targetType = company)
 *  - userIds: string[] (when targetType = users)
 *  - createdBy: maker id (required if not authenticated)
 */
export const createTaskNotification = async (req, res, next) => {
  try {
    const { title, message, targetType, company, userIds } = req.body;
    const createdBy = req.body.createdBy || req.user?.id;

    if (!title || !String(title).trim()) {
      return next(errorHandler(400, 'title is required'));
    }
    if (!targetType) {
      return next(errorHandler(400, 'targetType is required (all | company | users)'));
    }
    if (!createdBy || !mongoose.Types.ObjectId.isValid(createdBy)) {
      return next(errorHandler(400, 'createdBy (valid maker id) is required'));
    }

    const creator = await Maker.findById(createdBy).select(
      'firstName lastName userType companyName'
    );
    if (!creator) {
      return next(errorHandler(404, 'Creator not found'));
    }
    if (!ALLOWED_CREATOR_TYPES.has(creator.userType)) {
      return next(errorHandler(403, 'Only admin or manager can create task notifications'));
    }

    const { recipients, companyKey } = await resolveRecipients({
      targetType,
      company,
      userIds
    });

    if (!recipients.length) {
      return next(errorHandler(404, 'No active users found for the selected target'));
    }

    const doc = await TaskNotification.create({
      title: String(title).trim(),
      message: message != null ? String(message) : '',
      targetType,
      company: companyKey,
      createdBy: creator._id,
      createdByName: `${creator.firstName || ''} ${creator.lastName || ''}`.trim(),
      createdByUserType: creator.userType || '',
      recipients
    });

    const payload = doc.toObject();
    emitToUsers(
      recipients.map((r) => r.userId),
      'tasknotification:new',
      payload
    );

    res.status(201).json({
      message: 'Task notification created successfully',
      data: payload,
      recipientCount: recipients.length
    });
  } catch (error) {
    if (error?.statusCode) return next(error);
    next(error);
  }
};

/**
 * GET all task notifications (newest first)
 */
export const getTaskNotifications = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.targetType) filter.targetType = req.query.targetType;
    if (req.query.company) {
      const key = normalizeCompanyKey(req.query.company);
      if (key) filter.company = key;
    }

    const [total, notifications] = await Promise.all([
      TaskNotification.countDocuments(filter),
      TaskNotification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean()
    ]);

    res.status(200).json({
      notifications,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit) || 1,
        total,
        limit
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET single task notification
 */
export const getTaskNotification = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(errorHandler(400, 'Invalid id'));
    }
    const notification = await TaskNotification.findById(id).lean();
    if (!notification) {
      return next(errorHandler(404, 'Task notification not found'));
    }
    res.status(200).json(notification);
  } catch (error) {
    next(error);
  }
};

/**
 * GET task notifications for a specific user (from recipients array)
 * Query: ?unseenOnly=true
 */
export const getTaskNotificationsByUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return next(errorHandler(400, 'Valid userId is required'));
    }

    const oid = new mongoose.Types.ObjectId(userId);
    const match =
      String(req.query.unseenOnly).toLowerCase() === 'true'
        ? { recipients: { $elemMatch: { userId: oid, seen: false } } }
        : { 'recipients.userId': oid };

    const notifications = await TaskNotification.find(match)
      .sort({ createdAt: -1 })
      .lean();

    const result = notifications.map((n) => {
      const me = (n.recipients || []).find((r) => String(r.userId) === String(userId));
      return {
        _id: n._id,
        title: n.title,
        message: n.message,
        targetType: n.targetType,
        company: n.company,
        createdBy: n.createdBy,
        createdByName: n.createdByName,
        createdByUserType: n.createdByUserType,
        seen: me?.seen ?? false,
        seenAt: me?.seenAt ?? null,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt
      };
    });

    res.status(200).json({
      notifications: result,
      count: result.length,
      unseenCount: result.filter((n) => !n.seen).length
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT mark seen for a user on a task notification
 * Body: { userId }
 */
export const markTaskNotificationSeen = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.body.userId || req.user?.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(errorHandler(400, 'Invalid id'));
    }
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return next(errorHandler(400, 'Valid userId is required'));
    }

    const updated = await TaskNotification.findOneAndUpdate(
      { _id: id, 'recipients.userId': userId },
      {
        $set: {
          'recipients.$.seen': true,
          'recipients.$.seenAt': new Date()
        }
      },
      { new: true }
    );

    if (!updated) {
      return next(errorHandler(404, 'Task notification not found for this user'));
    }

    const payload = {
      taskNotificationId: updated._id,
      userId: String(userId),
      seen: true,
      seenAt: new Date()
    };

    emitToUsers([userId, updated.createdBy], 'tasknotification:seen', payload);

    res.status(200).json({
      message: 'Marked as seen',
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE one task notification
 */
export const deleteTaskNotification = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(errorHandler(400, 'Invalid id'));
    }

    const deleted = await TaskNotification.findByIdAndDelete(id);
    if (!deleted) {
      return next(errorHandler(404, 'Task notification not found'));
    }

    const recipientIds = (deleted.recipients || []).map((r) => r.userId);
    emitToUsers(recipientIds, 'tasknotification:deleted', {
      taskNotificationId: deleted._id,
      title: deleted.title
    });

    res.status(200).json({
      message: 'Task notification deleted successfully',
      deleted
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE multiple task notifications
 * Body: { ids: string[] }
 */
export const deleteMultipleTaskNotifications = async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return next(errorHandler(400, 'Please provide an array of ids'));
    }

    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (!validIds.length) {
      return next(errorHandler(400, 'No valid ids provided'));
    }

    const toDelete = await TaskNotification.find({ _id: { $in: validIds } }).lean();
    const result = await TaskNotification.deleteMany({ _id: { $in: validIds } });

    for (const item of toDelete) {
      emitToUsers(
        (item.recipients || []).map((r) => r.userId),
        'tasknotification:deleted',
        { taskNotificationId: item._id, title: item.title }
      );
    }

    res.status(200).json({
      message: `Successfully deleted ${result.deletedCount} task notification(s)`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    next(error);
  }
};
