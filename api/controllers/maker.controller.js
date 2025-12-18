import Maker from '../models/maker.model.js';
import { errorHandler } from '../utils/error.js';
import bcryptjs from 'bcryptjs';

export const createMaker = async (req, res, next) => {
  // Ensure all required fields are present
  const requiredFields = ['firstName', 'lastName', 'dateOfBirth',  
                        'designation', 'gender', 'email', 'password', 'contactNo', 'address'];
  const missingFields = requiredFields.filter(field => !req.body[field]);
  
  if (missingFields.length > 0) {
    return next(errorHandler(400, `Missing required fields: ${missingFields.join(', ')}`));
  }

  try {
    const { _id, password, ...makerDataWithoutId } = req.body;
    
    // Hash the password before saving
    const hashedPassword = bcryptjs.hashSync(password, 10);
    
    const maker = await Maker.create({
      ...makerDataWithoutId,
      password: hashedPassword
    });
    
    return res.status(201).json(maker);
  } catch (error) {
    console.log('Database error:', error);
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      const value = error.keyValue[field];
      
      if (field === 'email') {
        return next(errorHandler(400, `Email '${value}' is already registered`));
      } else if (field === 'contactNo') {
        return next(errorHandler(400, `Phone number '${value}' is already registered`));
      } else {
        return next(errorHandler(400, `${field} '${value}' already exists`));
      }
    }
    
    next(error);
  }
};

export const getMakers = async (req, res, next) => {
  try {
    const makers = await Maker.find();
    return res.status(200).json(makers);
  } catch (error) {
    next(error);
  }
};

export const getMakerById = async (req, res, next) => {
  try {
    const maker = await Maker.findById(req.params.id);
    if (!maker) {
      return next(errorHandler(404, 'Maker not found'));
    }
    return res.status(200).json(maker);
  } catch (error) {
    next(error);
  }
};

export const updateMaker = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    
    // If password is being updated, hash it
    if (updateData.password) {
      updateData.password = bcryptjs.hashSync(updateData.password, 10);
    }
    
    // Remove _id from update data if present
    delete updateData._id;
    
    const updatedMaker = await Maker.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!updatedMaker) {
      return next(errorHandler(404, 'Maker not found'));
    }
    
    return res.status(200).json(updatedMaker);
  } catch (error) {
    console.log('Update error:', error);
    next(error);
  }
};

export const deleteMaker = async (req, res, next) => {
  try {
    const maker = await Maker.findByIdAndDelete(req.params.id);
    if (!maker) {
      return next(errorHandler(404, 'Maker not found'));
    }
    return res.status(200).json({ message: 'Maker deleted successfully' });
  } catch (error) {
    next(error);
  }
};
