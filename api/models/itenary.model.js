import mongoose from "mongoose";

const itinerarySchema = new mongoose.Schema(
  {
    cityName: { type: String, required: true, index: true },
    country: { type: String, required: true, index: true },
    cityArea: { type: [String], required: true },
    itineraryType: { type: String, required: true, index: true },
    itineraryTitle: { type: String, required: true },
    itineraryDescription: { type: String, required: true },
    connectingCity: String,
    specialNotes: String,
    totalHours: Number,
    distance: Number,
    status: {
      type: String,
      enum: ["enabled", "disabled"],
      default: "enabled",
      index: true
    }
  },
  { timestamps: true }
);

// 🔥 TEXT SEARCH INDEX
itinerarySchema.index({
  itineraryTitle: "text",
  itineraryDescription: "text",
  cityName: "text"
});

export default mongoose.model("Itinerary", itinerarySchema);
