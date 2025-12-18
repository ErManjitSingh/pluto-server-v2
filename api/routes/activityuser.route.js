import express from 'express';
import {
  signupActivityUser,
  loginActivityUser,
  createActivityUser,
  getAllActivityUsers,
  getActivityUserById,
  updateActivityUser,
  deleteActivityUser
} from '../controllers/activityuser.controller.js';

const router = express.Router();

router.post('/signup', signupActivityUser);
router.post('/login', loginActivityUser);
router.post('/post', createActivityUser);
router.get('/get', getAllActivityUsers);
router.get('/:id', getActivityUserById);
router.patch('/:id', updateActivityUser);
router.delete('/:id', deleteActivityUser);

export default router;

