import jwt from 'jsonwebtoken';
import { errorHandler } from '../utils/error.js';

export const verifyToken = async (req, res, next) => {
    try {
        let token;
        
        // Check Authorization header
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        } 
        // Check cookie if no Authorization header
        else {
            token = req.cookies.access_token;
        }

        if (!token) {
            console.log('No token found in request');
            return next(errorHandler(401, 'Access denied. No token provided'));
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = { id: decoded.id };
            console.log('Token verified successfully for user:', decoded.id);
            next();
        } catch (error) {
            console.log('Token verification failed:', error.message);
            return next(errorHandler(401, 'Invalid token'));
        }
    } catch (error) {
        console.log('Auth middleware error:', error);
        return next(errorHandler(500, 'Authentication middleware error'));
    }
}; 