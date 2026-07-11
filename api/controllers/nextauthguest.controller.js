import { OAuth2Client } from 'google-auth-library';
import WebsiteGuest from '../models/websiteguest.model.js';
import { errorHandler } from '../utils/error.js';
import {
  normalizeEmail,
  sendGuestAuthResponse,
} from '../utils/guestAuth.js';

const splitName = (name = '') => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
    fullName: parts.join(' '),
  };
};

// NextAuth Google OAuth client (packagemaker-image project)
const NEXTAUTH_GOOGLE_CLIENT_ID =
  '492030504571-dki8c9oc6i58i0fjhesqvusikg5pve3o.apps.googleusercontent.com';

const getGoogleClientId = () =>
  process.env.NEXTAUTH_GOOGLE_CLIENT_ID ||
  process.env.GOOGLE_CLIENT_ID ||
  NEXTAUTH_GOOGLE_CLIENT_ID;

export const nextAuthGoogleGuestLogin = async (req, res, next) => {
  try {
    const { idToken } = req.body;
    const clientId = getGoogleClientId();

    if (!idToken) {
      return next(errorHandler(400, 'Google idToken is required'));
    }

    if (!clientId) {
      return next(
        errorHandler(
          500,
          'NEXTAUTH_GOOGLE_CLIENT_ID is not configured on the server'
        )
      );
    }

    const googleClient = new OAuth2Client(clientId);
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: clientId,
    });
    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email) {
      return next(
        errorHandler(401, 'Google token does not contain a valid user identity')
      );
    }

    const email = normalizeEmail(payload.email);
    const googleId = payload.sub;
    const names = splitName(payload.name);

    let guest = await WebsiteGuest.findOne({
      $or: [{ googleId }, { email }],
    });

    if (!guest) {
      guest = new WebsiteGuest({
        firstName: names.firstName || undefined,
        lastName: names.lastName || undefined,
        fullName: names.fullName || undefined,
        email,
        photoURL: payload.picture || '',
        googleId,
        emailVerified: Boolean(payload.email_verified),
      });
    } else {
      guest.googleId = googleId;
      guest.emailVerified = Boolean(
        payload.email_verified || guest.emailVerified
      );

      if (!guest.email) guest.email = email;
      if (payload.picture) guest.photoURL = payload.picture;
      if (names.fullName) {
        guest.firstName = names.firstName;
        guest.lastName = names.lastName;
        guest.fullName = names.fullName;
      }
    }

    await guest.save();
    return sendGuestAuthResponse(res, guest);
  } catch (error) {
    if (
      error?.message?.includes('Wrong recipient') ||
      error?.message?.includes('Invalid token signature') ||
      error?.message?.includes('Token used too late') ||
      error?.message?.includes('No pem found')
    ) {
      return next(errorHandler(401, 'Invalid or expired Google idToken'));
    }

    if (error?.code === 11000) {
      return next(
        errorHandler(409, 'Google email is already linked to another account')
      );
    }

    next(error);
  }
};
