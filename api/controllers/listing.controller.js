import Listing from "../models/listing.model.js";

export const createListing = async ( req, res, next) => {
    try {
        const listing = await Listing.create(req.body);
        return res.status(200).json(listing);
    } catch (error) {
        next(error);
    }
}

export const getListings = async (req, res, next) => {
  try {
      const listings = await Listing();
  
      return res.status(200).json(listings);
    } catch (error) {
      next(error);
    }
  };