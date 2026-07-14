import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import WebsitePartner from '../models/websitepartner.model.js';
import Property from '../models/packagemaker.model.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

function normalizeMobile(mobile) {
  if (!mobile || typeof mobile !== 'string') return '';
  const digits = mobile.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }

  return digits;
}

function buildWebsiteBasicInfoPlaceholder(ownerName) {
  const year = String(new Date().getFullYear());
  return {
    propertyName: ownerName ? `${ownerName}'s Property` : 'Pending Property',
    propertyDescription: 'Pending',
    hotelStarRating: '-',
    propertyBuiltYear: '-',
    bookingSinceYear: year,
    email: '-',
    mobile: '-',
  };
}

function sanitizePartner(partnerDoc) {
  const data = partnerDoc.toObject ? partnerDoc.toObject() : { ...partnerDoc };
  delete data.password;
  return data;
}

function sanitizeProperty(propertyDoc) {
  if (!propertyDoc) return null;
  const data = propertyDoc.toObject ? propertyDoc.toObject() : { ...propertyDoc };
  if (data.basicInfo) delete data.basicInfo.password;
  if (data.account) delete data.account.password;
  return data;
}

function signPartnerToken(partner) {
  return jwt.sign(
    {
      id: partner._id,
      isWebsitePartner: true,
      packageMakerId: partner.packageMakerId || null,
      mobile: partner.mobile,
      email: partner.email,
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

async function findPartnerByLoginId(loginId) {
  const raw = String(loginId || '').trim();
  if (!raw) return null;

  const email = normalizeEmail(raw);
  const mobile = normalizeMobile(raw);
  const or = [];

  if (email.includes('@')) {
    or.push({ email });
  }
  if (mobile) {
    or.push({ mobile });
  }
  if (mongoose.Types.ObjectId.isValid(raw)) {
    or.push({ _id: raw });
    or.push({ packageMakerId: raw });
  }

  if (!or.length) return null;

  return WebsitePartner.findOne({ $or: or });
}

/**
 * POST /api/website-partner/signup
 * Creates WebsitePartner account + linked draft PackageMaker.
 */
export const signupWebsitePartner = async (req, res) => {
  try {
    const name = req.body.name?.trim();
    const email = normalizeEmail(req.body.email);
    const mobile = normalizeMobile(req.body.mobile);
    const password = req.body.password;

    if (!name || !email || !mobile || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, mobile and password are required',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters',
      });
    }

    const existing = await WebsitePartner.findOne({
      $or: [{ email }, { mobile }],
    }).select('_id email mobile');

    if (existing) {
      const field = existing.mobile === mobile ? 'mobile number' : 'email';
      return res.status(409).json({
        success: false,
        message: `An account with this ${field} already exists`,
      });
    }

    const partner = new WebsitePartner({ name, email, mobile, password });
    await partner.save();

    const property = await Property.create({
      isWebsiteHotel: true,
      websitePartnerId: partner._id,
      basicInfo: buildWebsiteBasicInfoPlaceholder(name),
    });

    partner.packageMakerId = property._id;
    await partner.save();

    const token = signPartnerToken(partner);

    res.status(201).json({
      success: true,
      message: 'Signup successful',
      data: {
        partner: sanitizePartner(partner),
        property: sanitizeProperty(property),
        propertyId: property._id,
        token,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email or mobile already exists',
      });
    }
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * POST /api/website-partner/signin
 * Login with mobile OR email (+ optional property id) and password.
 */
export const signinWebsitePartner = async (req, res) => {
  try {
    const loginId = (
      req.body.loginId ||
      req.body.mobile ||
      req.body.email ||
      req.body.propertyId ||
      req.body.id ||
      ''
    ).trim();
    const password = req.body.password;

    if (!loginId || !password) {
      return res.status(400).json({
        success: false,
        message: 'Login ID (mobile or email) and password are required',
      });
    }

    const partner = await findPartnerByLoginId(loginId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this mobile or email',
      });
    }

    const partnerWithPassword = await WebsitePartner.findById(partner._id).select('+password');
    const validPassword = await partnerWithPassword.comparePassword(password);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid password',
      });
    }

    let property = null;
    if (partner.packageMakerId) {
      property = await Property.findById(partner.packageMakerId);
    }

    const token = signPartnerToken(partnerWithPassword);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        partner: sanitizePartner(partnerWithPassword),
        property: sanitizeProperty(property),
        propertyId: partner.packageMakerId || property?._id || null,
        token,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * GET /api/website-partner/get-hotel-by-login?loginId=
 * No token — fetch linked PackageMaker by partner mobile/email/id.
 */
export const getHotelByLogin = async (req, res) => {
  try {
    const loginId =
      req.query.loginId ||
      req.query.mobile ||
      req.query.email ||
      req.query.propertyId ||
      req.query.id;

    if (!loginId || !String(loginId).trim()) {
      return res.status(400).json({
        success: false,
        message: 'loginId (mobile or email) is required',
      });
    }

    const partner = await findPartnerByLoginId(loginId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this mobile or email',
      });
    }

    if (!partner.packageMakerId) {
      return res.status(404).json({
        success: false,
        message: 'No property linked to this account',
      });
    }

    const property = await Property.findById(partner.packageMakerId);
    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Linked property not found',
      });
    }

    res.status(200).json({
      success: true,
      data: sanitizeProperty(property),
      partner: sanitizePartner(partner),
      propertyId: property._id,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * GET /api/website-partner/get-all
 * Debug list of website partner accounts.
 */
export const getAllWebsitePartners = async (req, res) => {
  try {
    const partners = await WebsitePartner.find()
      .select('-password')
      .sort({ createdAt: -1 });

    const data = partners.map((p) => ({
      partnerId: p._id,
      name: p.name,
      email: p.email,
      mobile: p.mobile,
      packageMakerId: p.packageMakerId,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    res.status(200).json({
      success: true,
      total: data.length,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
