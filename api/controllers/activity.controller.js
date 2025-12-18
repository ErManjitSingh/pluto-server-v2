import Activity from "../models/activity.model.js";
import { errorHandler } from "../utils/error.js";

export const createActivity = async ( req, res, next) => {
    try {
        const activities = await Activity.create(req.body);
        return res.status(200).json(activities);
    } catch (error) {
        next(error);
    }
}

export const getActivities = async (req, res, next) => {
    try {
        const listings = await Activity.find();
    
        return res.status(200).json(listings);
      } catch (error) {
        next(error);
      }
    };

export const getActivity = async (req, res, next) => {
  try {
    const listing = await Activity.findById(req.params.id);
    if(!listing) {
      return next(errorHandler(404, 'Activity not found'));
    }
    res.status(200).json(listing);
  } catch (error) {
    next(error);
  }
};