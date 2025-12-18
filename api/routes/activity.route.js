import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import { createActivity, getActivities, getActivity } from '../controllers/activity.controller.js';

const router = express.Router();

router.post('/create', verifyToken , createActivity);
router.get('/listings', getActivities);
router.get('/listings/:id', getActivity);

export default router;