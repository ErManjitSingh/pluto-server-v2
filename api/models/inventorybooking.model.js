import mongoose from 'mongoose';

const STATUS_ENUM = ['pending', 'completed', 'rejected'];

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
  },
  { timestamps: true }
);

inventoryBookingSchema.index({ 'guest.mobile': 1, createdAt: -1 });

const InventoryBooking = mongoose.model('InventoryBooking', inventoryBookingSchema);

export default InventoryBooking;
