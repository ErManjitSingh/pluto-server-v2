import express from 'express';
import { addPlace, getPlaces, editPlace, deletePlace, getAllPlaces, searchPlaces, fetchAllPlaces, getGoogleReviews } from '../controllers/places.controller.js';


const router = express.Router();
router.use(express.json()); 

router.post('/addplace/:country/:state/:city/', addPlace);
router.get('/getplaces/:country/:state/:city', getPlaces);
router.get('/getallplaces/:country/:city', getAllPlaces);
router.put('/edit/:country/:state/:city/:placeId', editPlace);
router.delete('/delete/:placeId', deletePlace);
router.get('/searchplaces', searchPlaces);
router.get('/fetchallplaces', fetchAllPlaces);
router.get('/google-reviews/:placeId', getGoogleReviews);


export default router;
