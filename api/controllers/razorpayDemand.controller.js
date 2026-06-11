import Razorpay from 'razorpay';
import crypto from 'crypto';
import RazorpayDemand from '../models/razorpayDemand.model.js';
import InventoryBooking from '../models/inventorybooking.model.js';
import { applyInventoryBookingPayment } from './inventorybooking.controller.js';

const RAZORPAY_KEY_ID = 'rzp_live_T0IGH1tDnEjFWt';
const RAZORPAY_KEY_SECRET = 'z2nr1woEfSrsPY5VH8KIOF3u';

const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});

/**
 * POST /api/razorpay-demand/order
 * Body: { amount, currency?, referenceId?, inventoryBookingId?, customerDetails?, packageDetails?, notes? }
 * amount = INR rupees (e.g. 1500 for Rs 1500)
 */
export const createDemandOrder = async (req, res) => {
  try {
    const {
      amount,
      totalPrice,
      currency = 'INR',
      referenceId,
      inventoryBookingId,
      customerDetails,
      packageDetails,
      notes,
    } = req.body;

    if (inventoryBookingId) {
      const booking = await InventoryBooking.findById(inventoryBookingId);
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Inventory booking not found',
        });
      }
    }

    const amountInPaise = totalPrice ? Number(totalPrice) : Number(amount) * 100;

    if (!amountInPaise || Number.isNaN(amountInPaise) || amountInPaise < 100) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required (minimum Rs 1)',
      });
    }

    const receipt =
      referenceId || (inventoryBookingId ? `inventory_${inventoryBookingId}` : `demand_${Date.now()}`);

    const order = await razorpay.orders.create({
      amount: Math.round(amountInPaise),
      currency,
      receipt,
      payment_capture: 1,
    });

    const payment = await RazorpayDemand.create({
      orderId: order.id,
      referenceId: receipt,
      inventoryBookingId: inventoryBookingId || undefined,
      amount: Math.round(amountInPaise) / 100,
      currency,
      customerDetails: customerDetails || {},
      packageDetails: packageDetails || null,
      notes: notes || '',
      status: 'created',
    });

    res.json({
      success: true,
      key_id: RAZORPAY_KEY_ID,
      order,
      payment,
    });
  } catch (error) {
    console.error('Razorpay demand order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message,
    });
  }
};

/**
 * POST /api/razorpay-demand/verify
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 */
export const verifyDemandPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required',
      });
    }

    const generatedSignature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      await RazorpayDemand.findOneAndUpdate(
        { orderId: razorpay_order_id },
        { status: 'failed' }
      );

      return res.status(400).json({
        success: false,
        message: 'Payment verification failed',
      });
    }

    const payment = await RazorpayDemand.findOneAndUpdate(
      { orderId: razorpay_order_id },
      {
        status: 'paid',
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
      },
      { new: true }
    );

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found',
      });
    }

    let booking = null;
    if (payment.inventoryBookingId) {
      booking = await applyInventoryBookingPayment({
        bookingId: payment.inventoryBookingId,
        paidAmount: payment.amount,
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
      });
    }

    res.json({
      success: true,
      message: 'Payment verified successfully',
      payment,
      booking,
    });
  } catch (error) {
    console.error('Razorpay demand verify error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: error.message,
    });
  }
};

/**
 * GET /api/razorpay-demand/order/:orderId
 */
export const getDemandPayment = async (req, res) => {
  try {
    const payment = await RazorpayDemand.findOne({ orderId: req.params.orderId });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    res.json({
      success: true,
      payment,
    });
  } catch (error) {
    console.error('Razorpay demand get payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment',
      error: error.message,
    });
  }
};

/**
 * GET /api/razorpay-demand/key
 * Returns public key for frontend Razorpay checkout.
 */
export const getDemandRazorpayKey = async (req, res) => {
  res.json({
    success: true,
    key_id: RAZORPAY_KEY_ID,
  });
};
