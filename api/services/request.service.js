import mongoose from 'mongoose';
import Request from '../models/request.model.js';
import Maker from '../models/maker.model.js';
import { getIO } from '../socket/socket.js';
import {
  REQUEST_STATUSES,
  REQUEST_TYPE_VALUES,
  NOTIFICATION_TYPES,
  getRequestTypeLabel,
} from '../constants/requestTypes.js';
import {
  findAdminMakers,
  getMakerDisplayName,
  isAdminUserType,
  notifyAdmins,
  notifyUser,
} from './notification.service.js';

const REQUEST_POPULATE = [
  { path: 'requestedBy', select: 'firstName lastName email userType designation companyName' },
  { path: 'processedBy', select: 'firstName lastName email userType designation companyName' },
];

const emitRequestEvent = (userIds, event, payload) => {
  const io = getIO();
  if (!io || !userIds?.length) return;
  for (const id of userIds) {
    if (!id) continue;
    io.to(`user:${String(id)}`).emit(event, payload);
  }
};

const toRequestSocketPayload = (request) => {
  const doc = request?.toObject ? request.toObject() : { ...request };
  return {
    id: String(doc._id),
    _id: doc._id,
    type: doc.type,
    status: doc.status,
    requestedBy: doc.requestedBy,
    requestedByName: doc.requestedByName,
    processedBy: doc.processedBy || null,
    processedAt: doc.processedAt || null,
    createdAt: doc.createdAt,
  };
};

export async function assertMaker(userId) {
  const maker = await Maker.findById(userId).select(
    'firstName lastName email userType designation companyName active'
  );
  if (!maker) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  if (maker.active === false) {
    const err = new Error('Your account is deactivated. Please contact support.');
    err.statusCode = 403;
    throw err;
  }
  return maker;
}

export async function assertAdminMaker(userId) {
  const maker = await assertMaker(userId);
  if (!isAdminUserType(maker.userType)) {
    const err = new Error('Only admin can process requests');
    err.statusCode = 403;
    throw err;
  }
  return maker;
}

/**
 * Approval records the decision only.
 * Existing cab / itinerary / hotel / package create-update APIs are not called,
 * so current CRM logic stays unchanged.
 */
async function recordApprovedAction(request) {
  return {
    performed: false,
    type: request.type,
    message:
      'Request approved. Use the existing CRM screens to apply this change if needed. Request data is stored on this record.',
  };
}

export async function createRequest({ type, requestedBy, data = {}, note = '' }) {
  if (!type || !REQUEST_TYPE_VALUES.includes(type)) {
    const err = new Error('Valid request type is required');
    err.statusCode = 400;
    throw err;
  }

  const maker = await assertMaker(requestedBy);
  const requestedByName = getMakerDisplayName(maker);
  const typeLabel = getRequestTypeLabel(type);

  const request = await Request.create({
    type,
    requestedBy: maker._id,
    requestedByName,
    requestedByUserType: maker.userType || '',
    data: data && typeof data === 'object' ? data : {},
    note: note != null ? String(note) : '',
    status: REQUEST_STATUSES.PENDING,
  });

  await notifyAdmins({
    actorId: maker._id,
    actorName: requestedByName,
    type: NOTIFICATION_TYPES.REQUEST_CREATED,
    title: 'New Request',
    message: `${requestedByName} requested ${typeLabel}.`,
    requestId: request._id,
  });

  const admins = await findAdminMakers();
  emitRequestEvent(
    admins.map((a) => a._id),
    'request:new',
    toRequestSocketPayload(request)
  );

  return request;
}

export async function getRequestById(requestId) {
  const request = await Request.findById(requestId).populate(REQUEST_POPULATE);
  if (!request) {
    const err = new Error('Request not found');
    err.statusCode = 404;
    throw err;
  }
  return request;
}

export async function listRequests({
  status,
  type,
  requestedBy,
  page = 1,
  limit = 20,
} = {}) {
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const skip = (safePage - 1) * safeLimit;

  const filter = {};
  if (status) filter.status = String(status).toUpperCase();
  if (type) filter.type = type;
  if (requestedBy) filter.requestedBy = requestedBy;

  const [total, requests] = await Promise.all([
    Request.countDocuments(filter),
    Request.find(filter)
      .populate(REQUEST_POPULATE)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit),
  ]);

  return {
    requests,
    pagination: {
      currentPage: safePage,
      totalPages: Math.ceil(total / safeLimit) || 1,
      total,
      limit: safeLimit,
    },
  };
}

