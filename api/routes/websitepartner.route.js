import express from 'express';
import {
  signupWebsitePartner,
  signinWebsitePartner,
  getHotelByLogin,
  getAllWebsitePartners,
} from '../controllers/websitepartner.controller.js';

const router = express.Router();
router.use(express.json());

router.post('/signup', signupWebsitePartner);
router.post('/signin', signinWebsitePartner);
router.get('/get-hotel-by-login', getHotelByLogin);
router.get('/get-all', getAllWebsitePartners);

export default router;
