import jwt from 'jsonwebtoken';
import { errorHandler } from '../utils/error.js';

export const verifyGuestToken = (req, res, next) => {
  try {
    let token;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else {
      token = req.cookies.access_token;
    }

    if (!token) {
      return next(errorHandler(401, 'Access denied. No token provided'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.isWebsiteGuest) {
      return next(errorHandler(403, 'Guest access required'));
    }

    req.guestUser = {
      id: decoded.id,
      mobile: decoded.mobile || null,
      email: decoded.email || null,
    };

    next();
  } catch (error) {
    return next(errorHandler(401, 'Invalid or expired token'));
  }
};
