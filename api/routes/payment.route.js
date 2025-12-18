import express from 'express';
import { createOrder, verifyPayment, getPaymentDetails } from '../controllers/payment.controller.js';

const router = express.Router();

// Create new order
router.post('/create-razorpay-order', createOrder);

// Verify payment
router.post('/verify-razorpay-payment', verifyPayment);

// Get payment details
router.get('/razorpay-payment/:orderId', getPaymentDetails);

export default router;
