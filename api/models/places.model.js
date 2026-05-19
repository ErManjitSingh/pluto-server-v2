import mongoose from "mongoose";

/** true = open, false = closed/off that day */
export const DEFAULT_OPERATING_DAYS = {
  monday: true,
  tuesday: true,
  wednesday: true,
  thursday: true,
  friday: true,
  saturday: true,
  sunday: true,
};

const operatingDaysSchema = new mongoose.Schema(
  {
    monday: { type: Boolean, default: true },
    tuesday: { type: Boolean, default: true },
    wednesday: { type: Boolean, default: true },
    thursday: { type: Boolean, default: true },
    friday: { type: Boolean, default: true },
    saturday: { type: Boolean, default: true },
    sunday: { type: Boolean, default: true },
  },
  { _id: false }
);

const placesSchema = new mongoose.Schema({
    placeName: {
        type: String,
        required: true,
    },
    enabled: {
        type: Boolean,
        required: true,
    },
    cost: {
        type: Object
    },
    paid: {
        type: Boolean,
        required: true,
    },
    time: {
        type: Number,
        required: true,
    },
    imageUrls: {
        type: Array,
        required: true,
    },
    distance: {
        type: Number,
        required: true,
    },
    description: {
        type: String,
        required: true,
    },
    city: {
        type: String,
        required: true,
    },
    stateName: {
      type: String,
      required: true,
    },
    country: {
        type: String,
        required: true,
    },
    operatingDays: {
      type: operatingDaysSchema,
      default: () => ({ ...DEFAULT_OPERATING_DAYS }),
    },
  });
  
  const Place = mongoose.model("Place", placesSchema);

export default Place;
