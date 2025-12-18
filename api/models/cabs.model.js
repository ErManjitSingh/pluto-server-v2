import mongoose from "mongoose";

const cabSchema = new mongoose.Schema({
    cabType: {
      type: String,
      required: true,
    },
    cabName: {
        type: String,
        required: true,
    },
    cabImages: {
        type: Array,
        required: false,
    },
    cabSeatingCapacity: {
        type: String,
        required: false,
    },
    cabLuggage: {
        type: String,
        required: false,
    }
  });
  
  const Cabs = mongoose.model("Cabs", cabSchema);

export default Cabs;
