import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const activityUserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true
    },
    mobile: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    states: {
      type: [String],
      validate: [arrayLimit, 'You must specify at least one state']
    }
  },
  {
    timestamps: true
  }
);

function arrayLimit(val) {
  return Array.isArray(val) && val.length > 0;
}

activityUserSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();

  try {
    this.password = await bcrypt.hash(this.password, 12);
    next();
  } catch (err) {
    next(err);
  }
});

activityUserSchema.methods.comparePassword = async function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const ActivityUser = mongoose.model('ActivityUser', activityUserSchema);

export default ActivityUser;

