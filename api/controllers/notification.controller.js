import mongoose from 'mongoose';
import { errorHandler } from '../utils/error.js';
import {
  deleteNotification,
  getNotificationsForUser,
  getUnreadCount,
  markAllAsRead,
  markAsRead,
} from '../services/notification.service.js';

const isValidObjectId = (id) => {
  if (!id || typeof id !== 'string') return false;
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
};

const resolveUserId = (req) =>
  req.params?.userId ||
  req.body?.userId ||
  req.query?.userId ||
  req.user?.id ||
  null;

/**
 * GET /get-by-user/:userId
 * Query: unreadOnly=true, page, limit
 */
export const getNotificationsByUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!isValidObjectId(userId)) {
      return next(errorHandler(400, 'Valid userId is required'));
    }

    const unreadOnly = String(req.query.unreadOnly || req.query.unseenOnly || '')
      .toLowerCase() === 'true';

    const payload = await getNotificationsForUser(userId, {
      unreadOnly,
      page: req.query.page,
      limit: req.query.limit,
    });

    res.status(200).json({
      success: true,
      ...payload,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /unread-count/:userId
 */
export const getNotificationUnreadCount = async (req, res, next) => {
  try {
    const userId = resolveUserId(req);
    if (!userId || !isValidObjectId(String(userId))) {
      return next(errorHandler(400, 'Valid userId is required'));
    }
    const count = await getUnreadCount(userId);
    res.status(200).json({
      success: true,
      count,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /read/:id
 * Body: { userId }
 */
export const markNotificationRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.body.userId || req.user?.id;

    if (!isValidObjectId(id)) {
      return next(errorHandler(400, 'Invalid id'));
    }
    if (!userId || !isValidObjectId(String(userId))) {
      return next(errorHandler(400, 'Valid userId is required'));
    }

    const updated = await markAsRead(id, userId);
    if (!updated) {
      return next(errorHandler(404, 'Notification not found for this user'));
    }

    res.status(200).json({
      success: true,
      message: 'Notification marked as seen and deleted',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /read-all/:userId
 * Deletes all notifications for this user.
 */
export const markAllNotificationsRead = async (req, res, next) => {
  try {
    const userId = resolveUserId(req);
    if (!userId || !isValidObjectId(String(userId))) {
      return next(errorHandler(400, 'Valid userId is required'));
    }

    const result = await markAllAsRead(userId);
    res.status(200).json({
      success: true,
      message: 'All notifications marked as seen and deleted',
      deletedCount: result.deletedCount || 0,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /delete/:id
 * Body: { userId }
 */
export const deleteCrmNotification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.body.userId || req.user?.id;

    if (!isValidObjectId(id)) {
      return next(errorHandler(400, 'Invalid id'));
    }
    if (!userId || !isValidObjectId(String(userId))) {
      return next(errorHandler(400, 'Valid userId is required'));
    }

    const deleted = await deleteNotification(id, userId);
    if (!deleted) {
      return next(errorHandler(404, 'Notification not found for this user'));
    }

    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully',
      data: deleted,
    });
  } catch (error) {
    next(error);
  }
};
