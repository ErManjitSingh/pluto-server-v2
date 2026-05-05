import mongoose from 'mongoose';

const targetManagementSchema = new mongoose.Schema(
  {
    month: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z]{3,9}\d{4}$/, 'Month must be like may2026'],
    },
    targets: [
      {
        targetData: {
          type: Number,
          required: true,
          min: 0,
        },
        numberOfLeads: {
          type: Number,
          required: true,
          min: 0,
        },
        userId: {
          type: mongoose.Schema.Types.Mixed,
          required: true,
        },
        teamLeaderId: {
          type: mongoose.Schema.Types.Mixed,
          required: false,
          default: null,
        },
        managerId: {
          type: mongoose.Schema.Types.Mixed,
          required: false,
          default: null,
        },
      },
    ],
  },
  { timestamps: true }
);

const TargetManagement = mongoose.model('TargetManagement', targetManagementSchema);

export default TargetManagement;
