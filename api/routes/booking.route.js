import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { 
    createBooking,
    getPropertyBookings,
    getUserBookings,
    getBooking,
    updateBookingStatus,
    updatePaymentStatus,
    cancelBooking,
    getCompletedBookings,
    getUncompletedBookings
} from '../controllers/Booking.controller.js';

const router = express.Router();

// Protected routes - require authentication
router.get('/user', verifyToken, getUserBookings);
router.post('/createbooking', verifyToken, createBooking);
router.patch('/:id/status', verifyToken, updateBookingStatus);
router.patch('/:id/payment', verifyToken, updatePaymentStatus);
router.delete('/:id', verifyToken, cancelBooking);

// Public routes
router.get('/property-bookings/:propertyId', getPropertyBookings);
router.get('/property-booking/:id', getBooking);

// Add these new routes
router.get('/completed', getCompletedBookings);
router.get('/uncompleted', getUncompletedBookings);

export default router;
