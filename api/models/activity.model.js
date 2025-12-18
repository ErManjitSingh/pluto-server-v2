import mongoose from "mongoose";

const activitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    packageOptions: [
      {
        packageType: {
          type: String,
          required: true,
        },
        dailyPrices: {
          type: Object,
          required: true,
        },
      },
    ],
    quantity: {
      type: Number,
      required: true,
    },
    offer: {
      type: String,
      required: true,
    },
    highlights: {
      type: Array,
      required: true,
    },
    imageUrls: {
      type: Array,
      required: true,
    },
    userRef: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

const Activity = mongoose.model("Activity", activitySchema);

export default Activity;
