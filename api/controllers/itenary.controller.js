import Itinerary from "../models/itenary.model.js";

// Optional Cache (Safe - doesn't change response)
const cache = new Map();
const TTL = 5 * 60 * 1000;

const setCache = (key, data) => cache.set(key, { data, expire: Date.now() + TTL });
const getCache = (key) => {
  const item = cache.get(key);
  if (!item || item.expire < Date.now()) return null;
  return item.data;
};
const clearCache = () => cache.clear();

// ---------------------- ADD ----------------------
export const addItinerary = async (req, res) => {
  try {
    const item = await Itinerary.create(req.body);
    clearCache(); // keep data fresh
    res.status(201).json(item);   // SAME STRUCTURE AS BEFORE
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// ---------------------- EDIT ----------------------
export const editItinerary = async (req, res) => {
  try {
    const item = await Itinerary.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).lean();

    if (!item) return res.status(404).json({ message: "Not found" });

    clearCache();
    res.json(item);  // SAME RESPONSE AS BEFORE
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// ---------------------- DELETE ----------------------
export const deleteItinerary = async (req, res) => {
  try {
    const item = await Itinerary.findByIdAndDelete(req.params.id).lean();
    if (!item) return res.status(404).json({ message: "Not found" });

    clearCache();
    res.json(item);  // SAME STRUCTURE AS BEFORE
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// ---------------------- GET ALL ----------------------
export const getAllItineraries = async (req, res) => {
  try {
    const cacheKey = "all_itineraries";
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const data = await Itinerary.find().lean(); // FASTEST

    setCache(cacheKey, data);
    res.json(data);  // SAME STRUCTURE AS BEFORE: ARRAY ONLY
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ---------------------- GET ONE ----------------------
export const getItinerary = async (req, res) => {
  try {
    const cacheKey = `item_${req.params.id}`;
    const cached = getCache(cacheKey);

    if (cached) return res.json(cached);

    const item = await Itinerary.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ message: "Not found" });

    setCache(cacheKey, item);
    res.json(item);  // SAME STRUCTURE AS BEFORE
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ---------------------- GET BY CITY ----------------------
export const getCityItinerary = async (req, res) => {
  try {
    const cacheKey = `city_${req.params.cityName}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const data = await Itinerary.find({ cityName: req.params.cityName }).lean();

    setCache(cacheKey, data);
    res.json(data); // ALWAYS ARRAY LIKE BEFORE
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ---------------------- SEARCH ----------------------
export const searchItineraries = async (req, res) => {
  try {
    const search = req.query.search || "";
    const key = `search_${search}`;
    const cached = getCache(key);

    if (cached) return res.json(cached);

    let results;

    if (search.trim() === "") {
      results = [];
    } else {
      results = await Itinerary.find(
        { $text: { $search: search } },
        { score: { $meta: "textScore" } }
      )
        .sort({ score: { $meta: "textScore" } })
        .lean();
    }

    setCache(key, results);
    res.json(results); // ALWAYS ARRAY
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
