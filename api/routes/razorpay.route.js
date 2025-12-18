import express from 'express';
// import { verifyToken } from '../utils/verifyUser.js';
import { makePayment } from '../controllers/razorpay.controller.js';

const router = express.Router();

router.post('/order', makePayment);

export default router;