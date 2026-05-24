import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    userid: {
      type: String,
      required: true,
      trim: true,
    },
    
    hotel: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    cab: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    activites: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    other: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    packagename: {
      type: String,
      default: null,
      trim: true,
    },
    message: {
      type: String,
      default: null,
      trim: true,
    },
    leadname: {
      type: String,
      default: null,
      trim: true,
    },
    isSeen: {
      type: Boolean,
      default: false,
    },
    seenAt: {
      type: Date,
      default: null,
    },

    response: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    leadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    requestcallback: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    teamleaderid: {
      type: String,
      default: null,
      trim: true,
    },
    teamleadername: {
      type: String,
      default: null,
      trim: true,
    },
    managername: {
      type: String,
      default: null,
      trim: true,
    },
    managerid: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { timestamps: true }
);

// Indexes for faster queries
customerSchema.index({ userid: 1, createdAt: -1 }); // For user-specific queries
customerSchema.index({ teamleaderid: 1, createdAt: -1 }); // For team leader queries
customerSchema.index({ teamleadername: 1, createdAt: -1 }); // For team leader name queries
customerSchema.index({ managerid: 1, createdAt: -1 }); // For manager queries
customerSchema.index({ managername: 1, createdAt: -1 }); // For manager name queries
customerSchema.index({ isSeen: 1, createdAt: -1 }); // For notification queries
customerSchema.index({ userid: 1, isSeen: 1, createdAt: -1 }); // For user notification queries
customerSchema.index({ createdAt: -1 }); // For general sorting
customerSchema.index({ "leadata.publish": 1, createdAt: -1 }); // Filter by lead publish (ptw / demand)

export default mongoose.model("CustomerData", customerSchema);
