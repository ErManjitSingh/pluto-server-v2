import express from 'express';
import { handleStep, getProperties, getRoomsById, getPropertyById, getHotelsByCityName, getBasicPropertyInfo, getAllBasicPropertyInfo, deletePackageMaker } from '../controllers/packagemaker.controller.js';

const router = express.Router();
router.use(express.json()); 

// Single route for handling all steps
//create-property
router.post('/create-packagemaker', handleStep);
//update-property/:id
router.patch('/update-packagemaker/:id', handleStep);
///get-properties
router.get('/get-packagemaker', getProperties);
//get-property-by-id/:id
router.get('/get-packagemaker-by-id/:id', getPropertyById);
//get-rooms-by-id/:id
router.get('/get-packagemakerrooms-by-id/:id', getRoomsById)
router.get('/get-packagemaker-hotels-by-city/:cityName', getHotelsByCityName);
//get-basic-property-info/:id
router.get('/get-packagemaker-basic-info/:id', getBasicPropertyInfo);
//get-all-basic-property-info
router.get('/get-all-packagemaker-basic-info', getAllBasicPropertyInfo);

// Add new delete route
router.delete('/delete-packagemaker/:id', deletePackageMaker);

export default router;

