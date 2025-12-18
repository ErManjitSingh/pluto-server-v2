import City from "../models/cities.model.js";

export const createCity = async (req, res) => {
  const { countryName, stateName } = req.params;
  const { cityName } = req.body;

  try {
    const newCity = new City({ cityName, state: stateName, country: countryName });
    await newCity.save();

    res.status(201).json(newCity);
  } catch (error) {
    console.error("Error adding city:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export const getCities = async (req, res, next) => {
  const { countryName, stateName } = req.params;

  try {
    const cities = await City.find({ country: countryName, state: stateName });

    res.json(cities);
  } catch (error) {
    console.error("Error fetching cities:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export const editCity = async (req, res) => {
  const { cityId } = req.params;
  const { cityName } = req.body;

  try {
    const updatedCity = await City.findByIdAndUpdate(cityId, { cityName }, { new: true });

    if (!updatedCity) {
      return res.status(404).json({ error: "City not found" });
    }

    res.json(updatedCity);
  } catch (error) {
    console.error("Error editing city:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export const deleteCity = async (req, res) => {
  const { cityId } = req.params;

  try {
    const deletedCity = await City.findByIdAndDelete(cityId);

    if (!deletedCity) {
      return res.status(404).json({ error: "City not found" });
    }

    res.json(deletedCity);
  } catch (error) {
    console.error("Error deleting city:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}


export const getAllCities = async (req, res, next) => {
  const { countryName } = req.params;

  try {
    const cities = await City.find({ country: countryName});

    res.json(cities);
  } catch (error) {
    console.error("Error fetching cities:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export const geteveryCities = async (req, res, next) => {
  try {
    const cities = await City.find();
    res.json(cities);
  } catch (error) {
    console.error("Error fetching cities:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export const searchCities = async (req, res) => {
  try {
    const { search } = req.query;
    const searchCriteria = {
      cityName: { $regex: new RegExp(search, 'i') } // Case-insensitive search for placeName
    };
    const cities = await City.find(searchCriteria);
    res.json(cities);
  } catch (error) {
    console.error("Error fetching places:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
