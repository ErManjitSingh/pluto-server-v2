import mongoose from "mongoose";

const citiesSchema = new mongoose.Schema({
    cityName: {
      type: String,
      required: true,
    },
    state: {
        type: String,
        required: true,
    },
    country: {
        type: String,
        required: true,
    }
  });
  
  const City = mongoose.model("City", citiesSchema);

export default City;