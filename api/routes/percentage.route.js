import express from 'express';
import {
  createPercentage,
  getAllPercentages,
  getPercentageById,
  updatePercentage,
  deletePercentage,
} from '../controllers/percentage.controller.js';

const router = express.Router();
router.use(express.json());

router.post('/create', createPercentage);
router.get('/get-all', getAllPercentages);
router.get('/get-by-id/:id', getPercentageById);
router.put('/update/:id', updatePercentage);
router.patch('/update/:id', updatePercentage);
router.delete('/delete/:id', deletePercentage);

export default router;
