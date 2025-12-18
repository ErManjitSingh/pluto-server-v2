import mongoose from "mongoose";

const countriesSchema = new mongoose.Schema(
  {
    countryName: {
      type: String,
      required: true,
    }
  },
  { timestamps: true }
);

const Countries = mongoose.model("countries", countriesSchema);

export default Countries;
