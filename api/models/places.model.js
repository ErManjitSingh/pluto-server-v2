import mongoose from "mongoose";

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
    }
  });
  
  const Place = mongoose.model("Place", placesSchema);

export default Place;