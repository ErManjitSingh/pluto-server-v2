import express from 'express';
import {
  saveManagerTarget,
  getManagerTargetByCompany,
  saveDayDifference,
  getDayDifference,
} from '../controllers/managertarget.controller.js';

const router = express.Router();

router.post('/save', saveManagerTarget);
router.post('/day-difference', saveDayDifference);
router.get('/day-difference/:companyName', getDayDifference);
router.get('/get-by-company/:companyName', getManagerTargetByCompany);

export default router;
