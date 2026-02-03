import express from "express";
import {
  createCustomerData,
  getCustomerData,
  getCustomerDataById,
  getCustomerDataByUserId,
  getCustomerNotifications,
  getCustomerNotificationsByUserId,
  markCustomerNotificationSeen,
  updateCustomerData,
  deleteCustomerData,
} from "../controllers/customer.controller.js";

const router = express.Router();

router.post("/", createCustomerData);
router.get("/", getCustomerData);
router.get("/notifications", getCustomerNotifications);
router.get("/notifications/user/:userid", getCustomerNotificationsByUserId);
router.patch("/notifications/:id/seen", markCustomerNotificationSeen);
router.get("/user/:userid", getCustomerDataByUserId);
router.get("/:id", getCustomerDataById);
router.put("/:id", updateCustomerData);
router.delete("/:id", deleteCustomerData);

export default router;
