import express from 'express';
import { createOrder, verifyPayment, getOrderStatus } from '../controllers/Order.controller.js';

const router = express.Router();

// Remove authentication middleware for now
router.post('/create', createOrder);
router.post('/verify', verifyPayment);
router.get('/status/:orderId', getOrderStatus);

export default router; 