import express from 'express';
import {
  approveCrmRequest,
  cancelCrmRequest,
  createCrmRequest,
  getCrmRequest,
  getCrmRequestCounts,
  getCrmRequests,
  getCrmRequestsByUser,
  getCrmRequestTypes,
  rejectCrmRequest,
} from '../controllers/request.controller.js';

const router = express.Router();

router.post('/create', createCrmRequest);
router.get('/get-all', getCrmRequests);
router.get('/counts', getCrmRequestCounts);
router.get('/types', getCrmRequestTypes);
router.get('/get-by-user/:userId', getCrmRequestsByUser);
router.get('/get/:id', getCrmRequest);
router.patch('/approve/:id', approveCrmRequest);
router.patch('/reject/:id', rejectCrmRequest);
router.patch('/cancel/:id', cancelCrmRequest);

export default router;
