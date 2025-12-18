import express from 'express';
import { signup, login, deleteUser, getAllUsers } from '../controllers/cablogin.controller.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.delete('/delete/:id', deleteUser);
router.get('/', getAllUsers);

export default router;
