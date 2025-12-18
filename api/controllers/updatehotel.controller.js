import UpdateHotel from '../models/updatehotel.model.js';

// Create new hotel update
export const createHotelUpdate = async (req, res, next) => {
  try {
    const hotelUpdate = await UpdateHotel.create(req.body);
    res.status(201).json(hotelUpdate);
  } catch (error) {
    next(error);
  }
};

// Get all hotel updates
export const getAllHotelUpdates = async (req, res, next) => {
  try {
    const hotelUpdates = await UpdateHotel.find();
    res.status(200).json(hotelUpdates);
  } catch (error) {
    next(error);
  }
};

// Get single hotel update
export const getHotelUpdate = async (req, res, next) => {
  try {
    const hotelUpdate = await UpdateHotel.findById(req.params.id);
    if (!hotelUpdate) {
      return res.status(404).json({ message: 'Hotel update not found' });
    }
    res.status(200).json(hotelUpdate);
  } catch (error) {
    next(error);
  }
};

// Update hotel update
export const updateHotelUpdate = async (req, res, next) => {
  try {
    const hotelUpdate = await UpdateHotel.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!hotelUpdate) {
      return res.status(404).json({ message: 'Hotel update not found' });
    }
    res.status(200).json(hotelUpdate);
  } catch (error) {
    next(error);
  }
};

// Delete hotel update
export const deleteHotelUpdate = async (req, res, next) => {
  try {
    const hotelUpdate = await UpdateHotel.findByIdAndDelete(req.params.id);
    if (!hotelUpdate) {
      return res.status(404).json({ message: 'Hotel update not found' });
    }
    res.status(200).json({ message: 'Hotel update deleted successfully' });
  } catch (error) {
    next(error);
  }
};