export async function getRequestCounts({ requestedBy } = {}) {
  const match = requestedBy ? { requestedBy: new mongoose.Types.ObjectId(requestedBy) } : {};
  const rows = await Request.aggregate([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const counts = {
    PENDING: 0,
    APPROVED: 0,
    REJECTED: 0,
    CANCELLED: 0,
  };
  for (const row of rows) {
    if (row?._id) counts[row._id] = row.count;
  }
  counts.ALL = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return counts;
}

export async function approveRequest({ requestId, adminId }) {
  const admin = await assertAdminMaker(adminId);
  const adminName = getMakerDisplayName(admin);

  const request = await Request.findOneAndUpdate(
    { _id: requestId, status: REQUEST_STATUSES.PENDING },
    {
      $set: {
        status: REQUEST_STATUSES.APPROVED,
        processedBy: admin._id,
        processedByName: adminName,
        processedAt: new Date(),
      },
    },
    { new: true }
  );

  if (!request) {
    const existing = await Request.findById(requestId).select('status');
    if (!existing) {
      const err = new Error('Request not found');
      err.statusCode = 404;
      throw err;
    }
    const err = new Error('Request already processed');
    err.statusCode = 409;
    throw err;
  }

  const actionResult = await recordApprovedAction(request);
  request.actionResult = actionResult;
  await request.save();

  const typeLabel = getRequestTypeLabel(request.type);
  await notifyUser(request.requestedBy, {
    actorId: admin._id,
    actorName: adminName,
    type: NOTIFICATION_TYPES.REQUEST_APPROVED,
    title: 'Request Approved',
    message: `Your "${typeLabel}" request has been approved.`,
    requestId: request._id,
  });

  emitRequestEvent(
    [request.requestedBy, admin._id],
    'request:updated',
    toRequestSocketPayload(request)
  );

  return request;
}

export async function rejectRequest({ requestId, adminId, rejectionReason = '' }) {
  const admin = await assertAdminMaker(adminId);
  const adminName = getMakerDisplayName(admin);
  const reason = String(rejectionReason || '').trim();

  if (!reason) {
    const err = new Error('Rejection reason is required');
    err.statusCode = 400;
    throw err;
  }

  const request = await Request.findOneAndUpdate(
    { _id: requestId, status: REQUEST_STATUSES.PENDING },
    {
      $set: {
        status: REQUEST_STATUSES.REJECTED,
        processedBy: admin._id,
        processedByName: adminName,
        processedAt: new Date(),
        rejectionReason: reason,
      },
    },
    { new: true }
  );

  if (!request) {
    const existing = await Request.findById(requestId).select('status');
    if (!existing) {
      const err = new Error('Request not found');
      err.statusCode = 404;
      throw err;
    }
    const err = new Error('Request already processed');
    err.statusCode = 409;
    throw err;
  }

  const typeLabel = getRequestTypeLabel(request.type);
  await notifyUser(request.requestedBy, {
    actorId: admin._id,
    actorName: adminName,
    type: NOTIFICATION_TYPES.REQUEST_REJECTED,
    title: 'Request Rejected',
    message: `Your "${typeLabel}" request was rejected. Reason: ${reason}`,
    requestId: request._id,
  });

  emitRequestEvent(
    [request.requestedBy, admin._id],
    'request:updated',
    toRequestSocketPayload(request)
  );

  return request;
}

export async function cancelRequest({ requestId, userId }) {
  const maker = await assertMaker(userId);

  const request = await Request.findOneAndUpdate(
    {
      _id: requestId,
      requestedBy: maker._id,
      status: REQUEST_STATUSES.PENDING,
    },
    {
      $set: {
        status: REQUEST_STATUSES.CANCELLED,
        processedBy: maker._id,
        processedByName: getMakerDisplayName(maker),
        processedAt: new Date(),
      },
    },
    { new: true }
  );

  if (!request) {
    const existing = await Request.findById(requestId);
    if (!existing) {
      const err = new Error('Request not found');
      err.statusCode = 404;
      throw err;
    }
    if (String(existing.requestedBy) !== String(maker._id)) {
      const err = new Error('You can only cancel your own request');
      err.statusCode = 403;
      throw err;
    }
    const err = new Error('Request already processed');
    err.statusCode = 409;
    throw err;
  }

  const typeLabel = getRequestTypeLabel(request.type);
  const actorName = getMakerDisplayName(maker);

  await notifyAdmins({
    actorId: maker._id,
    actorName,
    type: NOTIFICATION_TYPES.REQUEST_CANCELLED,
    title: 'Request Cancelled',
    message: `${actorName} cancelled the "${typeLabel}" request.`,
    requestId: request._id,
  });

  const admins = await findAdminMakers();
  emitRequestEvent(
    [maker._id, ...admins.map((a) => a._id)],
    'request:updated',
    toRequestSocketPayload(request)
  );

  return request;
}
