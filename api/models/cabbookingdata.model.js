import mongoose from 'mongoose';

const cabBookingSchema = new mongoose.Schema({
  bookingId: {
    type: String,
    required: true
  },
  customerInfo: mongoose.Schema.Types.Mixed,
  tripDetails: mongoose.Schema.Types.Mixed,
  vehicleDetails: mongoose.Schema.Types.Mixed,
  cost: {
    type: Number,
    required: true
  },
  itinerary: [{
    type: mongoose.Schema.Types.Mixed
  }],
  bookingStatus: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  },
   pdf: {
    data: Buffer,
    contentType: String,
    filename: String
  },
 responseDetails: [{
    status: String,
   negotiateAmount:Number,
    amount: Number,
    reason: String,
    respondedAt: Date,
    executiveDetails: String,
    signinDetails: {
      phone: Number,
      email: String,
      userId:String,
    },
     driverDetails: {
      phone: Number,
      name:String,
    }
  }]
}, { timestamps: true });

const CabBooking = mongoose.model('CabBooking', cabBookingSchema);

export default CabBooking;
