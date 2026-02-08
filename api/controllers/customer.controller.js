import CustomerData from "../models/customer.model.js";
import { getIO } from "../socket/socket.js";
import { errorHandler } from "../utils/error.js";

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
    emitCustomerEvent("customerdata:created", customer);
    emitCustomerEvent("customerdata:notification", {
      id: customer._id,
      userid: customer.userid,
      message: customer.message,
      leadname: customer.leadname,
      packagename: customer.packagename,
      leadata: customer.leadata,
      requestcallback: customer.requestcallback,
      isSeen: customer.isSeen,
      seenAt: customer.seenAt,
      createdAt: customer.createdAt,
    });
    return res.status(201).json(customer);
  } catch (error) {
    console.log('Create customer data error:', error);
    next(error);
  }
};

export const getCustomerData = async (req, res, next) => {
  try {
    const customers = await CustomerData.find()
      .sort({ createdAt: -1 })
      .lean();

    emitCustomerEvent("customerdata:fetched", customers);
    return res.status(200).json(customers);
  } catch (error) {
    console.log('Get customer data error:', error);
    next(error);
  }
};

export const getCustomerDataById = async (req, res, next) => {
  try {
    const customer = await CustomerData.findById(req.params.id).lean();
    if (!customer) {
      return next(errorHandler(404, "Customer data not found"));
    }
    emitCustomerEvent("customerdata:fetchedOne", customer);
    return res.status(200).json(customer);
  } catch (error) {
    console.log('Get customer data by ID error:', error);
    next(error);
  }
};

export const getCustomerDataByUserId = async (req, res, next) => {
  try {
    const { userid } = req.params;

    if (!userid) {
      return next(errorHandler(400, "User ID is required"));
    }

    const customers = await CustomerData.find({ userid })
      .sort({ createdAt: -1 })
      .lean();

    emitCustomerEvent("customerdata:fetchedByUser", customers);
    return res.status(200).json(customers);
  } catch (error) {
    console.log('Get customer data by user ID error:', error);
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

    const customers = await CustomerData.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json(customers);
  } catch (error) {
    console.log('Get customer data by team leader error:', error);
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

    const customers = await CustomerData.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json(customers);
  } catch (error) {
    console.log('Get customer data by manager error:', error);
    next(error);
  }
};

export const getCustomerNotifications = async (req, res, next) => {
  try {
    const includeSeen = req.query.includeSeen === "true";
    const filter = includeSeen ? {} : { isSeen: false };

    const notifications = await CustomerData.find(filter)
      .select(notificationSelect)
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json(notifications);
  } catch (error) {
    console.log('Get customer notifications error:', error);
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

    const filter = includeSeen
      ? { userid }
      : { userid, isSeen: false };

    const notifications = await CustomerData.find(filter)
      .select(notificationSelect)
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json(notifications);
  } catch (error) {
    console.log('Get customer notifications by user ID error:', error);
    next(error);
  }
};

export const markCustomerNotificationSeen = async (req, res, next) => {
  try {
    const notification = await CustomerData.findByIdAndUpdate(
      req.params.id,
      { isSeen: true, seenAt: new Date() },
      { new: true, runValidators: true }
    ).lean();
    if (!notification) {
      return next(errorHandler(404, "Notification not found"));
    }
    emitCustomerEvent("customerdata:notificationSeen", {
      id: notification._id,
      userid: notification.userid,
      isSeen: notification.isSeen,
      seenAt: notification.seenAt,
    });
    return res.status(200).json(notification);
  } catch (error) {
    console.log('Mark customer notification seen error:', error);
    next(error);
  }
};

export const updateCustomerData = async (req, res, next) => {
  try {
    const customer = await CustomerData.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).lean();
    if (!customer) {
      return next(errorHandler(404, "Customer data not found"));
    }
    emitCustomerEvent("customerdata:updated", customer);
    return res.status(200).json(customer);
  } catch (error) {
    console.log('Update customer data error:', error);
    next(error);
  }
};

export const deleteCustomerData = async (req, res, next) => {
  try {
    const customer = await CustomerData.findByIdAndDelete(req.params.id).lean();
    if (!customer) {
      return next(errorHandler(404, "Customer data not found"));
    }
    emitCustomerEvent("customerdata:deleted", { id: customer._id });
    return res.status(200).json({ message: "Customer data deleted successfully" });
  } catch (error) {
    console.log('Delete customer data error:', error);
    next(error);
  }
};

