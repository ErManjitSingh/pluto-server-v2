import mongoose from "mongoose";
import CustomerData from "../models/customer.model.js";
import { getIO } from "../socket/socket.js";
import { errorHandler } from "../utils/error.js";

// --------------------------------------
// SUPER FAST IN-MEMORY CACHE
// --------------------------------------
const cache = new Map();
const TTL = 5 * 60 * 1000;

const cacheGet = (key) => {
  const item = cache.get(key);
  if (!item || item.expire < Date.now()) return null;
  return item.data;
};

const cacheSet = (key, data) =>
  cache.set(key, { data, expire: Date.now() + TTL });

const cacheClear = () => cache.clear();

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 50;

const parsePagination = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT)
  );
  return { page, limit, skip: (page - 1) * limit };
};

const buildPagination = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit) || 0;
  return {
    currentPage: page,
    totalPages,
    totalItems: total,
    itemsPerPage: limit,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const emitCustomerEvent = (event, payload) => {
  const io = getIO();
  if (io) {
    io.emit(event, payload);
  }
};

const notificationSelect =
  "userid message leadname packagename leadata requestcallback isSeen seenAt createdAt updatedAt";

export const createCustomerData = async (req, res, next) => {
  try {
    const customer = await CustomerData.create(req.body);
    cacheClear();

    const payload = customer.toObject ? customer.toObject() : customer;
    emitCustomerEvent("customerdata:created", payload);
    emitCustomerEvent("customerdata:notification", {
      id: payload._id,
      userid: payload.userid,
      message: payload.message,
      leadname: payload.leadname,
      packagename: payload.packagename,
      leadata: payload.leadata,
      requestcallback: payload.requestcallback,
      isSeen: payload.isSeen,
      seenAt: payload.seenAt,
      createdAt: payload.createdAt,
    });
    return res.status(201).json(payload);
  } catch (error) {
    console.log("Create customer data error:", error);
    next(error);
  }
};

export const getCustomerData = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const cacheKey = `customers_all_${page}_${limit}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      emitCustomerEvent("customerdata:fetched", cached);
      return res.status(200).json(cached);
    }

    const [customers, total] = await Promise.all([
      CustomerData.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CustomerData.countDocuments(),
    ]);

    const data = {
      customers,
      pagination: buildPagination(page, limit, total),
    };

    cacheSet(cacheKey, data);
    emitCustomerEvent("customerdata:fetched", data);
    return res.status(200).json(data);
  } catch (error) {
    console.log("Get customer data error:", error);
    next(error);
  }
};

export const getCustomerDataByPublish = async (req, res, next) => {
  try {
    const publish = (req.query.publish || "").trim().toLowerCase();

    if (!publish) {
      return next(errorHandler(400, "publish query param is required (ptw or demand)"));
    }
    if (publish !== "ptw" && publish !== "demand") {
      return next(errorHandler(400, "publish must be ptw or demand"));
    }

    const { page, limit, skip } = parsePagination(req.query);
    const filter = { "leadata.publish": publish };

    const cacheKey = `customers_publish_${publish}_${page}_${limit}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.status(200).json(cached);

    const [customers, total] = await Promise.all([
      CustomerData.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CustomerData.countDocuments(filter),
    ]);

    const data = {
      publish,
      customers,
      pagination: buildPagination(page, limit, total),
    };

    cacheSet(cacheKey, data);
    return res.status(200).json(data);
  } catch (error) {
    console.log("Get customer data by publish error:", error);
    next(error);
  }
};

export const getCustomerDataById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return next(errorHandler(400, "Invalid customer id"));
    }

    const cacheKey = `customer_${id}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      emitCustomerEvent("customerdata:fetchedOne", cached);
      return res.status(200).json(cached);
    }

    const customer = await CustomerData.findById(id).lean();
    if (!customer) {
      return next(errorHandler(404, "Customer data not found"));
    }

    cacheSet(cacheKey, customer);
    emitCustomerEvent("customerdata:fetchedOne", customer);
    return res.status(200).json(customer);
  } catch (error) {
    console.log("Get customer data by ID error:", error);
    next(error);
  }
};

export const getCustomerDataByUserId = async (req, res, next) => {
  try {
    const { userid } = req.params;

    if (!userid) {
      return next(errorHandler(400, "User ID is required"));
    }

    const cacheKey = `customers_user_${userid}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      emitCustomerEvent("customerdata:fetchedByUser", cached);
      return res.status(200).json(cached);
    }

    const customers = await CustomerData.find({ userid })
      .sort({ createdAt: -1 })
      .lean();

    cacheSet(cacheKey, customers);
    emitCustomerEvent("customerdata:fetchedByUser", customers);
    return res.status(200).json(customers);
  } catch (error) {
    console.log("Get customer data by user ID error:", error);
    next(error);
  }
};

