import jwt from 'jsonwebtoken';
import InventoryBooking from '../models/inventorybooking.model.js';
import WebsiteGuest from '../models/websiteguest.model.js';
import { errorHandler } from '../utils/error.js';

const STATUS_VALUES = ['pending', 'completed', 'rejected'];

const signGuestToken = (id, mobile) =>
  jwt.sign({ id, mobile, isWebsiteGuest: true }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });

const upsertWebsiteGuest = async (guest) => {
  if (!guest?.mobile || !guest?.password) {
    return null;
  }

  const existingGuest = await WebsiteGuest.findOne({ mobile: guest.mobile }).select(
    '+password'
  );

  if (existingGuest) {
    existingGuest.firstName = guest.firstName ?? existingGuest.firstName;
    existingGuest.lastName = guest.lastName ?? existingGuest.lastName;
    existingGuest.fullName = guest.fullName ?? existingGuest.fullName;
    existingGuest.email = guest.email ?? existingGuest.email;
    existingGuest.country = guest.country ?? existingGuest.country;
    existingGuest.password = guest.password;
    await existingGuest.save();
    return existingGuest;
  }

  return WebsiteGuest.create({
    firstName: guest.firstName,
    lastName: guest.lastName,
    fullName: guest.fullName,
    email: guest.email,
    country: guest.country,
    mobile: guest.mobile,
    password: guest.password,
  });
};

const sanitizeGuestForBooking = (guest = {}) => {
  const guestData = { ...guest };
  delete guestData.password;
  return guestData;
};

export const createInventoryBooking = async (req, res, next) => {
  try {
    const { guest, ...bookingData } = req.body;

    if (guest?.mobile && guest?.password) {
      await upsertWebsiteGuest(guest);
    }

    const booking = await InventoryBooking.create({
      ...bookingData,
      guest: sanitizeGuestForBooking(guest),
      bookingType: bookingData.bookingType || 'inventory',
    });

    res.status(201).json({
      success: true,
      data: booking,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllInventoryBookings = async (req, res, next) => {
  try {
    const bookings = await InventoryBooking.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      data: bookings,
    });
  } catch (error) {
    next(error);
  }
};

export const getInventoryBookingById = async (req, res, next) => {
  try {
    const booking = await InventoryBooking.findById(req.params.id);
    if (!booking) {
      return next(errorHandler(404, 'Inventory booking not found'));
    }

    res.status(200).json({
      success: true,
      data: booking,
    });
  } catch (error) {
    next(error);
  }
};

export const getInventoryBookingsByMobile = async (req, res, next) => {
  try {
    const { mobile } = req.params;
    if (!mobile) {
      return next(errorHandler(400, 'Mobile number is required'));
    }

    const bookings = await InventoryBooking.find({ 'guest.mobile': mobile }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      data: bookings,
    });
  } catch (error) {
    next(error);
  }
};

export const updateInventoryBooking = async (req, res, next) => {
  try {
    const { guest, tourCompleted, payment, ...updateData } = req.body;

    if (tourCompleted && !STATUS_VALUES.includes(tourCompleted)) {
      return next(
        errorHandler(400, 'tourCompleted must be pending, completed, or rejected')
      );
    }

    if (payment && !STATUS_VALUES.includes(payment)) {
      return next(errorHandler(400, 'payment must be pending, completed, or rejected'));
    }

    if (guest?.mobile && guest?.password) {
      await upsertWebsiteGuest(guest);
    }

    const payload = {
      ...updateData,
      ...(tourCompleted && { tourCompleted }),
      ...(payment && { payment }),
      ...(guest && { guest: sanitizeGuestForBooking(guest) }),
    };

    const booking = await InventoryBooking.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    if (!booking) {
      return next(errorHandler(404, 'Inventory booking not found'));
    }

    res.status(200).json({
      success: true,
      data: booking,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteInventoryBooking = async (req, res, next) => {
  try {
    const booking = await InventoryBooking.findByIdAndDelete(req.params.id);
    if (!booking) {
      return next(errorHandler(404, 'Inventory booking not found'));
    }

    res.status(200).json({
      success: true,
      message: 'Inventory booking deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const guestLogin = async (req, res, next) => {
  try {
    const { mobile, password } = req.body;

    if (!mobile || !password) {
      return next(errorHandler(400, 'Mobile and password are required'));
    }

    const guest = await WebsiteGuest.findOne({ mobile }).select('+password');
    if (!guest || !(await guest.comparePassword(password))) {
      return next(errorHandler(401, 'Invalid mobile number or password'));
    }

    const token = signGuestToken(guest._id, guest.mobile);
    const guestData = guest.toObject();
    delete guestData.password;

    res
      .cookie('access_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      })
      .status(200)
      .json({
        success: true,
        token,
        data: guestData,
      });
  } catch (error) {
    next(error);
  }
};
