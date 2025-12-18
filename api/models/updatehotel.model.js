import mongoose from 'mongoose';

const updateHotelSchema = new mongoose.Schema({
  bookingId: {
    type: String,
    required: true
  },
  cityName: {
    type: String,
    required: true
  },
  contactInfo: {
    name: String,
    email: String,
    mobile: String
  },
  daysWithDates: [Object],
  hotels: [Object],
  inclusions: [String],
  leadDetails: {
    type: Object,
    required: true
  },
  numberOfGuests: {
    adults: String,
    kids: String,
    extraBeds: String
  },
  numberOfRooms: String,
  propertyName: String,
  totalAmount: Number,
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

const UpdateHotel = mongoose.model('UpdateHotel', updateHotelSchema);
export default UpdateHotel;
