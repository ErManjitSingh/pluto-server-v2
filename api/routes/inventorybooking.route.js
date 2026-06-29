import express from 'express';
import {
  createInventoryBooking,
  getAllInventoryBookings,
  getInventoryBookingById,
  getInventoryBookingsByMobile,
  updateInventoryBooking,
  updateInventoryBookingByWebsiteId,
  deleteInventoryBooking,
  deleteAllInventoryBookings,
  guestLogin,
} from '../controllers/inventorybooking.controller.js';

const router = express.Router();

router.post('/create', createInventoryBooking);
router.post('/guest-login', guestLogin);
router.get('/get', getAllInventoryBookings);
router.get('/get-by-mobile/:mobile', getInventoryBookingsByMobile);
router.get('/get/:id', getInventoryBookingById);
router.put('/update/:id', updateInventoryBooking);
router.put('/update-by-websiteid/:websiteid', updateInventoryBookingByWebsiteId);
router.delete('/delete/:id', deleteInventoryBooking);
router.delete('/delete-all', deleteAllInventoryBookings);

export default router;