export const getCustomerDataByTeamLeader = async (req, res, next) => {
  try {
    const { teamleaderid, teamleadername } = req.query;

    if (!teamleaderid && !teamleadername) {
      return next(errorHandler(400, "Provide teamleaderid or teamleadername"));
    }

    const filter = {};
    if (teamleaderid) filter.teamleaderid = teamleaderid;
    if (teamleadername) filter.teamleadername = teamleadername;

    const cacheKey = `customers_tl_${teamleaderid || ""}_${teamleadername || ""}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.status(200).json(cached);

    const customers = await CustomerData.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    cacheSet(cacheKey, customers);
    return res.status(200).json(customers);
  } catch (error) {
    console.log("Get customer data by team leader error:", error);
    next(error);
  }
};

export const getCustomerDataByManager = async (req, res, next) => {
  try {
    const { managerid, managername } = req.query;

    if (!managerid && !managername) {
      return next(errorHandler(400, "Provide managerid or managername"));
    }

    const filter = {};
    if (managerid) filter.managerid = managerid;
    if (managername) filter.managername = managername;

    const cacheKey = `customers_mgr_${managerid || ""}_${managername || ""}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.status(200).json(cached);

    const customers = await CustomerData.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    cacheSet(cacheKey, customers);
    return res.status(200).json(customers);
  } catch (error) {
    console.log("Get customer data by manager error:", error);
    next(error);
  }
};

export const getCustomerNotifications = async (req, res, next) => {
  try {
    const includeSeen = req.query.includeSeen === "true";
    const filter = includeSeen ? {} : { isSeen: false };

    const cacheKey = `customer_notif_${includeSeen ? "all" : "unseen"}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.status(200).json(cached);

    const notifications = await CustomerData.find(filter)
      .select(notificationSelect)
      .sort({ createdAt: -1 })
      .lean();

    cacheSet(cacheKey, notifications);
    return res.status(200).json(notifications);
  } catch (error) {
    console.log("Get customer notifications error:", error);
    next(error);
  }
};

export const getCustomerNotificationsByUserId = async (req, res, next) => {
  try {
    const { userid } = req.params;
    const includeSeen = req.query.includeSeen === "true";

    if (!userid) {
      return next(errorHandler(400, "User ID is required"));
    }

    const filter = includeSeen ? { userid } : { userid, isSeen: false };

    const cacheKey = `customer_notif_user_${userid}_${includeSeen ? "all" : "unseen"}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.status(200).json(cached);

    const notifications = await CustomerData.find(filter)
      .select(notificationSelect)
      .sort({ createdAt: -1 })
      .lean();

    cacheSet(cacheKey, notifications);
    return res.status(200).json(notifications);
  } catch (error) {
    console.log("Get customer notifications by user ID error:", error);
    next(error);
  }
};

export const markCustomerNotificationSeen = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return next(errorHandler(400, "Invalid notification id"));
    }

    const notification = await CustomerData.findByIdAndUpdate(
      id,
      { isSeen: true, seenAt: new Date() },
      { new: true, runValidators: false }
    ).lean();

    if (!notification) {
      return next(errorHandler(404, "Notification not found"));
    }

    cacheClear();
    emitCustomerEvent("customerdata:notificationSeen", {
      id: notification._id,
      userid: notification.userid,
      isSeen: notification.isSeen,
      seenAt: notification.seenAt,
    });
    return res.status(200).json(notification);
  } catch (error) {
    console.log("Mark customer notification seen error:", error);
    next(error);
  }
};

export const updateCustomerData = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return next(errorHandler(400, "Invalid customer id"));
    }

    const customer = await CustomerData.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: false,
    }).lean();

    if (!customer) {
      return next(errorHandler(404, "Customer data not found"));
    }

    cacheClear();
    emitCustomerEvent("customerdata:updated", customer);
    return res.status(200).json(customer);
  } catch (error) {
    console.log("Update customer data error:", error);
    next(error);
  }
};

export const deleteCustomerData = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return next(errorHandler(400, "Invalid customer id"));
    }

    const result = await CustomerData.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      return next(errorHandler(404, "Customer data not found"));
    }

    cacheClear();
    emitCustomerEvent("customerdata:deleted", { id });
    return res.status(200).json({ message: "Customer data deleted successfully" });
  } catch (error) {
    console.log("Delete customer data error:", error);
    next(error);
  }
};
