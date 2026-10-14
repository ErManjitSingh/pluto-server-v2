import express from 'express';
import {
  saveManagerTarget,
  getManagerTargetByCompany,
} from '../controllers/managertarget.controller.js';

const router = express.Router();

router.post('/save', saveManagerTarget);
router.get('/get-by-company/:companyName', getManagerTargetByCompany);

export default router;
