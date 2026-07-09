import nodemailer from 'nodemailer';
import EmailOtp from '../models/emailotp.model.js';
import { normalizeEmail } from '../utils/guestAuth.js';

const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 5);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const buildEmailTransport = () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || 'false') === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
};

const sendOtpByEmail = async (email, otp) => {
  const transporter = buildEmailTransport();
  if (!transporter) {
    console.log(`[EMAIL OTP] ${email} => ${otp}`);
    return;
  }

  const fromAddress = process.env.EMAIL_FROM || process.env.SMTP_USER;
  await transporter.sendMail({
    from: fromAddress,
    to: email,
    subject: 'Your Login OTP',
    text: `Your OTP is ${otp}. It will expire in ${OTP_EXPIRY_MINUTES} minutes.`,
    html: `<p>Your OTP is <b>${otp}</b>.</p><p>It will expire in ${OTP_EXPIRY_MINUTES} minutes.</p>`,
  });
};

export const createAndSendEmailOtp = async (emailInput) => {
  const email = normalizeEmail(emailInput);
  if (!email) {
    const err = new Error('Please enter a valid email address');
    err.statusCode = 400;
    throw err;
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await EmailOtp.deleteMany({ email, verified: false });
  await EmailOtp.create({ email, otp, expiresAt });
  await sendOtpByEmail(email, otp);

  return { email, message: 'Email OTP sent successfully' };
};

export const verifyEmailOtpCode = async (emailInput, otpInput) => {
  const email = normalizeEmail(emailInput);
  const otp = String(otpInput || '').replace(/\D/g, '');

  if (!email) {
    const err = new Error('Please enter a valid email address');
    err.statusCode = 400;
    throw err;
  }

  if (otp.length !== 6) {
    const err = new Error('Enter 6-digit OTP');
    err.statusCode = 400;
    throw err;
  }

  const record = await EmailOtp.findOne({ email, verified: false }).sort({ createdAt: -1 });
  if (!record) {
    const err = new Error('OTP expired or not found. Please request a new OTP');
    err.statusCode = 400;
    throw err;
  }

  if (record.expiresAt < new Date()) {
    await EmailOtp.deleteOne({ _id: record._id });
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

  return email;
};
