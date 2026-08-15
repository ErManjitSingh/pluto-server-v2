import mongoose from 'mongoose';

const razorpayPtwSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    referenceId: {
      type: String,
      default: '',
      index: true,
    },
    inventoryBookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InventoryBooking',
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    status: {
      type: String,
      enum: ['created', 'paid', 'failed'],
      default: 'created',
      index: true,
    },
    paymentId: {
      type: String,
      default: '',
    },
    signature: {
      type: String,
      default: '',
    },
    customerDetails: {
      name: { type: String, default: '' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
    },
    packageDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    notes: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

const RazorpayPtw = mongoose.model('RazorpayPtw', razorpayPtwSchema);
export default RazorpayPtw;
