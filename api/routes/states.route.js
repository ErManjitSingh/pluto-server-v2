import express from 'express';
import { createStates, getStates, editState, deleteState } from '../controllers/states.controller.js';


const router = express.Router();
router.use(express.json()); 

router.post('/createstate/:countryName', createStates);
router.get('/getstates/:countryName', getStates);
router.put('/edit/:stateId', editState);
router.delete('/delete/:stateId', deleteState);


export default router;