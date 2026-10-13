import mongoose from 'mongoose';

const targetAchieveSchema = new mongoose.Schema(
  {
    date: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'],
    },
    achievedAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    notAchievedAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    achievedLeads: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    notAchievedLeads: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    reason: {
      type: String,
      trim: true,
      default: '',
      maxlength: 1000,
    },
  },
  { timestamps: true }
);

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
        companyName: {
          type: String,
          required: false,
          trim: true,
          default: null,
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
        targetAchieve: {
          type: [targetAchieveSchema],
          default: [],
        },
      },
    ],
  },
  { timestamps: true }
);

// Indexes for faster month and nested-target lookups
targetManagementSchema.index({ month: 1 });
targetManagementSchema.index({ 'targets.userId': 1, createdAt: -1 });
targetManagementSchema.index({ 'targets.teamLeaderId': 1, createdAt: -1 });
targetManagementSchema.index({ 'targets.managerId': 1, createdAt: -1 });
targetManagementSchema.index({ 'targets.companyName': 1, createdAt: -1 });

const TargetManagement = mongoose.model('TargetManagement', targetManagementSchema);

export default TargetManagement;
