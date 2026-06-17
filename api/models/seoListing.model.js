import mongoose from 'mongoose';

const seoListingSchema = new mongoose.Schema({
  locationType: {
    type: String,
    enum: ['country', 'state', 'city', 'destination', 'attraction', 'region'],
    required: true
  },
  country: {
    type: String,
    required: true
  },
  state: {
    type: String,
    default: ''
  },
  city: {
    type: String,
    default: ''
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  metaTitle: {
    type: String,
    required: true
  },
  metaDescription: {
    type: String,
    required: true
  },
  metaKeywords: {
    type: String,
    default: ''
  },
  canonicalTag: {
    type: String,
    default: ''
  },
  robotsMeta: {
    type: String,
    default: 'index, follow'
  },
  heading: {
    type: String,
    required: true
  },
  subHeading: {
    type: String,
    default: ''
  },

  bestTimeToVisit: {
    type: String,
    default: ''
  },
  howToReach: {
    type: String,
    default: ''
  },
  travelTips: {
    type: String,
    default: ''
  },
  highlights: {
    type: [String],
    default: []
  },

  faqs: [{
    question: {
      type: String,
      required: true
    },
    answer: {
      type: String,
      required: true
    }
  }],
  nearbyLocations: [{
    name: {
      type: String,
      required: true
    },
    slug: {
      type: String,
      default: ''
    },
    distance: {
      type: String,
      default: ''
    },
    image: {
      type: String,
      default: ''
    },
    altText: {
      type: String,
      default: ''
    }
  }],
  latitude: {
    type: Number,
    default: null
  },
  longitude: {
    type: Number,
    default: null
  },
  mapEmbedUrl: {
    type: String,
    default: ''
  },
  images: [{
    name: String,
    preview: String,
    id: Number
  }],
  altText: {
    type: [String],
    default: []
  },
  focusKeyword: {
    type: String,
    default: ''
  },
  tags: {
    type: [String],
    default: []
  },

  aboutLocation: {
    type: String,
    required: true
  },

  schemaType: {
    type: String,
    default: 'TouristDestination'
  },
  enableFaqSchema: {
    type: Boolean,
    default: true
  },
  enablePageSchema: {
    type: Boolean,
    default: true
  },
  organizationName: {
    type: String,
    default: ''
  },
  organizationLogo: {
    type: String,
    default: ''
  },
  sitemapChangefreq: {
    type: String,
    enum: ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'],
    default: 'weekly'
  },

  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

seoListingSchema.index({ country: 1, state: 1, city: 1 });
seoListingSchema.index({ locationType: 1, isActive: 1 });
seoListingSchema.index({ slug: 1 });
seoListingSchema.index({ tags: 1 });

const SeoListing = mongoose.model('SeoListing', seoListingSchema);

export default SeoListing;
