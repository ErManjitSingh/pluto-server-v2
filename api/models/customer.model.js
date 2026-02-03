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
  },
  { timestamps: true }
);

export default mongoose.model("CustomerData", customerSchema);
