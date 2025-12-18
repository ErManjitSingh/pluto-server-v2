import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import { createDestination, getDestinations } from '../controllers/destination.controller.js';

const router = express.Router();

router.post('/create', verifyToken , createDestination);
router.get('/listings', getDestinations);

export default router;