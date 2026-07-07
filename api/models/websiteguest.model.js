import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const websiteGuestSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    fullName: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
      unique: true,
    },
    country: {
      type: String,
      trim: true,
    },
    mobile: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
    },
    photoURL: {
      type: String,
      trim: true,
    },
    googleId: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
    },
    firebaseUid: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    mobileVerified: {
      type: Boolean,
      default: false,
    },
    password: {
      type: String,
      select: false,
    },
  },
  { timestamps: true }
);

websiteGuestSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

websiteGuestSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

const WebsiteGuest = mongoose.model('WebsiteGuest', websiteGuestSchema);

export default WebsiteGuest;
