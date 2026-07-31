import mongoose from 'mongoose';

const discountApprovalSchema = new mongoose.Schema({
    state: { type: String, required: true },
    companyName: { type: String, required: true },
    customerLeadId: { type: String, required: true },
    packageId: { type: String, required: true },
    userId: { type: String, required: true },
    packageName: { type: String, required: true },
    package: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    loginUserDetail: { type: mongoose.Schema.Types.Mixed, required: true },
    discountPercentage: { type: Number, required: true },
    accept: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
    managerName: { type: String, required: true }
}, { timestamps: true });

discountApprovalSchema.index(
    { state: 1, userId: 1, packageId: 1, customerLeadId: 1 },
    { unique: true }
);

discountApprovalSchema.index({ customerLeadId: 1 });
discountApprovalSchema.index({ packageId: 1 });
discountApprovalSchema.index({ userId: 1 });
discountApprovalSchema.index({ companyName: 1 });
discountApprovalSchema.index({ companyName: 1, accept: 1 });

const DiscountApproval = mongoose.model('DiscountApproval', discountApprovalSchema);

export default DiscountApproval;
