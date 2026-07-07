import MobileOtp from '../models/mobileotp.model.js';
import { normalizeMobile } from '../utils/guestAuth.js';

const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 5);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const sendOtpViaProvider = async (mobile, otp) => {
  const provider = (process.env.OTP_PROVIDER || 'console').toLowerCase();

  if (provider === 'msg91') {
    const authKey = process.env.MSG91_AUTH_KEY;
    const templateId = process.env.MSG91_TEMPLATE_ID;

    if (!authKey || !templateId) {
      throw new Error('MSG91_AUTH_KEY and MSG91_TEMPLATE_ID are required for MSG91 OTP');
    }

    const response = await fetch('https://control.msg91.com/api/v5/otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authkey: authKey,
      },
      body: JSON.stringify({
        template_id: templateId,
        mobile: `91${mobile}`,
        otp,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MSG91 OTP failed: ${errorText}`);
    }

    return;
  }

  console.log(`[OTP] Mobile +91${mobile} => ${otp}`);
};

export const createAndSendOtp = async (mobileInput) => {
  const mobile = normalizeMobile(mobileInput);
  if (!mobile) {
    const err = new Error('Please enter a valid 10-digit mobile number');
    err.statusCode = 400;
    throw err;
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await MobileOtp.deleteMany({ mobile, verified: false });
  await MobileOtp.create({ mobile, otp, expiresAt });

  await sendOtpViaProvider(mobile, otp);

  return { mobile, message: 'OTP sent successfully' };
};

export const verifyOtpCode = async (mobileInput, otpInput) => {
  const mobile = normalizeMobile(mobileInput);
  const otp = String(otpInput || '').replace(/\D/g, '');

  if (!mobile) {
    const err = new Error('Please enter a valid mobile number');
    err.statusCode = 400;
    throw err;
  }

  if (otp.length !== 6) {
    const err = new Error('Enter 6-digit OTP');
    err.statusCode = 400;
    throw err;
  }

  const record = await MobileOtp.findOne({ mobile, verified: false }).sort({ createdAt: -1 });

  if (!record) {
    const err = new Error('OTP expired or not found. Please request a new OTP');
    err.statusCode = 400;
    throw err;
  }

  if (record.expiresAt < new Date()) {
    await MobileOtp.deleteOne({ _id: record._id });
    const err = new Error('OTP expired. Please request a new OTP');
    err.statusCode = 400;
    throw err;
  }

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    const err = new Error('Too many failed attempts. Please request a new OTP');
    err.statusCode = 429;
    throw err;
  }

  if (record.otp !== otp) {
    record.attempts += 1;
    await record.save();
    const err = new Error('Invalid OTP');
    err.statusCode = 400;
    throw err;
  }

  record.verified = true;
  await record.save();

  return mobile;
};
