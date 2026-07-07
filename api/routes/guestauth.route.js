import express from 'express';
import {
  firebaseGuestLogin,
  googleGuestLogin,
  sendGuestOtp,
  verifyGuestOtp,
  linkGuestMobile,
  getGuestProfile,
} from '../controllers/guestauth.controller.js';
import { verifyGuestToken } from '../middleware/verifyGuest.js';

const router = express.Router();

router.post('/firebase', firebaseGuestLogin);
router.post('/google', googleGuestLogin);
router.post('/send-otp', sendGuestOtp);
router.post('/verify-otp', verifyGuestOtp);
router.post('/link-mobile', verifyGuestToken, linkGuestMobile);
router.get('/me', verifyGuestToken, getGuestProfile);

export default router;
