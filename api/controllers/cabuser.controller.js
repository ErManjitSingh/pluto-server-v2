import CabUser from '../models/cabuser.model.js';
import jwt from 'jsonwebtoken';

// Helper function to create token
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

export const signup = async (req, res, next) => {
  try {
    const newUser = await CabUser.create({
      name: req.body.name,
      email: req.body.email,
      mobile: req.body.mobile,
      password: req.body.password,
      drivingLicense: req.body.drivingLicense,
      vehicles: req.body.vehicles,
      states: req.body.states
    });

    // Create token
    const token = signToken(newUser._id);

    // Remove password from output
    newUser.password = undefined;

    res.status(201).json({
      status: 'success',
      token,
      data: {
        user: newUser
      }
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Check if email and password exist
    if (!email || !password) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide email and password'
      });
    }

    // Check if user exists && password is correct
    const user = await CabUser.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        status: 'fail',
        message: 'Incorrect email or password'
      });
    }

    // Create token
    const token = signToken(user._id);

    // Remove password from output
    user.password = undefined;

    res.status(200).json({
      status: 'success',
      token,
      data: {
        user
      }
    });
  } catch (error) {
    next(error);
  }
};

export const updateCabUser = async (req, res, next) => {
  try {
    // Don't allow password updates through this route
    if (req.body.password) {
      return res.status(400).json({
        status: 'fail',
        message: 'This route is not for password updates. Please use /updatePassword.'
      });
    }

    const updatedUser = await CabUser.findByIdAndUpdate(
      req.params.id,
      {
        name: req.body.name,
        email: req.body.email,
        mobile: req.body.mobile,
        drivingLicense: req.body.drivingLicense,
       drivingLicenseImage: req.body.drivingLicenseImage,
        vehicles: req.body.vehicles,
        states: req.body.states
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!updatedUser) {
      return res.status(404).json({
        status: 'fail',
        message: 'No user found with that ID'
      });
    }

    // Remove password from output
    updatedUser.password = undefined;

    res.status(200).json({
      status: 'success',
      data: {
        user: updatedUser
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getAllCabUsers = async (req, res, next) => {
  try {
    const users = await CabUser.find()
      .select('-password') // Exclude password field from the response
      .sort('-createdAt'); // Sort by creation date, newest first
    
    res.status(200).json({
      status: 'success',
      results: users.length,
      data: {
        users
      }
    });
  } catch (error) {
    next(error);
  }
};
