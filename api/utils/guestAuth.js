import jwt from 'jsonwebtoken';

export const normalizeMobile = (mobile) => {
  if (!mobile) return null;
  const onlyDigits = String(mobile).replace(/\D/g, '');
  if (onlyDigits.length < 10) {
    return null;
  }
  return onlyDigits.slice(-10);
};

export const normalizeEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return null;
  }
  return email.trim().toLowerCase();
};

export const signGuestToken = (user) =>
  jwt.sign(
    {
      id: user._id,
      mobile: user.mobile || null,
      email: user.email || null,
      isWebsiteGuest: true,
    },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

export const formatGuestResponse = (user) => {
  const guest = user.toObject ? user.toObject() : { ...user };
  delete guest.password;
  return guest;
};

export const sendGuestAuthResponse = (res, user) => {
  const token = signGuestToken(user);
  const guestData = formatGuestResponse(user);

  return res
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
      user: guestData,
      data: guestData,
    });
};
