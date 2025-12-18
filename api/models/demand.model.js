import mongoose from 'mongoose';

const demandSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  price: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    default: ''
  },
  country: {
    type: String,
    required: true
  },
  city: {
    type: String,
    required: true
  },
  state: {
    type: String,
    required: true
  },
  duration: {
    type: String,
    required: true
  },
  altText: {
    type: [String],
    default: []
  },
  availability: {
    type: String,
    default: 'InStock'
  },
  enableFaqSchema: {
    type: Boolean,
    default: true
  },
  enablePageSchema: {
    type: Boolean,
    default: true
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
  focusKeyword: {
    type: String,
    default: ''
  },
  images: [{
    name: String,
    preview: String,
    id: Number
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  mainContent: {
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
  metaTitle: {
    type: String,
    required: true
  },
  organizationLogo: {
    type: String,
    default: ''
  },
  organizationName: {
    type: String,
    default: ''
  },
  packageTheme: {
    type: String,
    required: true
  },
  priceRange: {
    type: String,
    default: ''
  },
  schemaType: {
    type: String,
    default: 'Product'
  },
  selectedPackages: [{
    id: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    theme: {
      type: String,
      required: true
    },
      image: {
      type: String,
      default: ''
    }
  }],
  slug: {
    type: String,
    required: true,
    unique: true
  },
  tags: {
    type: [String],
    default: []
  }
}, { timestamps: true });

const Demand = mongoose.model('Demand', demandSchema);

export default Demand;
