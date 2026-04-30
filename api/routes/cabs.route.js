import express from 'express';
import { createCab, deleteCab, deleteAllCabImages, editCab, getAllCabs, getCabsByTypes, getCabsMinimal } from '../controllers/cabs.controller.js';


const router = express.Router();
router.use(express.json()); 

router.post('/createcab', createCab);
router.get('/getcabsbytypes/:cabType', getCabsByTypes);
router.get('/getallcabs', getAllCabs);
router.get('/getcabsminimal', getCabsMinimal);
router.put('/editcab/:cabId', editCab);
router.delete('/deletecab/:cabId', deleteCab);
router.delete('/deletecabimages', deleteAllCabImages);

export default router;
