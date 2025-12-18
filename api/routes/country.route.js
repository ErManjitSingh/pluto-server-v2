import express from 'express';
import {  getAllCountries, addCountry, editCountry, deleteCountry } from '../controllers/country.controller.js';


const router = express.Router();
router.use(express.json()); 


router.post('/addcountry/', addCountry);
router.get('/getcountries', getAllCountries);
router.put('/editcountry/:countryId', editCountry);
router.delete('/deletecountry/:countryId', deleteCountry);


export default router;