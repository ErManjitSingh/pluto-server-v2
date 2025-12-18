import Order from '../models/Order.model.js';
import Booking from '../models/Booking.model.js';
import Razorpay from 'razorpay';
import { errorHandler } from '../utils/error.js';
import crypto from 'crypto';

// Initialize Razorpay with test keys
const razorpay = new Razorpay({
    key_id: 'rzp_test_2drE7Lht1bNbBd',
    key_secret: 'LKanhMJSMYEBkaH2AoD5KIzr'
});

// Test the Razorpay connection
razorpay.orders.all().catch(err => {
    console.error('Razorpay initialization error:', err);
});

export const createOrder = async (req, res, next) => {
    try {
        const { bookingId, amount, currency = 'INR' } = req.body;
        console.log('Received order request:', req.body);

        // Validate required fields
        if (!bookingId || !amount) {
            return next(errorHandler(400, 'BookingId and amount are required'));
        }

        // Check if booking exists
        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return next(errorHandler(404, 'Booking not found'));
        }

        // Generate receipt number
        const receipt = `rcpt_${Date.now()}`;

        // Create order options
        const orderOptions = {
            amount: parseInt(amount),
            currency,
            receipt,
            notes: {
                bookingId: bookingId.toString()
            }
        };

        console.log('Creating order with options:', orderOptions);

        // Create Razorpay order with promise handling
        const razorpayOrder = await new Promise((resolve, reject) => {
            razorpay.orders.create(orderOptions, (err, order) => {
                if (err) {
                    console.error('Razorpay order creation error:', err);
                    reject(err);
                } else {
                    resolve(order);
                }
            });
        });

        console.log('Razorpay order created:', razorpayOrder);

        // Create order in database
        const order = new Order({
            bookingId,
            orderId: razorpayOrder.id,
            amount: amount / 100,
            currency,
            status: 'created',
            receipt
        });

        await order.save();

        // Return order details
        res.status(201).json({
            success: true,
            message: 'Order created successfully',
            data: {
                orderId: razorpayOrder.id,
                amount: amount,
                currency: currency,
                receipt: receipt,
                key: 'rzp_test_2drE7Lht1bNbBd'
            }
        });

    } catch (error) {
        console.error('Order creation error:', error);
        if (error.statusCode === 401) {
            console.error('Razorpay authentication failed. Details:', error);
        }
        next(error);
    }
};

export const verifyPayment = async (req, res, next) => {
    try {
        const { 
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            bookingId
        } = req.body;

        console.log('Received verification request:', req.body);

        // Verify payment signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', "LKanhMJSMYEBkaH2AoD5KIzr")
            .update(body)
            .digest('hex');

        const isAuthentic = expectedSignature === razorpay_signature;

        if (!isAuthentic) {
            return next(errorHandler(400, 'Invalid payment signature'));
        }

        // Update order status
        const order = await Order.findOne({ 
            orderId: razorpay_order_id,
            bookingId: bookingId
        });

        if (!order) {
            return next(errorHandler(404, 'Order not found'));
        }

        // Update order status
        order.status = 'paid';
        order.paymentId = razorpay_payment_id;
        await order.save();

        // Update booking status
        const booking = await Booking.findById(bookingId);
        if (booking) {
            booking.paymentStatus = 'paid';
            booking.status = 'confirmed';
            await booking.save();
        }

        res.status(200).json({
            success: true,
            message: 'Payment verified successfully',
            data: {
                orderId: razorpay_order_id,
                paymentId: razorpay_payment_id,
                bookingId: bookingId,
                status: 'paid'
            }
        });

    } catch (error) {
        console.error('Payment verification error:', error);
        next(error);
    }
};

export const getOrderStatus = async (req, res, next) => {
    try {
        const { orderId } = req.params;
        const order = await Order.findOne({ orderId })
            .populate({
                path: 'bookingId',
                populate: {
                    path: 'propertyId',
                    select: 'name location'
                }
            });

        if (!order) {
            return next(errorHandler(404, 'Order not found'));
        }

        res.status(200).json({
            success: true,
            data: order
        });

    } catch (error) {
        console.error('Get order status error:', error);
        next(error);
    }
};