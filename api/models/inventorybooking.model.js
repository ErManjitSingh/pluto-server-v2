import mongoose from 'mongoose';

const STATUS_ENUM = ['pending', 'completed', 'rejected' ,'partially_paid'];

const inventoryBookingSchema = new mongoose.Schema(
  {
    property: {
      type: mongoose.Schema.Types.Mixed,
    },
    stay: {
      type: mongoose.Schema.Types.Mixed,
    },
    guests: {
      type: mongoose.Schema.Types.Mixed,
    },
    bookingType: {
      type: String,
      default: 'inventory',
    },
    rooms: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    guest: {
      type: mongoose.Schema.Types.Mixed,
    },
    pricing: {
      type: mongoose.Schema.Types.Mixed,
    },
    totalRooms: {
      type: Number,
    },
    tourCompleted: {
      type: String,
      enum: STATUS_ENUM,
      default: 'pending',
    },
    payment: {
      type: String,
      enum: STATUS_ENUM,
      default: 'pending',
    },
    amountPaid: {
      type: Number,
      default: 0,
    },
     totalamountwith25: {
      type: Number,
    },
    paymentHistory: {
      type: [
        {
          orderId: { type: String, default: '' },
          paymentId: { type: String, default: '' },
          amount: { type: Number, default: '' },
          paidAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

inventoryBookingSchema.index({ 'guest.mobile': 1, createdAt: -1 });

const InventoryBooking = mongoose.model('InventoryBooking', inventoryBookingSchema);

export default InventoryBooking;
