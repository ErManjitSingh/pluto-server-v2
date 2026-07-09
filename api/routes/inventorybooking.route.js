import express from 'express';
import {
  createInventoryBooking,
  getAllInventoryBookings,
  getInventoryBookingById,
  getInventoryBookingsByMobile,
  getInventoryBookingsByEmail,
  getMyInventoryBookings,
  updateInventoryBooking,
  updateInventoryBookingByWebsiteId,
  deleteInventoryBooking,
  deleteAllInventoryBookings,
} from '../controllers/inventorybooking.controller.js';
import { optionalGuestToken } from '../middleware/optionalGuest.js';
import { verifyGuestToken } from '../middleware/verifyGuest.js';

const router = express.Router();

router.post('/create', optionalGuestToken, createInventoryBooking);
router.get('/my-bookings', verifyGuestToken, getMyInventoryBookings);
router.get('/get', getAllInventoryBookings);
router.get('/get-by-mobile/:mobile', getInventoryBookingsByMobile);
router.get('/get-by-email/:email', getInventoryBookingsByEmail);
router.get('/get/:id', getInventoryBookingById);
router.put('/update/:id', updateInventoryBooking);
router.put('/update-by-websiteid/:websiteid', updateInventoryBookingByWebsiteId);
router.delete('/delete/:id', deleteInventoryBooking);
router.delete('/delete-all', deleteAllInventoryBookings);

export default router;
