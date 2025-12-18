import express from 'express';
import { handleStep, getProperties, getRoomsById, getPropertyById, getHotelsByCityName,deleteProperty } from '../controllers/property.controller.js';

const router = express.Router();
router.use(express.json()); 

// Single route for handling all steps
router.post('/create-property', handleStep);
router.patch('/update-property/:id', handleStep);
router.get('/get-properties', getProperties);
router.get('/get-property-by-id/:id', getPropertyById);
router.get('/get-rooms-by-id/:id', getRoomsById)
router.get('/get-hotels-by-city/:cityName', getHotelsByCityName);
router.delete('/delete-property/:id', deleteProperty);
export default router;

