import express from 'express';
import { createListing, getListings } from '../controllers/listing.controller.js';
import { verifyToken } from '../utils/verifyUser.js';

const router = express.Router();

router.post('/create', verifyToken ,createListing);
router.get('/listing', verifyToken, getListings);

export default router;