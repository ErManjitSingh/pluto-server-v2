import CustomerData from "../models/customer.model.js";
import { getIO } from "../socket/socket.js";

const emitCustomerEvent = (event, payload) => {
  const io = getIO();
  if (io) {
    io.emit(event, payload);
  }
};

const notificationSelect =
  "userid message leadname packagename leadata isSeen seenAt createdAt updatedAt";

export const createCustomerData = async (req, res) => {
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
      isSeen: customer.isSeen,
      seenAt: customer.seenAt,
      createdAt: customer.createdAt,
    });
    return res.status(201).json(customer);
  } catch (error) {
    return res.status(400).json({ message: "Failed to create customer data", error: error.message });
  }
};

export const getCustomerData = async (req, res) => {
  try {
    const customers = await CustomerData.find().sort({ createdAt: -1 });
    emitCustomerEvent("customerdata:fetched", customers);
    return res.status(200).json(customers);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch customer data", error: error.message });
  }
};

export const getCustomerDataById = async (req, res) => {
  try {
    const customer = await CustomerData.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: "Customer data not found" });
    }
    emitCustomerEvent("customerdata:fetchedOne", customer);
    return res.status(200).json(customer);
  } catch (error) {
    return res.status(400).json({ message: "Failed to fetch customer data", error: error.message });
  }
};

export const getCustomerDataByUserId = async (req, res) => {
  try {
    const customers = await CustomerData.find({ userid: req.params.userid }).sort({ createdAt: -1 });
    emitCustomerEvent("customerdata:fetchedByUser", customers);
    return res.status(200).json(customers);
  } catch (error) {
    return res.status(400).json({ message: "Failed to fetch customer data", error: error.message });
  }
};

export const getCustomerNotifications = async (req, res) => {
  try {
    const includeSeen = req.query.includeSeen === "true";
    const filter = includeSeen ? {} : { isSeen: false };
    const notifications = await CustomerData.find(filter)
      .select(notificationSelect)
      .sort({ createdAt: -1 });
    return res.status(200).json(notifications);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch notifications", error: error.message });
  }
};

export const getCustomerNotificationsByUserId = async (req, res) => {
  try {
    const includeSeen = req.query.includeSeen === "true";
    const filter = includeSeen
      ? { userid: req.params.userid }
      : { userid: req.params.userid, isSeen: false };
    const notifications = await CustomerData.find(filter)
      .select(notificationSelect)
      .sort({ createdAt: -1 });
    return res.status(200).json(notifications);
  } catch (error) {
    return res.status(400).json({ message: "Failed to fetch notifications", error: error.message });
  }
};

export const markCustomerNotificationSeen = async (req, res) => {
  try {
    const notification = await CustomerData.findByIdAndUpdate(
      req.params.id,
      { isSeen: true, seenAt: new Date() },
      { new: true, runValidators: true }
    );
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    emitCustomerEvent("customerdata:notificationSeen", {
      id: notification._id,
      userid: notification.userid,
      isSeen: notification.isSeen,
      seenAt: notification.seenAt,
    });
    return res.status(200).json(notification);
  } catch (error) {
    return res.status(400).json({ message: "Failed to update notification", error: error.message });
  }
};

export const updateCustomerData = async (req, res) => {
  try {
    const customer = await CustomerData.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!customer) {
      return res.status(404).json({ message: "Customer data not found" });
    }
    emitCustomerEvent("customerdata:updated", customer);
    return res.status(200).json(customer);
  } catch (error) {
    return res.status(400).json({ message: "Failed to update customer data", error: error.message });
  }
};

export const deleteCustomerData = async (req, res) => {
  try {
    const customer = await CustomerData.findByIdAndDelete(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: "Customer data not found" });
    }
    emitCustomerEvent("customerdata:deleted", { id: customer._id });
    return res.status(200).json({ message: "Customer data deleted successfully" });
  } catch (error) {
    return res.status(400).json({ message: "Failed to delete customer data", error: error.message });
  }
};

