import express from "express";
import {
  createCustomerData,
  getCustomerData,
  getCustomerDataByPublish,
  getCustomerDataById,
  getCustomerDataByUserId,
  getCustomerDataByTeamLeader,
  getCustomerDataByManager,
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
router.get("/teamleader", getCustomerDataByTeamLeader);
router.get("/manager", getCustomerDataByManager);
router.get("/publish", getCustomerDataByPublish);
router.get("/:id", getCustomerDataById);
router.put("/:id", updateCustomerData);
router.delete("/:id", deleteCustomerData);

export default router;
