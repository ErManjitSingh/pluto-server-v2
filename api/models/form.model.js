import mongoose from 'mongoose';

const formSchema = new mongoose.Schema(
    {
        customerInfo: {
            name: { type: String, required: true },
            email: { type: String },
            contact: { type: String }
        },
        bookingDetails: {
            address: { type: String },
            adults: { type: Number },
            children: { type: Number },
            childrenAges: [Number],
            checkInDate: { type: Date, required: true },
            checkOutDate: { type: Date, required: true },
            nights: { type: Number },
            numberOfRooms: { type: Number },
            selectedRooms: [{
                roomName: { type: String },
                roomType: { type: String },
                selectedCount: { type: Number },
                adults: { type: Number },
                children: { type: Number },
                baseRate: { type: Number },
                gstAmount: { type: Number },
                gstRate: { type: Number },
                totalRate: { type: Number }
            }],
            gstAmount: { type: Number },
            gstRate: { type: Number },
            totalPrice: { type: Number }
        },
        bookingDate: { type: Date },
        status: { type: String, default: 'pending' }
    },
    { timestamps: true }
);

const Form = mongoose.model('Form', formSchema);

export default Form;
