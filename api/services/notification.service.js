import mongoose from 'mongoose';
import Notification from '../models/notification.model.js';
import Maker from '../models/maker.model.js';
import { getIO } from '../socket/socket.js';

const MAKER_SELECT = 'firstName lastName email userType designation companyName active';

export const isAdminUserType = (userType) =>
  String(userType || '').trim().toLowerCase() === 'admin';

export const getMakerDisplayName = (maker) => {
  if (!maker) return 'User';
  const name = [maker.firstName, maker.lastName].filter(Boolean).join(' ').trim();
  return name || maker.email || 'User';
};

export const isValidObjectId = (id) => {
  if (!id || typeof id !== 'string') return false;
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
};

const toSocketPayload = (doc) => {
  const n = doc?.toObject ? doc.toObject() : { ...doc };
  return {
    id: String(n._id),
    _id: n._id,
    recipientId: n.recipientId,
    actorId: n.actorId || null,
    actorName: n.actorName || '',
    type: n.type,
    title: n.title,
    message: n.message,
    requestId: n.requestId || null,
    isRead: Boolean(n.isRead),
    createdAt: n.createdAt,
  };
};

const emitNotification = async (recipientId, notificationDoc) => {
  const io = getIO();
  if (!io || !recipientId) return;

  const room = `user:${String(recipientId)}`;
  io.to(room).emit('notification:new', toSocketPayload(notificationDoc));

  try {
    const count = await getUnreadCount(recipientId);
    io.to(room).emit('notification:unread-count', { count });
  } catch (err) {
    console.error('emitNotification unread-count error:', err?.message || err);
  }
};

export async function getUnreadCount(recipientId) {
  if (!recipientId) return 0;
  return Notification.countDocuments({
    recipientId,
    isRead: false,
  });
}

export async function createNotification({
  recipientId,
  actorId = null,
  actorName = '',
  type,
  title,
  message,
  requestId = null,
}) {
  const doc = await Notification.create({
    recipientId,
    actorId,
    actorName,
    type,
    title,
    message,
    requestId,
    isRead: false,
  });

  await emitNotification(recipientId, doc);
  return doc;
}

export async function notifyUser(recipientId, payload) {
  return createNotification({
    ...payload,
    recipientId,
  });
}

export async function findAdminMakers() {
  const makers = await Maker.find({
    active: { $ne: false },
    userType: { $regex: /^admin$/i },
  })
    .select(MAKER_SELECT)
    .lean();

  return makers || [];
}

export async function notifyAdmins({
  actorId = null,
  actorName = '',
  type,
  title,
  message,
  requestId = null,
}) {
  const admins = await findAdminMakers();
  if (!admins.length) return [];

  const docs = await Notification.insertMany(
    admins.map((admin) => ({
      recipientId: admin._id,
      actorId,
      actorName,
      type,
      title,
      message,
      requestId,
      isRead: false,
    }))
  );

  await Promise.all(docs.map((doc) => emitNotification(doc.recipientId, doc)));
  return docs;
}

export async function markAsRead(notificationId, userId) {
  const updated = await Notification.findOneAndUpdate(
    {
      _id: notificationId,
      recipientId: userId,
      isRead: false,
    },
    {
      $set: {
        isRead: true,
        readAt: new Date(),
      },
    },
    { new: true }
  );

  if (updated) {
    const io = getIO();
    if (io) {
      const room = `user:${String(userId)}`;
      io.to(room).emit('notification:read', {
        id: String(updated._id),
        requestId: updated.requestId || null,
      });
      const count = await getUnreadCount(userId);
      io.to(room).emit('notification:unread-count', { count });
    }
  }

  return updated;
}

export async function markAllAsRead(userId) {
  const result = await Notification.updateMany(
    { recipientId: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

  const io = getIO();
  if (io) {
    const room = `user:${String(userId)}`;
    io.to(room).emit('notification:read-all', { userId: String(userId) });
    io.to(room).emit('notification:unread-count', { count: 0 });
  }

  return result;
}

export async function getNotificationsForUser(userId, { unreadOnly = false, page = 1, limit = 20 } = {}) {
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const skip = (safePage - 1) * safeLimit;

  const filter = { recipientId: userId };
  if (unreadOnly) filter.isRead = false;

  const [total, unreadCount, notifications] = await Promise.all([
    Notification.countDocuments(filter),
    getUnreadCount(userId),
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
  ]);

  return {
    notifications,
    unreadCount,
    pagination: {
      currentPage: safePage,
      totalPages: Math.ceil(total / safeLimit) || 1,
      total,
      limit: safeLimit,
    },
  };
}
