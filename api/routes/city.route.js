import express from 'express';
import { getCitiesWithHotels } from '../controllers/city.controller.js';

const router = express.Router();

// Route to get all cities with their hotels
router.get('/cities-with-hotels', getCitiesWithHotels);

export default router; 