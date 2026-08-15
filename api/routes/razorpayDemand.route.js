import express from 'express';
import {
  createDemandOrder,
  verifyDemandPayment,
  getDemandPayment,
  getAllDemandPayments,
  getDemandRazorpayKey,
} from '../controllers/razorpayDemand.controller.js';

const router = express.Router();

router.get('/key', getDemandRazorpayKey);
router.get('/payments', getAllDemandPayments);
router.post('/order', createDemandOrder);
router.post('/verify', verifyDemandPayment);
router.get('/order/:orderId', getDemandPayment);

export default router;
