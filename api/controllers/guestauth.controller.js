import WebsiteGuest from '../models/websiteguest.model.js';
import { verifyFirebaseIdToken } from '../config/firebase.js';
import { errorHandler } from '../utils/error.js';
import {
  normalizeEmail,
  normalizeMobile,
  sendGuestAuthResponse,
  formatGuestResponse,
} from '../utils/guestAuth.js';
import { createAndSendOtp, verifyOtpCode } from '../services/otp.service.js';
import { createAndSendEmailOtp, verifyEmailOtpCode } from '../services/emailotp.service.js';

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

const getSignInProvider = (firebaseUser = {}) =>
  firebaseUser.firebase?.sign_in_provider || '';

const setGuestNameFields = (guest, fullNameInput = '') => {
  const names = splitName(fullNameInput);
  if (names.fullName) {
    guest.firstName = names.firstName || guest.firstName;
    guest.lastName = names.lastName || guest.lastName;
    guest.fullName = names.fullName;
  }
};

const findGuestByIdentifiers = async ({ email, mobile, firebaseUid }) => {
  const conditions = [];
  if (firebaseUid) {
    conditions.push({ firebaseUid }, { googleId: firebaseUid });
  }
  if (mobile) {
    conditions.push({ mobile });
  }
  if (email) {
    conditions.push({ email });
  }

  if (!conditions.length) {
    return null;
  }

  return WebsiteGuest.findOne({ $or: conditions });
};

const findOrCreateGuestFromIdentity = async ({
  email,
  mobile,
  fullName,
  password,
  markEmailVerified = false,
  markMobileVerified = false,
}) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedMobile = normalizeMobile(mobile);

  let guest = await findGuestByIdentifiers({
    email: normalizedEmail,
    mobile: normalizedMobile,
  });

  if (!guest) {
    guest = new WebsiteGuest({
      email: normalizedEmail || undefined,
      mobile: normalizedMobile || undefined,
      emailVerified: Boolean(markEmailVerified),
      mobileVerified: Boolean(markMobileVerified),
    });
  }

  if (normalizedEmail && !guest.email) {
    guest.email = normalizedEmail;
  }

  if (normalizedMobile && !guest.mobile) {
    guest.mobile = normalizedMobile;
  }

  if (markEmailVerified) {
    guest.emailVerified = true;
  }

  if (markMobileVerified) {
    guest.mobileVerified = true;
  }

  if (fullName) {
    setGuestNameFields(guest, fullName);
  }

  if (password) {
    guest.password = password;
  }

  await guest.save();
  return guest;
};

const buildGuestLookupQuery = ({ firebaseUid, email, mobile }) => {
  const orConditions = [{ firebaseUid }, { googleId: firebaseUid }];

  if (mobile) {
    orConditions.push({ mobile });
  }

  if (email) {
    orConditions.push({ email });
  }

  return { $or: orConditions };
};

const upsertGuestFromFirebase = async (firebaseUser) => {
  const firebaseUid = firebaseUser.uid;
  const email = normalizeEmail(firebaseUser.email);
  const mobile = normalizeMobile(firebaseUser.phone_number);
  const names = splitName(firebaseUser.name);
  const signInProvider = getSignInProvider(firebaseUser);
  const isGoogleSignIn = signInProvider === 'google.com';
  const isPhoneSignIn = signInProvider === 'phone';

  if (!email && !mobile) {
    const err = new Error('Firebase token must include email or phone_number');
    err.statusCode = 400;
    throw err;
  }

  let guest = await WebsiteGuest.findOne(
    buildGuestLookupQuery({ firebaseUid, email, mobile })
  );

  if (!guest) {
    guest = await WebsiteGuest.create({
      firstName: names.firstName || undefined,
      lastName: names.lastName || undefined,
      fullName: names.fullName || (mobile ? 'Guest' : ''),
      email: email || undefined,
      mobile: mobile || undefined,
      photoURL: firebaseUser.picture || '',
      googleId: isGoogleSignIn ? firebaseUid : undefined,
      firebaseUid,
      emailVerified: Boolean(firebaseUser.email_verified),
      mobileVerified: Boolean(mobile && isPhoneSignIn),
    });
    return guest;
  }

  guest.firebaseUid = firebaseUid;

  if (email) {
    guest.email = email;
    guest.emailVerified = Boolean(firebaseUser.email_verified || guest.emailVerified);
  }

  if (mobile) {
    guest.mobile = mobile;
    if (isPhoneSignIn) {
      guest.mobileVerified = true;
    }
  }

  if (firebaseUser.picture) {
    guest.photoURL = firebaseUser.picture;
  }

  if (names.fullName) {
    guest.firstName = names.firstName || guest.firstName;
    guest.lastName = names.lastName || guest.lastName;
    guest.fullName = names.fullName;
  } else if (!guest.fullName && mobile) {
    guest.fullName = guest.fullName || 'Guest';
  }

  if (isGoogleSignIn) {
    guest.googleId = firebaseUid;
  }

  await guest.save();
  return guest;
};

