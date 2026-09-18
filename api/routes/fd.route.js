import express from 'express';
import {
  createFd,
  getFds,
  getFd,
  getFdsByDurationAndLocation,
  updateFd,
  deleteFd,
} from '../controllers/fd.controller.js';

const router = express.Router();

router.post('/create', createFd);
router.get('/get-all', getFds);
router.get('/filter', getFdsByDurationAndLocation);
router.get('/get/:id', getFd);
router.put('/update/:id', updateFd);
router.delete('/delete/:id', deleteFd);

export default router;
