import express from "express";

const router = express.Router();

import {
  addItinerary,
  editItinerary,
  getAllItineraries,
  deleteItinerary,
  getItinerary,
  getCityItinerary,
  searchItineraries,
} from "../controllers/itenary.controller.js";

// Route to add a new itinerary
router.post("/additinerary", addItinerary);

// Route to edit an existing itinerary
router.put("/updateitinerary/:id", editItinerary);

// Route to get all itineraries
router.get("/itinerary", getAllItineraries);

// Route to delete an itinerary
router.delete("/deleteitinerary/:id", deleteItinerary);

// Route to get an itinerary
router.get("/getitinerary/:id", getItinerary);

// Route to search itineraries on basis of city 
router.get("/citybasis/:cityName", getCityItinerary);

// This is search api for itineraries
router.get("/searchitineraries", searchItineraries);




export default router;
