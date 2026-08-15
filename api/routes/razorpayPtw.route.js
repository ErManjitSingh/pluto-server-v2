import express from 'express';
import {
  createPtwOrder,
  verifyPtwPayment,
  getPtwPayment,
  getAllPtwPayments,
  getPtwRazorpayKey,
} from '../controllers/razorpayPtw.controller.js';

const router = express.Router();

router.get('/key', getPtwRazorpayKey);
router.get('/payments', getAllPtwPayments);
router.post('/order', createPtwOrder);
router.post('/verify', verifyPtwPayment);
router.get('/order/:orderId', getPtwPayment);

export default router;
