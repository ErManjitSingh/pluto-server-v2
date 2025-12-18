import mongoose from "mongoose";

const statesSchema = new mongoose.Schema({
    stateName: {
      type: String,
      required: true,
    },
    country: {
        type: String,
        required: true,
    }
  });
  
  const State = mongoose.model("State", statesSchema);

export default State;