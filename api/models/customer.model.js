import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    userid: {
      type: String,
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
    response: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    leadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("CustomerData", customerSchema);
