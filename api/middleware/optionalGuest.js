import jwt from 'jsonwebtoken';

export const optionalGuestToken = (req, res, next) => {
  try {
    let token;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else {
      token = req.cookies.access_token;
    }

    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.isWebsiteGuest) {
      req.guestUser = {
        id: decoded.id,
        mobile: decoded.mobile || null,
        email: decoded.email || null,
      };
    }
  } catch {
    // Ignore invalid token for optional auth
  }

  next();
};
