import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: true
    },
    orderId: {
        type: String,
        required: true,
        unique: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        required: true,
        default: 'INR'
    },
    status: {
        type: String,
        enum: ['created', 'paid', 'failed', 'refunded'],
        default: 'created'
    },
    paymentId: {
        type: String,
        sparse: true
    },
    receipt: {
        type: String,
        unique: true
    }
}, {
    timestamps: true
});

const Order = mongoose.model('Order', orderSchema);
export default Order; 