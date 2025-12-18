import Destination from "../models/destinations.model.js";

export const createDestination = async ( req, res, next) => {
    try {
        const destination = await Destination.create(req.body);
        return res.status(200).json(destination);
    } catch (error) {
        next(error);
    }
}


export const getDestinations = async (req, res, next) => {
    try {
        const listings = await Destination.find();
    
        return res.status(200).json(listings);
      } catch (error) {
        next(error);
      }
    };