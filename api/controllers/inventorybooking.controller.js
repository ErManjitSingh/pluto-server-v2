import InventoryBooking from '../models/inventorybooking.model.js';
import WebsiteGuest from '../models/websiteguest.model.js';
import { errorHandler } from '../utils/error.js';
import { normalizeMobile, normalizeEmail } from '../utils/guestAuth.js';

const STATUS_VALUES = ['pending', 'completed', 'rejected', 'partially_paid'];

const getBookingTotalAmount = (pricing = {}) =>
  Number(
    pricing.total ?? pricing.grandTotal ?? pricing.totalAmount ?? pricing.finalAmount ?? 0
  );


const resolveUserIdForBooking = async (req, guest = {}) => {
  if (req.guestUser?.id) {
    return req.guestUser.id;
  }

  const normalizedMobile = normalizeMobile(guest.mobile);
  if (normalizedMobile) {
    const guestByMobile = await WebsiteGuest.findOne({ mobile: normalizedMobile });
    if (guestByMobile) {
      return guestByMobile._id;
    }
  }

  const normalizedEmail = normalizeEmail(guest.email);
  if (normalizedEmail) {
    const guestByEmail = await WebsiteGuest.findOne({ email: normalizedEmail });
    if (guestByEmail) {
      return guestByEmail._id;
    }
  }

  return null;
};

export const applyInventoryBookingPayment = async ({
  bookingId,
  paidAmount,
  orderId,
  paymentId,
}) => {
  const booking = await InventoryBooking.findById(bookingId);
  if (!booking) {
    const err = new Error('Inventory booking not found');
    err.statusCode = 404;
    throw err;
  }

  const amount = Number(paidAmount);
  if (!amount || Number.isNaN(amount) || amount <= 0) {
    const err = new Error('Invalid payment amount');
    err.statusCode = 400;
    throw err;
  }

  if (orderId && booking.paymentHistory?.some((entry) => entry.orderId === orderId)) {
    return booking;
  }

  const newAmountPaid = (booking.amountPaid || 0) + amount;
  const totalDue = getBookingTotalAmount(booking.pricing);

  let paymentStatus = 'partially_paid';
  if (newAmountPaid <= 0) {
    paymentStatus = 'pending';
  } else if (totalDue > 0 && newAmountPaid >= totalDue) {
    paymentStatus = 'completed';
  }

  booking.amountPaid = newAmountPaid;
  booking.payment = paymentStatus;
  booking.paymentHistory.push({
    orderId: orderId || '',
    paymentId: paymentId || '',
    amount,
    paidAt: new Date(),
  });

  await booking.save();
  return booking;
};
 
const sanitizeGuestForBooking = (guest = {}) => {
  const guestData = { ...guest };
  if (guestData.mobile !== undefined) {
    guestData.mobile = normalizeMobile(guestData.mobile);
  }
  if (guestData.email !== undefined) {
    guestData.email = normalizeEmail(guestData.email);
  }
  delete guestData.password;
  return guestData;
};

export const createInventoryBooking = async (req, res, next) => {
  try {
    const { guest, ...bookingData } = req.body;
    if (guest?.mobile && !normalizeMobile(guest.mobile)) {
      return next(errorHandler(400, 'Mobile number must contain at least 10 digits'));
    }

    const userId = await resolveUserIdForBooking(req, guest);

    const booking = await InventoryBooking.create({
      ...bookingData,
      userId,
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

    const normalizedMobile = normalizeMobile(mobile);
    if (!normalizedMobile) {
      return next(errorHandler(400, 'Mobile number must contain at least 10 digits'));
    }

    const bookings = await InventoryBooking.find({ 'guest.mobile': normalizedMobile }).sort({
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

export const getInventoryBookingsByEmail = async (req, res, next) => {
  try {
    const { email } = req.params;
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return next(errorHandler(400, 'Email is required'));
    }

    const bookings = await InventoryBooking.find({ 'guest.email': normalizedEmail }).sort({
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

export const getMyInventoryBookings = async (req, res, next) => {
  try {
    const bookings = await InventoryBooking.find({ userId: req.guestUser.id }).sort({
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

const buildInventoryBookingUpdatePayload = (body = {}) => {
  const { guest, tourCompleted, payment, amountPaid, ...updateData } = body;

  return {
    updateData,
    guest,
    tourCompleted,
    payment,
    amountPaid,
    payload: {
      ...updateData,
      ...(tourCompleted && { tourCompleted }),
      ...(payment && { payment }),
      ...(amountPaid !== undefined && { amountPaid: Number(amountPaid) }),
      ...(guest && { guest: sanitizeGuestForBooking(guest) }),
    },
  };
};

const validateInventoryBookingStatusFields = (tourCompleted, payment, next) => {
  if (tourCompleted && !STATUS_VALUES.includes(tourCompleted)) {
    return next(
      errorHandler(
        400,
        'tourCompleted must be pending, completed, rejected, or partially_paid'
      )
    );
  }

  if (payment && !STATUS_VALUES.includes(payment)) {
    return next(
      errorHandler(400, 'payment must be pending, completed, rejected, or partially_paid')
    );
  }

  return true;
};

export const updateInventoryBooking = async (req, res, next) => {
  try {
    const { guest, tourCompleted, payment, amountPaid, payload } =
      buildInventoryBookingUpdatePayload(req.body);

    if (validateInventoryBookingStatusFields(tourCompleted, payment, next) !== true) {
      return;
    }

    if (guest?.mobile && !normalizeMobile(guest.mobile)) {
      return next(errorHandler(400, 'Mobile number must contain at least 10 digits'));
    }

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

export const updateInventoryBookingByWebsiteId = async (req, res, next) => {
  try {
    const { websiteid } = req.params;
    if (!websiteid) {
      return next(errorHandler(400, 'websiteid parameter is required'));
    }

    const { guest, tourCompleted, payment, amountPaid, payload } =
      buildInventoryBookingUpdatePayload(req.body);

    if (validateInventoryBookingStatusFields(tourCompleted, payment, next) !== true) {
      return;
    }

    if (guest?.mobile && !normalizeMobile(guest.mobile)) {
      return next(errorHandler(400, 'Mobile number must contain at least 10 digits'));
    }

    const booking = await InventoryBooking.findOneAndUpdate({ websiteid }, payload, {
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

export const deleteAllInventoryBookings = async (req, res, next) => {
  try {
    const result = await InventoryBooking.deleteMany({});
    res.status(200).json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} inventory booking(s)`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    next(error);
  }
};
