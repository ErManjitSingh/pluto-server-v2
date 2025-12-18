import express from 'express';
import { signup, login, updateCabUser, getAllCabUsers } from '../controllers/cabuser.controller.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.put('/update/:id', updateCabUser);
router.get('/', getAllCabUsers);

export default router;
