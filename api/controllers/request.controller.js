import mongoose from 'mongoose';
import { errorHandler } from '../utils/error.js';
import { REQUEST_TYPES, REQUEST_TYPE_LABELS } from '../constants/requestTypes.js';
import {
  approveRequest,
  cancelRequest,
  createRequest,
  getRequestById,
  getRequestCounts,
  listRequests,
  rejectRequest,
} from '../services/request.service.js';

const isValidObjectId = (id) => {
  if (!id || typeof id !== 'string') return false;
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
};

const resolveUserId = (req) =>
  req.body?.userId ||
  req.body?.requestedBy ||
  req.query?.userId ||
  req.user?.id ||
  null;

/**
 * POST /create
 * Body: { type, requestedBy|userId, data?, note? }
 */
export const createCrmRequest = async (req, res, next) => {
  try {
    const requestedBy = req.body.requestedBy || req.body.userId || req.user?.id;
    const { type, data, note } = req.body;

    if (!requestedBy || !isValidObjectId(String(requestedBy))) {
      return next(errorHandler(400, 'Valid requestedBy (maker id) is required'));
    }

    const request = await createRequest({
      type,
      requestedBy,
      data,
      note,
    });

    res.status(201).json({
      success: true,
      message: 'Request submitted successfully',
      requestId: request._id,
      data: request,
    });
  } catch (error) {
    if (error?.statusCode) return next(error);
    next(error);
  }
};

/**
 * GET /get-all
 * Query: status, type, requestedBy, page, limit
 */
export const getCrmRequests = async (req, res, next) => {
  try {
    const result = await listRequests({
      status: req.query.status,
      type: req.query.type,
      requestedBy: req.query.requestedBy,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /counts
 * Query: requestedBy?
 */
export const getCrmRequestCounts = async (req, res, next) => {
  try {
    const requestedBy = req.query.requestedBy || req.query.userId || null;
    if (requestedBy && !isValidObjectId(String(requestedBy))) {
      return next(errorHandler(400, 'Valid requestedBy is required'));
    }
    const counts = await getRequestCounts({ requestedBy: requestedBy || undefined });
    res.status(200).json({
      success: true,
      counts,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /types
 */
export const getCrmRequestTypes = async (req, res) => {
  res.status(200).json({
    success: true,
    types: REQUEST_TYPES,
    labels: REQUEST_TYPE_LABELS,
  });
};

/**
 * GET /get/:id
 */
export const getCrmRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return next(errorHandler(400, 'Invalid id'));
    }
    const request = await getRequestById(id);
    res.status(200).json({
      success: true,
      data: request,
    });
  } catch (error) {
    if (error?.statusCode) return next(error);
    next(error);
  }
};

/**
 * GET /get-by-user/:userId
 * Query: status, type, page, limit
 */
export const getCrmRequestsByUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!isValidObjectId(userId)) {
      return next(errorHandler(400, 'Valid userId is required'));
    }
    const result = await listRequests({
      requestedBy: userId,
      status: req.query.status,
      type: req.query.type,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /approve/:id
 * Body: { userId }  — must be admin maker
 */
export const approveCrmRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminId = resolveUserId(req);

    if (!isValidObjectId(id)) {
      return next(errorHandler(400, 'Invalid id'));
    }
    if (!adminId || !isValidObjectId(String(adminId))) {
      return next(errorHandler(400, 'Valid admin userId is required'));
    }

    const request = await approveRequest({
      requestId: id,
      adminId,
    });

    res.status(200).json({
      success: true,
      message: 'Request approved successfully',
      data: request,
    });
  } catch (error) {
    if (error?.statusCode) return next(error);
    next(error);
  }
};

/**
 * PATCH /reject/:id
 * Body: { userId, rejectionReason }
 */
export const rejectCrmRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminId = resolveUserId(req);
    const rejectionReason = req.body.rejectionReason || req.body.reason || '';

    if (!isValidObjectId(id)) {
      return next(errorHandler(400, 'Invalid id'));
    }
    if (!adminId || !isValidObjectId(String(adminId))) {
      return next(errorHandler(400, 'Valid admin userId is required'));
    }

    const request = await rejectRequest({
      requestId: id,
      adminId,
      rejectionReason,
    });

    res.status(200).json({
      success: true,
      message: 'Request rejected successfully',
      data: request,
    });
  } catch (error) {
    if (error?.statusCode) return next(error);
    next(error);
  }
};

/**
 * PATCH /cancel/:id
 * Body: { userId } — requester only, while PENDING
 */
export const cancelCrmRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = resolveUserId(req);

    if (!isValidObjectId(id)) {
      return next(errorHandler(400, 'Invalid id'));
    }
    if (!userId || !isValidObjectId(String(userId))) {
      return next(errorHandler(400, 'Valid userId is required'));
    }

    const request = await cancelRequest({
      requestId: id,
      userId,
    });

    res.status(200).json({
      success: true,
      message: 'Request cancelled successfully',
      data: request,
    });
  } catch (error) {
    if (error?.statusCode) return next(error);
    next(error);
  }
};
