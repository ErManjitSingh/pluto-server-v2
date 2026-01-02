import express from 'express';
import {
  createBooking,
  getBookings,
  getBookingById,
  updateBooking,
  deleteBooking,
  deleteAllBookings,
  updateResponseDetail,
  getBookingsWithSelectedFields
} from '../controllers/cabbookingdata.controller.js';

const router = express.Router();

router.post('/create', createBooking);
router.get('/get', getBookings);
router.get('/get/:id', getBookingById);
router.get('/get-selected-fields', getBookingsWithSelectedFields);
router.put('/update/:id', updateBooking);
router.delete('/delete/:id', deleteBooking);
router.delete('/delete-all', deleteAllBookings);
router.put('/update/:bookingId/response/:responseId', updateResponseDetail);

export default router;
