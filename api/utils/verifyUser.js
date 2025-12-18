import { errorHandler } from "./error.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

export const verifyToken = (req, res, next) => {
    // Check for token in both cookie and Authorization header
    const token = req.cookies.access_token || 
                 (req.headers.authorization && req.headers.authorization.split(' ')[1]);
    
    if(!token){
        return next(errorHandler(401, 'Unauthorized - No token provided'));
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if(err) return next(errorHandler(403, 'Forbidden - Invalid token'));
        req.user = user;
        next();
    });
}

// Simple static token verification - no JWT required
export const verifySimpleToken = (req, res, next) => {
    // Check for token in both cookie and Authorization header
    const token = req.cookies.access_token || 
                 (req.headers.authorization && req.headers.authorization.split(' ')[1]);
    
    if(!token){
        return next(errorHandler(401, 'Unauthorized - No token provided'));
    }

    // Simple static token check
      const validToken =  "sk-live-a8b9c7d4e2f1g3h5i6j8k9l0m1n2o3p4q5r6s7t8u9v0w1x1r2s3t4u5v6w7x8y9z0";
    
    if (token === validToken) {
        // Valid static token - just set the flag
        req.isSimpleToken = true;
        return next();
    }
    
    // Invalid token
    return next(errorHandler(403, 'Forbidden - Invalid token'));
}

// New middleware that accepts both individual user tokens and common token
export const verifyTokenOrCommon = (req, res, next) => {
    // Check for token in both cookie and Authorization header
    const token = req.cookies.access_token || 
                 (req.headers.authorization && req.headers.authorization.split(' ')[1]);
    
    if(!token){
        return next(errorHandler(401, 'Unauthorized - No token provided'));
    }

    // First, try to verify as a regular JWT token
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (!err) {
            // Valid JWT token - regular user
            req.user = user;
            req.isCommonToken = false;
            return next();
        }
        
        // If JWT verification failed, check if it's the common token
        const commonToken = process.env.COMMON_TOKEN;
        if (commonToken && token === commonToken) {
            // Valid common token - create a common user object with valid ObjectId
            req.user = {
                id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439012'), // Fixed ObjectId for common user
                isCommon: true
            };
            req.isCommonToken = true;
            return next();
        }
        
        // Neither valid JWT nor common token
        return next(errorHandler(403, 'Forbidden - Invalid token'));
    });
}
 
