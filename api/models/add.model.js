import mongoose from 'mongoose';

const addSchema = new mongoose.Schema({
  package: {
    type: Object,
    required: true
  },
  images: [{
    name: {
      type: String,
      default: ''
    },
    preview: {
      type: String,
      default: ''
    },
    id: {
      type: Number
    },
    altText: {
      type: String,
      default: ''
    }
  }],
  canonicalTag: {
    type: String,
    default: ''
  },
  metaTitle: {
    type: String,
    default: ''
  },
  metaKeywords: {
    type: String,
    default: ''
  },
  metaDescription: {
    type: String,
    default: ''
  },
  enablePageSchema: {
    type: Boolean,
    default: false
  },
  focusKeyword: {
    type: String,
    default: ''
  },
  schemaType: {
    type: String,
    default: ''
  },
  cabs: {
    type: Object
  },
  hotels: {
    type: Object
  },
  finalCosting: {
    type: Object
  },
  activities: [{
    type: Object
  }],
  sightseeing: [{
    type: Object
  }]
}, { timestamps: true });

// Add indexes for better query performance
addSchema.index({ createdAt: -1 }); // Index for sorting by creation date
addSchema.index({ updatedAt: -1 }); // Index for sorting by update date

const Add = mongoose.model('Add', addSchema);
export default Add;
