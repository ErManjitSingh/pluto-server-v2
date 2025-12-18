import mongoose from 'mongoose';

const hotelFormSchema = new mongoose.Schema({
    checkInDate: {
        type: Date,
        required: true
    },
    checkOutDate: {
        type: Date,
        required: true
    },
    contactNumber: {
        type: String,
        required: true
    },
    guestName: {
        type: String,
        required: true
    },
    hotel: {
        type:String,  
        required: true
    },
    numberOfExtraBeds: {
        type: String,
        required: true
    },
    numberOfRooms: {
        type: String,
        required: true
    },
    specialInclusion: {
        type: String
    },
     extraBedsCharges: {
        type: Number,  // Changed from String to Number
       
    },
   totalPrice: {
        type: Number,  // Changed from String to Number
        required: true
    }
}, {
    timestamps: true
});

export default mongoose.model('HotelForm', hotelFormSchema);


