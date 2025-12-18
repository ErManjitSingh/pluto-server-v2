import Countries from "../models/countries.model.js";
import { errorHandler } from "../utils/error.js";

export const getAllCountries = async (req, res) => {
  try {
    const countries = await Countries.find();
    res.json(countries);
  } catch (error) {
    errorHandler(res, error);  // Utilizing errorHandler for better error handling
  }
};

export const addCountry = async (req, res) => {
  const { countryName } = req.body;

  try {
    const newCountry = await Countries.create({ countryName });
    res.json(newCountry);
  } catch (error) {
    errorHandler(res, error);
  }
};

export const editCountry = async (req, res) => {
  const { countryId } = req.params;
  const { countryName } = req.body;

  try {
    const updatedCountry = await Countries.findByIdAndUpdate(
      countryId,
      { countryName },
      { new: true }
    );

    res.json(updatedCountry);
  } catch (error) {
    errorHandler(res, error);
  }
};

export const deleteCountry = async (req, res) => {
  const { countryId } = req.params;

  try {
    await Countries.findByIdAndRemove(countryId);
    res.json({ message: 'Country deleted successfully' });
  } catch (error) {
    errorHandler(res, error);
  }
};
