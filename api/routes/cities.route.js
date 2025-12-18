import express from 'express';
import { createCity, getCities, editCity, deleteCity, getAllCities, geteveryCities, searchCities } from '../controllers/cities.controller.js';


const router = express.Router();
router.use(express.json()); 

router.post('/createcity/:countryName/:stateName', createCity);
router.get('/getcities/:countryName/:stateName', getCities);
router.get('/getcities/:countryName', getAllCities);
router.get('/getallcities/', geteveryCities);
router.put('/edit/:cityId', editCity);
router.delete('/delete/:cityId', deleteCity);
router.get('/searchcities/', searchCities);


export default router;