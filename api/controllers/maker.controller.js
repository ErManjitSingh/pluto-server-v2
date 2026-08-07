import Maker from '../models/maker.model.js';
import Lead from '../models/lead.model.js';
import { errorHandler } from '../utils/error.js';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { normalizeMobile } from '../utils/guestAuth.js';
import { verifyFirebaseIdToken } from '../config/firebase.js';

const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d+\$.{53}$/;

const stripPasswordFromResponse = (maker) => {
  const obj = maker.toObject ? maker.toObject() : { ...maker };
  delete obj.password;
  return obj;
};

const findMakerByMobile = async (mobileInput) => {
  const mobile = normalizeMobile(mobileInput);
  if (!mobile) return { mobile: null, maker: null };

  const maker = await Maker.findOne({
    $or: [
      { contactNo: mobile },
      { contactNo: `91${mobile}` },
      { contactNo: `+91${mobile}` },
      { contactNo: { $regex: `${mobile}$` } },
    ],
  });

  return { mobile, maker };
};

const sendMakerAuthResponse = (res, maker) => {
  const token = jwt.sign(
    { id: maker._id, isMaker: true },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  const data = {
    ...stripPasswordFromResponse(maker),
    isMaker: true,
    token,
  };

  return res
    .cookie('access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    })
    .status(200)
    .json({
      success: true,
      message: 'Login successful',
      data,
    });
};

const applyPasswordUpdate = (updateData) => {
  let rawNewPassword = updateData.newPassword;
  delete updateData.newPassword;

  if (rawNewPassword == null && typeof updateData.password === 'string') {
    const candidate = updateData.password.trim();
    if (candidate.length > 0 && !BCRYPT_HASH_REGEX.test(candidate)) {
      rawNewPassword = candidate;
    }
  }

  delete updateData.password;

  if (typeof rawNewPassword === 'string') {
    const nextPassword = rawNewPassword.trim();
    if (nextPassword.length > 0) {
      updateData.password = bcryptjs.hashSync(nextPassword, 10);
    }
  }
};

export const createMaker = async (req, res, next) => {
  // Ensure all required fields are present
  const requiredFields = ['firstName', 'lastName', 'dateOfBirth',  
                        'designation', 'gender', 'email', 'password', 'contactNo', 'address'];
  const missingFields = requiredFields.filter(field => !req.body[field]);
  
  if (missingFields.length > 0) {
    return next(errorHandler(400, `Missing required fields: ${missingFields.join(', ')}`));
  }

  try {
    const { _id, password, ...makerDataWithoutId } = req.body;
    
    // Hash the password before saving
    const hashedPassword = bcryptjs.hashSync(password, 10);
    
    const maker = await Maker.create({
      ...makerDataWithoutId,
      password: hashedPassword
    });
    
    return res.status(201).json(stripPasswordFromResponse(maker));
  } catch (error) {
    console.log('Database error:', error);
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      const value = error.keyValue[field];
      
      if (field === 'email') {
        return next(errorHandler(400, `Email '${value}' is already registered`));
      } else if (field === 'contactNo') {
        return next(errorHandler(400, `Phone number '${value}' is already registered`));
      } else {
        return next(errorHandler(400, `${field} '${value}' already exists`));
      }
    }
    
    next(error);
  }
};

export const getMakers = async (req, res, next) => {
  try {
    const makers = await Maker.find().select('-password');
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const [todayCounts, monthCounts] = await Promise.all([
      Lead.aggregate([
        { $match: { assignedAt: { $gte: startOfToday } } },
        { $group: { _id: '$assignedUserId', count: { $sum: 1 } } }
      ]),
      Lead.aggregate([
        { $match: { assignedAt: { $gte: startOfMonth } } },
        { $group: { _id: '$assignedUserId', count: { $sum: 1 } } }
      ])
    ]);
    const todayMap = Object.fromEntries(todayCounts.map((r) => [String(r._id), r.count]));
    const monthMap = Object.fromEntries(monthCounts.map((r) => [String(r._id), r.count]));
    const result = makers.map((m) => {
      const obj = m.toObject ? m.toObject() : { ...m };
      obj.leadsAssignedToday = todayMap[String(m._id)] ?? 0;
      obj.leadsAssignedThisMonth = monthMap[String(m._id)] ?? 0;
      obj.totalConvertedLeads = m.totalConvertedLeads != null ? m.totalConvertedLeads : 0;
      return obj;
    });
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getMakerById = async (req, res, next) => {
  try {
    const maker = await Maker.findByIdAndUpdate(
      req.params.id,
      { $set: { lastFetch: new Date() } },
      { new: true }
    ).select('-password');
    if (!maker) {
      return next(errorHandler(404, 'Maker not found'));
    }
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const [leadsAssignedToday, leadsAssignedThisMonth] = await Promise.all([
      Lead.countDocuments({ assignedUserId: maker._id, assignedAt: { $gte: startOfToday } }),
      Lead.countDocuments({ assignedUserId: maker._id, assignedAt: { $gte: startOfMonth } })
    ]);
    const result = maker.toObject ? maker.toObject() : { ...maker };
    result.leadsAssignedToday = leadsAssignedToday;
    result.leadsAssignedThisMonth = leadsAssignedThisMonth;
    result.totalConvertedLeads = maker.totalConvertedLeads != null ? maker.totalConvertedLeads : 0;
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const updateMaker = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    applyPasswordUpdate(updateData);
    delete updateData._id;

    const updatedMaker = await Maker.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password');
    
    if (!updatedMaker) {
      return next(errorHandler(404, 'Maker not found'));
    }
    
    return res.status(200).json(updatedMaker);
  } catch (error) {
    console.log('Update error:', error);
    next(error);
  }
};

export const deleteMaker = async (req, res, next) => {
  try {
    const maker = await Maker.findByIdAndDelete(req.params.id);
    if (!maker) {
      return next(errorHandler(404, 'Maker not found'));
    }
    return res.status(200).json({ message: 'Maker deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Pre-check only — OTP is sent by Firebase Phone Auth on the client
export const sendMakerLoginOtp = async (req, res, next) => {
  try {
    const { contactNo, mobile, phone } = req.body;
    const { mobile: normalizedMobile, maker } = await findMakerByMobile(
      contactNo || mobile || phone
    );

    if (!normalizedMobile) {
      return next(errorHandler(400, 'Please enter a valid 10-digit mobile number'));
    }

    if (!maker) {
      return next(errorHandler(404, 'No maker found with this mobile number'));
    }

    if (maker.active === false) {
      return next(errorHandler(403, 'Your account is deactivated. Please contact support.'));
    }

    return res.status(200).json({
      success: true,
      mobile: normalizedMobile,
      message:
        'Maker found. Send OTP with Firebase Phone Auth on client, then call /api/maker/login-otp with idToken',
    });
  } catch (error) {
    next(error);
  }
};

export const loginMakerWithOtp = async (req, res, next) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return next(errorHandler(400, 'Firebase idToken is required'));
    }

    const firebaseUser = await verifyFirebaseIdToken(idToken);
    const signInProvider = firebaseUser.firebase?.sign_in_provider || '';

    if (signInProvider !== 'phone') {
      return next(errorHandler(400, 'Use Firebase Phone Authentication token only'));
    }

    const { maker } = await findMakerByMobile(firebaseUser.phone_number);

    if (!maker) {
      return next(errorHandler(404, 'No maker found with this mobile number'));
    }

    if (maker.active === false) {
      return next(errorHandler(403, 'Your account is deactivated. Please contact support.'));
    }

    return sendMakerAuthResponse(res, maker);
  } catch (error) {
    next(error);
  }
};
