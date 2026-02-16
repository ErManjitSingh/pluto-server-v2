import mongoose from 'mongoose';

// 1star & 4star: day-based fields = 0-10 days, 10-30 days, above 30 days
const paymentPolicySchema = new mongoose.Schema({
    state: {
        type: String,
        required: true,
        unique: true
    },
    '1star': {
        zeroTo10Days: { type: String, required: true },
        tenTo30Days: { type: String, required: true },
        above30Days: { type: String, required: true }
    },
    '4star': {
        zeroTo10Days: { type: String, required: true },
        tenTo30Days: { type: String, required: true },
        above30Days: { type: String, required: true }
    }
}, { timestamps: true });

const PaymentPolicy = mongoose.model('PaymentPolicy', paymentPolicySchema);

export default PaymentPolicy;
