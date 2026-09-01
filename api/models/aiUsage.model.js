import mongoose from 'mongoose';

const aiUsageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    date: {
      type: String,
      required: true,
    },
    count: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

aiUsageSchema.index({ userId: 1, date: 1 }, { unique: true });

const AiUsage = mongoose.model('AiUsage', aiUsageSchema);
export default AiUsage;
