import HotelBooking from '../models/hotelbooking.model.js';

// Get all hotel bookings
export const getAllHotelBookings = async (req, res, next) => {
  try {
    const hotelBookings = await HotelBooking.find();
    res.status(200).json(hotelBookings);
  } catch (error) {
    next(error);
  }
};

// Get hotel bookings with only bookingId, cityName, hotels, bookingresponse
export const getHotelBookingsSummary = async (req, res, next) => {
  try {
    const hotelBookings = await HotelBooking.find().select(
      'bookingId cityName hotels bookingresponse'
    );
    res.status(200).json(hotelBookings);
  } catch (error) {
    next(error);
  }
};

// Get one hotel booking by bookingId with only bookingId, cityName, hotels, bookingresponse
export const getHotelBookingSummaryByBookingId = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const hotelBooking = await HotelBooking.findOne({ bookingId }).select(
      'bookingId cityName hotels bookingresponse'
    );
    if (!hotelBooking) {
      return res.status(404).json({ message: 'Hotel booking not found' });
    }
    res.status(200).json(hotelBooking);
  } catch (error) {
    next(error);
  }
};

// Create new hotel booking
export const createHotelBooking = async (req, res, next) => {
  try {
    const hotelBooking = await HotelBooking.create(req.body);
    res.status(201).json(hotelBooking);
  } catch (error) {
    next(error);
  }
};

// Get hotel booking by id
export const getHotelBookingById = async (req, res, next) => {
  try {
    const hotelBooking = await HotelBooking.findById(req.params.id);
    if (!hotelBooking) {
      return res.status(404).json({ message: 'Hotel booking not found' });
    }
    res.status(200).json(hotelBooking);
  } catch (error) {
    next(error);
  }
};

// Get hotel bookings by property name (root propertyName or hotels[0].propertyName)
export const getHotelBookingsByPropertyName = async (req, res, next) => {
  try {
    const { propertyName } = req.query;
    if (!propertyName) {
      return res.status(400).json({ message: 'propertyName query parameter is required' });
    }
    const hotelBookings = await HotelBooking.find({
      $or: [
        { propertyName },
        { 'hotels.0.propertyName': propertyName },
      ],
    });
    res.status(200).json(hotelBookings);
  } catch (error) {
    next(error);
  }
};

// Update only bookingresponse by id
export const updateBookingResponse = async (req, res, next) => {
  try {
    const hotelBooking = await HotelBooking.findByIdAndUpdate(
      req.params.id,
      { $set: { bookingresponse: req.body.bookingresponse } },
      { new: true }
    );
    if (!hotelBooking) {
      return res.status(404).json({ message: 'Hotel booking not found' });
    }
    res.status(200).json(hotelBooking);
  } catch (error) {
    next(error);
  }
};

// Update hotel booking
export const updateHotelBooking = async (req, res, next) => {
  try {
    const hotelBooking = await HotelBooking.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!hotelBooking) {
      return res.status(404).json({ message: 'Hotel booking not found' });
    }
    res.status(200).json(hotelBooking);
  } catch (error) {
    next(error);
  }
};

// Delete hotel booking
export const deleteHotelBooking = async (req, res, next) => {
  try {
    const hotelBooking = await HotelBooking.findByIdAndDelete(req.params.id);
    if (!hotelBooking) {
      return res.status(404).json({ message: 'Hotel booking not found' });
    }
    res.status(200).json({ message: 'Hotel booking deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Delete all hotel bookings
export const deleteAllHotelBookings = async (req, res, next) => {
  try {
    const result = await HotelBooking.deleteMany({});
    res.status(200).json({
      message: `Successfully deleted ${result.deletedCount} hotel booking(s)`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    next(error);
  }
};
