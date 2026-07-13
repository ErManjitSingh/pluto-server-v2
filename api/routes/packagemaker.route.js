import express from 'express';
import { handleStep, getProperties, getRoomsById, getPropertyById,
     getHotelsByCityName, getBasicPropertyInfo, getAllBasicPropertyInfo,
      deletePackageMaker, deleteAllPackageMakerPhotosAndVideos,
      loginPackageMaker, signupWebsitePackagemaker, signinWebsitePackagemaker,
      getMyWebsitePackagemaker, getMyWebsiteAccount, getAllWebsiteAccounts, getAllHotelStates, getAllHotelCities,
      getHotelsByState, getHotelsByCityPi, getHotelsByPropertyType,
      getHotelsByPropertyTypeAndLocation } from '../controllers/packagemaker.controller.js';
import { verifyToken } from '../utils/verifyUser.js';

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
router.get('/get-packagemaker-hotel-states', getAllHotelStates);
router.get('/get-packagemaker-hotel-cities', getAllHotelCities);
router.get('/get-packagemaker-hotels-by-state/:stateName', getHotelsByState);
router.get('/get-packagemaker-hotels-by-city-pi/:cityName', getHotelsByCityPi);
router.get('/get-packagemaker-hotels-by-property-type/:propertyType', getHotelsByPropertyType);
router.get('/get-packagemaker-hotels-by-filters', getHotelsByPropertyTypeAndLocation);
//get-basic-property-info/:id
router.get('/get-packagemaker-basic-info/:id', getBasicPropertyInfo);
//get-all-basic-property-info
router.get('/get-all-packagemaker-basic-info', getAllBasicPropertyInfo);

// Add new delete route
router.delete('/delete-packagemaker/:id', deletePackageMaker);
router.delete('/delete-packagemaker-photos-videos', deleteAllPackageMakerPhotosAndVideos);

// Legacy admin login (auto password = mobile for non-website hotels)
router.post('/login-packagemaker', loginPackageMaker);

// Website hotel owner auth
router.post('/signup-website-packagemaker', signupWebsitePackagemaker);
router.post('/signin-website-packagemaker', signinWebsitePackagemaker);
router.get('/my-website-packagemaker', verifyToken, getMyWebsitePackagemaker);
router.get('/my-website-account', verifyToken, getMyWebsiteAccount);
router.get('/get-all-website-accounts', getAllWebsiteAccounts);

export default router;

