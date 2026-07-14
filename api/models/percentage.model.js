import mongoose from 'mongoose';

const percentageSchema = new mongoose.Schema(
  {
    percentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    title: {
      type: String,
      trim: true,
      default: '',
    },
    note: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const Percentage = mongoose.model('Percentage', percentageSchema);

export default Percentage;
