import express from 'express';
import {
  getAllHotelBookings,
  createHotelBooking,
  getHotelBookingById,
  updateHotelBooking,
  deleteHotelBooking,
} from '../controllers/hotelbooking.controller.js';

const router = express.Router();

router.get('/get', getAllHotelBookings);
router.post('/create', createHotelBooking);
router.get('/:id', getHotelBookingById);
router.put('/update/:id', updateHotelBooking);
router.delete('/delete/:id', deleteHotelBooking);

export default router;
