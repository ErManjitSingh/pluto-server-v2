import express from "express";
import {
  createCustomerData,
  getCustomerData,
  getCustomerDataById,
  updateCustomerData,
  deleteCustomerData,
} from "../controllers/customer.controller.js";

const router = express.Router();

router.post("/", createCustomerData);
router.get("/", getCustomerData);
router.get("/:id", getCustomerDataById);
router.put("/:id", updateCustomerData);
router.delete("/:id", deleteCustomerData);

export default router;