export const firebaseGuestLogin = async (req, res, next) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return next(errorHandler(400, 'Firebase idToken is required'));
    }

    const firebaseUser = await verifyFirebaseIdToken(idToken);
    const guest = await upsertGuestFromFirebase(firebaseUser);

    return sendGuestAuthResponse(res, guest);
  } catch (error) {
    next(error);
  }
};

export const googleGuestLogin = firebaseGuestLogin;

export const sendGuestOtp = async (req, res, next) => {
  try {
    const { mobile } = req.body;
    const response = await createAndSendOtp(mobile);
    return res.status(200).json({
      success: true,
      ...response,
    });
  } catch (error) {
    next(error);
  }
};

export const verifyGuestOtp = async (req, res, next) => {
  try {
    const { mobile, otp, fullName, email } = req.body;
    const verifiedMobile = await verifyOtpCode(mobile, otp);
    const guest = await findOrCreateGuestFromIdentity({
      mobile: verifiedMobile,
      email,
      fullName,
      markMobileVerified: true,
    });

    return sendGuestAuthResponse(res, guest);
  } catch (error) {
    next(error);
  }
};

export const sendGuestEmailOtp = async (req, res, next) => {
  try {
    const { email } = req.body;
    const response = await createAndSendEmailOtp(email);
    return res.status(200).json({
      success: true,
      ...response,
    });
  } catch (error) {
    next(error);
  }
};

export const verifyGuestEmailOtp = async (req, res, next) => {
  try {
    const { email, otp, fullName, mobile } = req.body;
    const verifiedEmail = await verifyEmailOtpCode(email, otp);
    const guest = await findOrCreateGuestFromIdentity({
      email: verifiedEmail,
      mobile,
      fullName,
      markEmailVerified: true,
    });

    return sendGuestAuthResponse(res, guest);
  } catch (error) {
    next(error);
  }
};

export const guestSignup = async (req, res, next) => {
  try {
    const { name, fullName, email, mobile, password } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const normalizedMobile = normalizeMobile(mobile);

    if (!normalizedEmail || !normalizedMobile || !password) {
      return next(errorHandler(400, 'Name, email, mobile and password are required'));
    }

    if (password.length < 6) {
      return next(errorHandler(400, 'Password must be at least 6 characters'));
    }

    const guest = await findOrCreateGuestFromIdentity({
      email: normalizedEmail,
      mobile: normalizedMobile,
      fullName: fullName || name,
      password,
    });

    return sendGuestAuthResponse(res, guest);
  } catch (error) {
    if (error?.code === 11000) {
      return next(errorHandler(409, 'Email or mobile already linked to another account'));
    }
    next(error);
  }
};

export const guestLogin = async (req, res, next) => {
  try {
    const { mobile, email, password } = req.body;
    if (!password) {
      return next(errorHandler(400, 'Password is required'));
    }

    const normalizedMobile = normalizeMobile(mobile);
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedMobile && !normalizedEmail) {
      return next(errorHandler(400, 'Mobile or email is required'));
    }

    const guest = await WebsiteGuest.findOne({
      $or: [
        ...(normalizedMobile ? [{ mobile: normalizedMobile }] : []),
        ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
      ],
    }).select('+password');

    if (!guest || !(await guest.comparePassword(password))) {
      return next(errorHandler(401, 'Invalid credentials'));
    }

    return sendGuestAuthResponse(res, guest);
  } catch (error) {
    next(error);
  }
};

export const linkGuestMobile = async (req, res, next) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return next(
        errorHandler(
          400,
          'Firebase idToken is required. Verify mobile with Firebase Phone Auth on the client first.'
        )
      );
    }

    const firebaseUser = await verifyFirebaseIdToken(idToken);
    const signInProvider = getSignInProvider(firebaseUser);

    if (signInProvider !== 'phone') {
      return next(
        errorHandler(400, 'Firebase token must be from Phone Authentication to link mobile')
      );
    }

    const normalizedMobile = normalizeMobile(firebaseUser.phone_number);
    if (!normalizedMobile) {
      return next(errorHandler(400, 'Firebase token does not include a valid phone number'));
    }

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
    guest.firebaseUid = guest.firebaseUid || firebaseUser.uid;
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
