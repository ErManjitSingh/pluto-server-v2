import express from 'express';
import {
  getAllHotelBookings,
  getHotelBookingsSummary,
  getHotelBookingSummaryByBookingId,
  createHotelBooking,
  getHotelBookingById,
  getHotelBookingsByPropertyName,
  updateBookingResponse,
  updateHotelBooking,
  deleteHotelBooking,
  deleteAllHotelBookings,
} from '../controllers/hotelbooking.controller.js';

const router = express.Router();

router.get('/get', getAllHotelBookings);
router.get('/getsummary', getHotelBookingsSummary);
router.get('/getsummarybybookingid/:bookingId', getHotelBookingSummaryByBookingId);
router.get('/getbypropertyname', getHotelBookingsByPropertyName);
router.post('/create', createHotelBooking);
router.get('/:id', getHotelBookingById);
router.put('/update/:id', updateHotelBooking);
router.patch('/:id/bookingresponse', updateBookingResponse);
router.delete('/delete/:id', deleteHotelBooking);
router.delete('/delete-all', deleteAllHotelBookings);

export default router;
