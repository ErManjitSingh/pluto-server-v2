import express from 'express';
import { overview } from '../controllers/ai.controller.js';
import { verifyToken } from '../utils/verifyUser.js';

const router = express.Router();

router.post('/overview', verifyToken, overview);

export default router;
