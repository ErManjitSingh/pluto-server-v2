import express from 'express';
import {
  getAllHotelBookings,
  createHotelBooking,
  getHotelBookingById,
  getHotelBookingsByPropertyName,
  updateBookingResponse,
  updateHotelBooking,
  deleteHotelBooking,
} from '../controllers/hotelbooking.controller.js';

const router = express.Router();

router.get('/get', getAllHotelBookings);
router.get('/getbypropertyname', getHotelBookingsByPropertyName);
router.post('/create', createHotelBooking);
router.get('/:id', getHotelBookingById);
router.put('/update/:id', updateHotelBooking);
router.patch('/:id/bookingresponse', updateBookingResponse);
router.delete('/delete/:id', deleteHotelBooking);

export default router;
