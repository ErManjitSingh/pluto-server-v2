import mongoose from 'mongoose';

const mobileOtpSchema = new mongoose.Schema(
  {
    mobile: {
      type: String,
      required: true,
      index: true,
    },
    otp: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    attempts: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

mobileOtpSchema.index({ mobile: 1, createdAt: -1 });

const MobileOtp = mongoose.model('MobileOtp', mobileOtpSchema);

export default MobileOtp;
