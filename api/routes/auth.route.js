import express from 'express';
import { 
    google, 
    signin, 
    signoutUser, 
    signup, 
    checkAvailability,
    getAllUsers,
    getUser,
    deleteUser
} from '../controllers/auth.controller.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/signin', signin);
router.post('/google', google);
router.get('/signout', signoutUser);
router.get('/check-availability', checkAvailability);
router.get('/users', getAllUsers);
router.get('/user/:id', getUser);
router.delete('/delete/:id', deleteUser);

export default router;
