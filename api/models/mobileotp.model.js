import mongoose from 'mongoose';

const mobileOtpSchema = new mongoose.Schema(
  {
    mobile: {
      type: String,
      required: true,
    },
    otp: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
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

mobileOtpSchema.index({ mobile: 1, verified: 1, createdAt: -1 });
mobileOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const MobileOtp = mongoose.model('MobileOtp', mobileOtpSchema);

export default MobileOtp;
