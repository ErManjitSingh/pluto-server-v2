import Razorpay from 'razorpay';
import Payment from '../models/payment.model.js';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Razorpay with test credentials
const razorpay = new Razorpay({
    key_id: 'rzp_test_2drE7Lht1bNbBd',     // Replace with your test key_id
    key_secret: 'LKanhMJSMYEBkaH2AoD5KIzr'  // Replace with your test key_secret
});


// Create a new order
export const createOrder = async (req, res) => {
  try {
    const { amount, currency = 'INR', bookingId, customerDetails } = req.body;

    // Add more detailed validation
    if (!amount || !bookingId) {
      return res.status(400).json({
        success: false,
        error: 'Amount and booking ID are required',
      });
    }

    // Log for debugging
    console.log('Creating order with details:', {
      amount,
      currency,
      bookingId,
      customerDetails
    });

    // Create Razorpay order
    const options = {
      amount: amount * 100, // amount in smallest currency unit (paise)
      currency,
      receipt: bookingId,
      payment_capture: 1,
    };

    const order = await razorpay.orders.create(options);
    console.log('Razorpay order created:', order);

    // Save order details to database
    const payment = new Payment({
      orderId: order.id,
      bookingId,
      amount: amount,
      currency,
      customerDetails,
      status: 'created',
    });

    await payment.save();

    res.json({
      success: true,
      order,
    });

  } catch (error) {
    console.error('Detailed error creating order:', error);
    res.status(500).json({
      success: false,
      error: 'Error creating order',
      details: error.message
    });
  }
};

// Verify payment
export const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    // Validate input
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing required payment verification parameters',
      });
    }

    console.log('Verifying payment with details:', {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });

    // Use the same key_secret as initialized with Razorpay
    const secret = 'LKanhMJSMYEBkaH2AoD5KIzr';  // Replace with your test key_secret
    
    // Create the signature verification text
    const text = `${razorpay_order_id}|${razorpay_payment_id}`;
    
    // Generate signature
    const generated_signature = crypto
      .createHmac('sha256', secret)
      .update(text)
      .digest('hex');

    console.log('Signature comparison:', {
      generated: generated_signature,
      received: razorpay_signature,
    });

    if (generated_signature === razorpay_signature) {
      // Update payment status in database
      const updatedPayment = await Payment.findOneAndUpdate(
        { orderId: razorpay_order_id },
        {
          status: 'paid',
          paymentId: razorpay_payment_id,
          signature: razorpay_signature,
          updatedAt: new Date(),
        },
        { new: true }
      );

      if (!updatedPayment) {
        console.error('Payment record not found for order:', razorpay_order_id);
        return res.status(404).json({
          success: false,
          error: 'Payment record not found',
        });
      }

      res.json({
        success: true,
        message: 'Payment verified successfully',
        payment: updatedPayment,
      });
    } else {
      // Update payment status as failed
      await Payment.findOneAndUpdate(
        { orderId: razorpay_order_id },
        {
          status: 'failed',
          updatedAt: new Date(),
        }
      );

      res.status(400).json({
        success: false,
        error: 'Payment verification failed - signature mismatch',
      });
    }

  } catch (error) {
    console.error('Detailed error verifying payment:', error);
    res.status(500).json({
      success: false,
      error: 'Error verifying payment',
      details: error.message,
    });
  }
};

// Get payment details
export const getPaymentDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const payment = await Payment.findOne({ orderId });
    
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found',
      });
    }

    res.json({
      success: true,
      payment,
    });

  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching payment details',
    });
  }
};
