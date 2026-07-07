import WebsiteGuest from '../models/websiteguest.model.js';
import { verifyFirebaseIdToken } from '../config/firebase.js';
import { createAndSendOtp, verifyOtpCode } from '../services/otp.service.js';
import { errorHandler } from '../utils/error.js';
import {
  normalizeEmail,
  normalizeMobile,
  sendGuestAuthResponse,
  formatGuestResponse,
} from '../utils/guestAuth.js';

const splitName = (name = '') => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: '', lastName: '', fullName: '' };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
    fullName: parts.join(' '),
  };
};

const findGuestByGoogleIdentity = async ({ firebaseUid, email }) => {
  const orConditions = [{ firebaseUid }, { googleId: firebaseUid }];

  if (email) {
    orConditions.push({ email });
  }

  return WebsiteGuest.findOne({ $or: orConditions });
};

const upsertGuestFromGoogle = async (firebaseUser) => {
  const firebaseUid = firebaseUser.uid;
  const email = normalizeEmail(firebaseUser.email);
  const names = splitName(firebaseUser.name);

  let guest = await findGuestByGoogleIdentity({ firebaseUid, email });

  if (!guest) {
    guest = await WebsiteGuest.create({
      ...names,
      email,
      photoURL: firebaseUser.picture || '',
      googleId: firebaseUid,
      firebaseUid,
      emailVerified: Boolean(firebaseUser.email_verified),
    });
    return guest;
  }

  guest.firstName = names.firstName || guest.firstName;
  guest.lastName = names.lastName || guest.lastName;
  guest.fullName = names.fullName || guest.fullName;
  guest.email = email || guest.email;
  guest.photoURL = firebaseUser.picture || guest.photoURL;
  guest.googleId = firebaseUid;
  guest.firebaseUid = firebaseUid;
  guest.emailVerified = Boolean(firebaseUser.email_verified || guest.emailVerified);
  await guest.save();

  return guest;
};

const upsertGuestFromMobile = async (mobile) => {
  let guest = await WebsiteGuest.findOne({ mobile });

  if (!guest) {
    guest = await WebsiteGuest.create({
      mobile,
      mobileVerified: true,
      fullName: 'Guest',
    });
    return guest;
  }

  guest.mobileVerified = true;
  await guest.save();
  return guest;
};

export const googleGuestLogin = async (req, res, next) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return next(errorHandler(400, 'Firebase idToken is required'));
    }

    const firebaseUser = await verifyFirebaseIdToken(idToken);
    const guest = await upsertGuestFromGoogle(firebaseUser);

    return sendGuestAuthResponse(res, guest);
  } catch (error) {
    next(error);
  }
};

export const sendGuestOtp = async (req, res, next) => {
  try {
    const { mobile } = req.body;
    const result = await createAndSendOtp(mobile);

    res.status(200).json({
      success: true,
      mobile: result.mobile,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

export const verifyGuestOtp = async (req, res, next) => {
  try {
    const { mobile, otp } = req.body;
    const verifiedMobile = await verifyOtpCode(mobile, otp);
    const guest = await upsertGuestFromMobile(verifiedMobile);

    return sendGuestAuthResponse(res, guest);
  } catch (error) {
    next(error);
  }
};

export const linkGuestMobile = async (req, res, next) => {
  try {
    const { mobile, otp } = req.body;
    const normalizedMobile = normalizeMobile(mobile);

    if (!normalizedMobile) {
      return next(errorHandler(400, 'Please enter a valid 10-digit mobile number'));
    }

    await verifyOtpCode(normalizedMobile, otp);

    const existingMobileUser = await WebsiteGuest.findOne({
      mobile: normalizedMobile,
      _id: { $ne: req.guestUser.id },
    });

    if (existingMobileUser) {
      return next(
        errorHandler(409, 'This mobile number is already linked to another account')
      );
    }

    const guest = await WebsiteGuest.findById(req.guestUser.id);
    if (!guest) {
      return next(errorHandler(404, 'Guest user not found'));
    }

    guest.mobile = normalizedMobile;
    guest.mobileVerified = true;
    await guest.save();

    return sendGuestAuthResponse(res, guest);
  } catch (error) {
    next(error);
  }
};

export const getGuestProfile = async (req, res, next) => {
  try {
    const guest = await WebsiteGuest.findById(req.guestUser.id);
    if (!guest) {
      return next(errorHandler(404, 'Guest user not found'));
    }

    res.status(200).json({
      success: true,
      user: formatGuestResponse(guest),
      data: formatGuestResponse(guest),
    });
  } catch (error) {
    next(error);
  }
};
