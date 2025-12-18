import express from 'express';
import { createMaker, getMakers, getMakerById, updateMaker, deleteMaker } from '../controllers/maker.controller.js';

const router = express.Router();

router.post('/post-maker', createMaker);
router.get('/get-maker', getMakers);
router.get('/:id', getMakerById);
router.put('/update-maker/:id', updateMaker);
router.delete('/delete-maker/:id', deleteMaker);

export default router;
