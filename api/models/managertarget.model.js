import mongoose from 'mongoose';

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
     convertedLeads: {
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
  },
  { timestamps: true }
);

const ManagerTarget = mongoose.model('ManagerTarget', managerTargetSchema);

export default ManagerTarget;
