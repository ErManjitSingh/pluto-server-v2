import ActivityUser from '../models/activityuser.model.js';
import jwt from 'jsonwebtoken';

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });

const sanitizeUser = (userDoc) => {
  const user = userDoc.toObject();
  delete user.password;
  return user;
};

const pickActivityUserPayload = (body) => ({
  name: body.name,
  email: body.email,
  password: body.password,
  mobile: body.mobile,
  states: body.states
});

export const signupActivityUser = async (req, res, next) => {
  try {
    const newUser = await ActivityUser.create(pickActivityUserPayload(req.body));
    const token = signToken(newUser._id);

    res.status(201).json({
      status: 'success',
      token,
      data: { user: sanitizeUser(newUser) }
    });
  } catch (error) {
    next(error);
  }
};

export const loginActivityUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide email and password'
      });
    }

    const user = await ActivityUser.findOne({ email }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        status: 'fail',
        message: 'Incorrect email or password'
      });
    }

    const token = signToken(user._id);

    res.status(200).json({
      status: 'success',
      token,
      data: { user: sanitizeUser(user) }
    });
  } catch (error) {
    next(error);
  }
};

export const createActivityUser = async (req, res, next) => {
  try {
    const user = await ActivityUser.create(pickActivityUserPayload(req.body));

    res.status(201).json({
      status: 'success',
      data: { user: sanitizeUser(user) }
    });
  } catch (error) {
    next(error);
  }
};

export const getAllActivityUsers = async (req, res, next) => {
  try {
    const users = await ActivityUser.find().select('-password').sort('-createdAt');

    res.status(200).json({
      status: 'success',
      results: users.length,
      data: { users }
    });
  } catch (error) {
    next(error);
  }
};

export const getActivityUserById = async (req, res, next) => {
  try {
    const user = await ActivityUser.findById(req.params.id).select('-password');

    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'No activity user found with that ID'
      });
    }

    res.status(200).json({
      status: 'success',
      data: { user }
    });
  } catch (error) {
    next(error);
  }
};

export const updateActivityUser = async (req, res, next) => {
  try {
    const user = await ActivityUser.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'No activity user found with that ID'
      });
    }

    const updatableFields = ['name', 'email', 'mobile', 'states'];
    updatableFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        user[field] = req.body[field];
      }
    });

    if (req.body.password) {
      user.password = req.body.password;
    }

    await user.save();

    res.status(200).json({
      status: 'success',
      data: { user: sanitizeUser(user) }
    });
  } catch (error) {
    next(error);
  }
};

export const deleteActivityUser = async (req, res, next) => {
  try {
    const user = await ActivityUser.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'No activity user found with that ID'
      });
    }

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    next(error);
  }
};

