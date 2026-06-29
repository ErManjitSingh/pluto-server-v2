import mongoose from 'mongoose';

const hotelBookingSchema = new mongoose.Schema(
  {
    bookingId: {
      type: String,
    },
    cityName: {
      type: String,
    },
    contactInfo: {
      type: mongoose.Schema.Types.Mixed,
    },
    daysWithDates: {
      type: mongoose.Schema.Types.Mixed,
    },
    hotels: {
      type: mongoose.Schema.Types.Mixed,
    },
    numberOfGuests: {
      type: mongoose.Schema.Types.Mixed,
    },
    numberOfRooms: {
      type: String,
    },
    propertyName: {
      type: mongoose.Schema.Types.Mixed,
    },
    totalAmount: {
      type: Number,
    },
     totalamountwith25: {
      type: Number,
    },
    customerResponse: {
      status: {
        type: String,
        enum: ['cancel', 'accepted'],
        required: false,
      },
      note: {
        type: String,
        required: false,
      },
    },
    bookingresponse: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  { timestamps: true }
);

const HotelBooking = mongoose.model('HotelBooking', hotelBookingSchema);
export default HotelBooking;
