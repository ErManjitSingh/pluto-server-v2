import User from '../models/user.model.js';
import bcryptjs from 'bcryptjs';
import { errorHandler } from '../utils/error.js';
import jwt from 'jsonwebtoken';
import Maker from '../models/maker.model.js';

export const signup = async (req, res, next) => {
   const { username, email, phone, password, hotelId,userType } = req.body;

    try {
        // Check if email already exists
        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
            return next(errorHandler(400, 'Email already registered'));
        }

        // Check if phone already exists
        const existingPhone = await User.findOne({ phone });
      

        const hashedPassword = bcryptjs.hashSync(password, 10);
        const newUser = new User({ 
            username, 
            email, 
            phone,
            password: hashedPassword,
            ...(hotelId && { hotelId }), 
            ...(userType && { userType })
        });

        await newUser.save();
        res.status(201).json({
            success: true,
            message: "User created Successfully"
        });
    } catch (error) {
        next(error);
    }
}

export const signin = async (req, res, next) => {
    const { phone, password } = req.body;
    
    try {
        // First check in User collection
        let validUser = await User.findOne({ phone });
        let isMaker = false;

        // If not found in User collection, check in Maker collection
        if (!validUser) {
            const maker = await Maker.findOne({ contactNo: phone });
            if (maker) {
                validUser = maker;
                isMaker = true;
            } else {
                return next(errorHandler(404, 'No account found with this phone number!'));
            }
        }

        const validPassword = bcryptjs.compareSync(password, validUser.password);
        if (!validPassword) return next(errorHandler(401, 'Wrong Credentials!'));

        const token = jwt.sign({ 
            id: validUser._id,
            isMaker: isMaker // Include user type in token
        }, process.env.JWT_SECRET);
        
        const { password: pass, ...rest } = validUser._doc;

        res
            .cookie('access_token', token, { 
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000
            })
            .status(200)
            .json({
                success: true,
                message: 'Login successful',
                data: {
                    ...rest,
                    isMaker,
                    token: token
                }
            });
    } catch (error) {
        next(error);
    }
}

export const google = async (req, res, next) => {
    // Your Google auth logic here
};

export const signoutUser = async (req, res, next) => {
    try {
       res.clearCookie('access_token');
       res.status(200).json({
           success: true,
           message: 'User has been signed out successfully'
       });
    } catch(error) {
        next(error);
    }
}

export const checkAvailability = async (req, res, next) => {
    const { phone, email } = req.query;

    try {
        if (phone) {
            const existingPhone = await User.findOne({ phone });
            if (existingPhone) {
                return res.json({ available: false, message: 'Phone number already registered' });
            }
        }

        if (email) {
            const existingEmail = await User.findOne({ email });
            if (existingEmail) {
                return res.json({ available: false, message: 'Email already registered' });
            }
        }

        res.json({ available: true });
    } catch (error) {
        next(error);
    }
};

export const getAllUsers = async (req, res, next) => {
    try {
        // Add pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Add search functionality
        const search = req.query.search || '';
        const query = search ? {
            $or: [
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ]
        } : {};

        // Get total count for pagination
        const total = await User.countDocuments(query);

        // Fetch users with pagination and exclude password
        const users = await User.find(query)
            .select('-password')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: {
                users,
                pagination: {
                    total,
                    page,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

export const getUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        
        if (!user) {
            return next(errorHandler(404, 'User not found'));
        }

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        next(error);
    }
};

export const deleteUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return next(errorHandler(404, 'User not found'));
        }

        await User.findByIdAndDelete(req.params.id);

        res.status(200).json({
            success: true,
            message: 'User has been deleted successfully'
        });
    } catch (error) {
        next(error);
    }
}; 
