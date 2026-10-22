import mongoose from 'mongoose';

const dayDifferenceSchema = new mongoose.Schema(
  {
    date: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'],
    },
    reason: {
      type: String,
      trim: true,
      required: true,
      maxlength: 1000,
    },
  },
  { _id: false }
);

const monthEntrySchema = new mongoose.Schema(
  {
    month: {
      type: String,
    },
    totalTargetAmount: {
      type: Number,
      min: 0,
    },
    totalLeadsAssigned: {
      type: Number,
      min: 0,
    },
    achieved: {
      type: Number,
      min: 0,
    },
    inProgress: {
      type: Number,
      min: 0,
    },
    behind: {
      type: Number,
      min: 0,
    },
    convertedLeads: {
      type: Number,
      min: 0,
    },
    convertedLeadDetails: {
      type: [
        new mongoose.Schema(
          {
            name: { type: String, trim: true },
            mobile: { type: String, trim: true },
            destination: { type: String, trim: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { _id: false }
);

const managerTargetSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      enum: ['ptw', 'demand setu'],
      unique: true,
    },
    months: {
      type: [monthEntrySchema],
      default: [],
    },
    dayDifferences: {
      type: [dayDifferenceSchema],
      default: [],
    },
  },
  { timestamps: true }
);

const ManagerTarget = mongoose.model('ManagerTarget', managerTargetSchema);

export default ManagerTarget;
