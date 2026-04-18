import express from 'express';
import {
  getStateExpenseLists,
  addStateExpenseItems,
} from '../controllers/stateexpenselists.controller.js';

const router = express.Router();

router.get('/', getStateExpenseLists);
router.post('/', addStateExpenseItems);

export default router;
