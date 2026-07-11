import express from 'express';
import {
  firebaseGuestLogin,
  googleGuestLogin,
  sendGuestOtp,
  verifyGuestOtp,
  sendGuestEmailOtp,
  verifyGuestEmailOtp,
  guestSignup,
  guestLogin,
  linkGuestMobile,
  getGuestProfile,
} from '../controllers/guestauth.controller.js';
import { nextAuthGoogleGuestLogin } from '../controllers/nextauthguest.controller.js';
import { verifyGuestToken } from '../middleware/verifyGuest.js';

const router = express.Router();

router.post('/firebase', firebaseGuestLogin);
router.post('/google', googleGuestLogin);
router.post('/nextauth-google', nextAuthGoogleGuestLogin);
router.post('/signup', guestSignup);
router.post('/login', guestLogin);
router.post('/send-otp', sendGuestOtp);
router.post('/verify-otp', verifyGuestOtp);
router.post('/send-email-otp', sendGuestEmailOtp);
router.post('/verify-email-otp', verifyGuestEmailOtp);
router.post('/link-mobile', verifyGuestToken, linkGuestMobile);
router.get('/me', verifyGuestToken, getGuestProfile);

export default router;
