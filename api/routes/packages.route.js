import express from 'express';
import { createPackage, getPackages, updateTravelPrices, getPackageById, updatePackageHotels, updatePackageData, deletePackage } from '../controllers/packages.controller.js';

const router = express.Router();

// Route to create the initial package
router.post('/createpackage', createPackage);

// Route to get all packages
router.get('/getpackages', getPackages);

// Route to update Package
router.patch('/:id/package', updatePackageData);
// Route to update travelPrices in the second step
router.patch('/:packageId/travel-prices', updateTravelPrices);

router.get('/getpackage/:packageId', getPackageById);

router.patch('/:id/hotels', updatePackageHotels);

 router.delete('/packagedelete/:id', deletePackage);

export default router;
