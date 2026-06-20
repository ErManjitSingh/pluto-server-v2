import SeoListing from '../models/seoListing.model.js';

export const createSeoListing = async (req, res) => {
  try {
    const listingData = req.body;

    const existingListing = await SeoListing.findOne({ slug: listingData.slug });
    if (existingListing) {
      return res.status(400).json({
        success: false,
        message: 'Slug already exists. Please use a unique slug.'
      });
    }

    const newListing = new SeoListing(listingData);
    const savedListing = await newListing.save();

    res.status(201).json({
      success: true,
      data: savedListing,
      message: 'SEO listing created successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getAllSeoListings = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      country,
      state,
      city,
      category,
      locationType,
      isActive,
      search,
      tag
    } = req.query;

    const filter = {};
    if (country) filter.country = country;
    if (state) filter.state = state;
    if (city) filter.city = city;
    if (category) filter.category = String(category).trim().toLowerCase();
    if (locationType) filter.locationType = locationType;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (tag) filter.tags = { $in: [tag] };

    if (search) {
      filter.$or = [
        { heading: { $regex: search, $options: 'i' } },
        { subHeading: { $regex: search, $options: 'i' } },
        { aboutLocation: { $regex: search, $options: 'i' } },
        { focusKeyword: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const skip = (page - 1) * limit;

    const listings = await SeoListing.find(filter)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await SeoListing.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: listings,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getSeoListingById = async (req, res) => {
  try {
    const { id } = req.params;

    const listing = await SeoListing.findById(id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'SEO listing not found'
      });
    }

    res.status(200).json({
      success: true,
      data: listing
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getSeoListingBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const listing = await SeoListing.findOne({ slug: slug.toLowerCase(), isActive: true });

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'SEO listing not found'
      });
    }

    res.status(200).json({
      success: true,
      data: listing
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getSeoListingsByLocationType = async (req, res) => {
  try {
    const { locationType } = req.params;
    const { page = 1, limit = 10, country, state, city } = req.query;

    const filter = { locationType, isActive: true };
    if (country) filter.country = country;
    if (state) filter.state = state;
    if (city) filter.city = city;

    const skip = (page - 1) * limit;

    const listings = await SeoListing.find(filter)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await SeoListing.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: listings,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const CATEGORY_LOCATION_TYPES = ['state', 'city'];

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeLocationParam(value) {
  return decodeURIComponent(String(value || ''))
    .trim()
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ');
}

export const getSeoListingsByCategoryAndLocationType = async (req, res) => {
  try {
    const { category, locationType, stateOrCity } = req.params;
    const { page = 1, limit = 10, country } = req.query;

    const normalizedCategory = String(category || '').trim().toLowerCase();
    const locationName = normalizeLocationParam(stateOrCity);

    if (!normalizedCategory) {
      return res.status(400).json({ success: false, message: 'category is required' });
    }
    if (!CATEGORY_LOCATION_TYPES.includes(locationType)) {
      return res.status(400).json({
        success: false,
        message: 'locationType must be "state" or "city"',
      });
    }
    if (!locationName) {
      return res.status(400).json({ success: false, message: 'state or city name is required' });
    }

    const locationRegex = new RegExp(`^${escapeRegex(locationName)}$`, 'i');

    const filter = {
      category: normalizedCategory,
      locationType,
      isActive: true,
    };

    // Match DB field based on locationType from frontend
    if (locationType === 'state') {
      filter.state = locationRegex;
    } else {
      filter.city = locationRegex;
    }

    if (country) filter.country = country;

    const skip = (page - 1) * limit;

    const listings = await SeoListing.find(filter)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await SeoListing.countDocuments(filter);

    res.status(200).json({
      success: true,
      category: normalizedCategory,
      locationType,
      ...(locationType === 'state' ? { state: locationName } : { city: locationName }),
      data: listings,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getSeoListingsForSitemap = async (req, res) => {
  try {
    const listings = await SeoListing.find({ isActive: true })
      .select('slug canonicalTag sitemapPriority sitemapChangefreq updatedAt publishedAt')
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      data: listings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const updateSeoListing = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body, lastReviewedAt: new Date() };

    if (updateData.slug) {
      const existingListing = await SeoListing.findOne({
        slug: updateData.slug,
        _id: { $ne: id }
      });
      if (existingListing) {
        return res.status(400).json({
          success: false,
          message: 'Slug already exists. Please use a unique slug.'
        });
      }
    }

    const updatedListing = await SeoListing.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedListing) {
      return res.status(404).json({
        success: false,
        message: 'SEO listing not found'
      });
    }

    res.status(200).json({
      success: true,
      data: updatedListing,
      message: 'SEO listing updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const deleteSeoListing = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedListing = await SeoListing.findByIdAndDelete(id);

    if (!deletedListing) {
      return res.status(404).json({
        success: false,
        message: 'SEO listing not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'SEO listing deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
