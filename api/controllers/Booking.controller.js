import Booking from "../models/Booking.model.js";

// Create new booking
export const createBooking = async (req, res) => {
    try {
        const { 
            propertyId, 
            checkInDate, 
            checkOutDate, 
            numberOfNights,
            totalAmount,
            rooms,
            guestDetails,
            userId
        } = req.body;

        // Basic validation
        if (!propertyId || !checkInDate || !checkOutDate || !rooms || !guestDetails) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Create booking with user ID from auth middleware
        const booking = new Booking({
            ...req.body,
            status: 'pending',
            paymentStatus: 'pending'
        });

        await booking.save();
        const populatedBooking = await booking.populate('propertyId');

        res.status(201).json({
            success: true,
            message: 'Booking created successfully',
            data: populatedBooking
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error creating booking',
            error: error.message
        });
    }
};

// Get all bookings for a property
export const getPropertyBookings = async (req, res) => {
    try {
        const { propertyId } = req.params;
        const bookings = await Booking.find({ propertyId })
            .populate('propertyId')
            .populate('userId', 'name email')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: bookings.length,
            data: bookings
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching property bookings',
            error: error.message
        });
    }
};

// Get user's bookings
export const getUserBookings = async (req, res) => {
    try {
        const userId = req.user.id;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID not found'
            });
        }

        const bookings = await Booking.find({ userId })
            .populate('propertyId')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: bookings.length,
            data: bookings
        });
    } catch (error) {
        console.error('Error in getUserBookings:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user bookings',
            error: error.message
        });
    }
};

// Get single booking by ID
export const getBooking = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id)
            .populate('propertyId')
            .populate('userId', 'name email');

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        res.status(200).json({
            success: true,
            data: booking
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching booking',
            error: error.message
        });
    }
};

// Update booking status
export const updateBookingStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];

        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Status must be one of: ${validStatuses.join(', ')}`
            });
        }

        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        booking.status = status;
        await booking.save();

        res.status(200).json({
            success: true,
            message: `Booking status updated to ${status}`,
            data: booking
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating booking status',
            error: error.message
        });
    }
};

// Cancel booking
export const cancelBooking = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        if (booking.status === 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Cannot cancel a completed booking'
            });
        }

        booking.status = 'cancelled';
        await booking.save();

        res.status(200).json({
            success: true,
            message: 'Booking cancelled successfully',
            data: booking
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error cancelling booking',
            error: error.message
        });
    }
};

// Update payment status
export const updatePaymentStatus = async (req, res) => {
    try {
        const { paymentStatus } = req.body;
        const validPaymentStatuses = ['pending', 'paid', 'failed', 'refunded'];

        if (!paymentStatus || !validPaymentStatuses.includes(paymentStatus)) {
            return res.status(400).json({
                success: false,
                message: `Invalid payment status. Status must be one of: ${validPaymentStatuses.join(', ')}`
            });
        }

        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        booking.paymentStatus = paymentStatus;
        await booking.save();

        res.status(200).json({
            success: true,
            message: `Payment status updated to ${paymentStatus}`,
            data: booking
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating payment status',
            error: error.message
        });
    }
};

export const getCompletedBookings = async (req, res) => {
    try {
        const completedBookings = await Booking.find({
            'paymentStatus': 'paid'  // assuming your payment status field is structured this way
        });
        
        res.status(200).json({
            success: true,
            data: completedBookings
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching completed bookings',
            error: error.message
        });
    }
};

export const getUncompletedBookings = async (req, res) => {
    try {
        const uncompletedBookings = await Booking.find({
            'paymentStatus': 'pending'  // finds all bookings where payment status is not completed
        });
        
        res.status(200).json({
            success: true,
            data: uncompletedBookings
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching uncompleted bookings',
            error: error.message
        });
    }
};
