import CabBooking from '../models/cabbookingdata.model.js';

// Create new booking
export const createBooking = async (req, res) => {
  try {
    const newBooking = new CabBooking(req.body);
    const savedBooking = await newBooking.save();
    res.status(201).json(savedBooking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all bookings
export const getBookings = async (req, res) => {
  try {
    const bookings = await CabBooking.find();
    res.status(200).json(bookings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get booking by ID
export const getBookingById = async (req, res) => {
  try {
    const booking = await CabBooking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    res.status(200).json(booking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update booking
export const updateBooking = async (req, res) => {
  try {
    // If status is being updated, validate it
    if (req.body.bookingStatus && !['pending', 'accepted', 'rejected'].includes(req.body.bookingStatus)) {
      return res.status(400).json({ message: 'Invalid status. Must be pending, accepted or rejected' });
    }

    // If response details are included, add timestamp
    if (req.body.responseDetails) {
      req.body.responseDetails.respondedAt = new Date();
    }

    const updatedBooking = await CabBooking.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!updatedBooking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    res.status(200).json(updatedBooking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete booking
export const deleteBooking = async (req, res) => {
  try {
    const deletedBooking = await CabBooking.findByIdAndDelete(req.params.id);
    if (!deletedBooking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    res.status(200).json({ message: 'Booking deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Handle booking response (accept/reject)
export const handleBookingResponse = async (req, res) => {
  try {
    const { status, amount, reason, executiveDetails, signinDetails } = req.body;
    
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Must be either accepted or rejected' });
    }

    const booking = await CabBooking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Create new response detail
    const newResponseDetail = {
      status,
      amount: amount || undefined,
      reason: reason || undefined,
      respondedAt: new Date(),
      executiveDetails,
      signinDetails
    };

    // Push the new response detail to the array
    const updatedBooking = await CabBooking.findByIdAndUpdate(
      req.params.id,
      {
        bookingStatus: status,
        $push: { responseDetails: newResponseDetail }
      },
      { new: true, runValidators: true }
    );

    res.status(200).json(updatedBooking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete all bookings
export const deleteAllBookings = async (req, res) => {
  try {
    const result = await CabBooking.deleteMany({});
    res.status(200).json({ 
      message: `Successfully deleted ${result.deletedCount} booking(s)`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update specific response detail
export const updateResponseDetail = async (req, res) => {
  try {
    const { bookingId, responseId } = req.params;
    const updateData = req.body;

    // Validate status if being updated
    if (updateData.status && !['accepted', 'rejected'].includes(updateData.status)) {
      return res.status(400).json({ message: 'Invalid status. Must be either accepted or rejected' });
    }

    // Add updated timestamp
    updateData.updatedAt = new Date();

    // Update the specific response detail in the array
    const updatedBooking = await CabBooking.findOneAndUpdate(
      { 
        _id: bookingId, 
        'responseDetails._id': responseId 
      },
      { 
        $set: {
          'responseDetails.$.status': updateData.status,
          'responseDetails.$.amount': updateData.amount,
          'responseDetails.$.reason': updateData.reason,
          'responseDetails.$.executiveDetails': updateData.executiveDetails,
          'responseDetails.$.negotiateAmount': updateData.negotiateAmount,
          'responseDetails.$.signinDetails': updateData.signinDetails,
          'responseDetails.$.updatedAt': updateData.updatedAt
        }
      },
      { new: true, runValidators: true }
    );

    if (!updatedBooking) {
      return res.status(404).json({ message: 'Booking or response detail not found' });
    }

    // Find the updated response detail to return
    const updatedResponseDetail = updatedBooking.responseDetails.find(
      detail => detail._id.toString() === responseId
    );

    res.status(200).json({
      message: 'Response detail updated successfully',
      booking: updatedBooking,
      updatedResponseDetail
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
