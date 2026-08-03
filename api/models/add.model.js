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
  }],
  uniqueSignature: {
    type: String,
    default: "",
  },
}, { timestamps: true });

// Add indexes for better query performance
addSchema.index({ createdAt: -1 }); // Index for sorting by creation date
addSchema.index({ updatedAt: -1 }); // Index for sorting by update date
addSchema.index({ "package.duration": 1 }); // Fast duration filtering
addSchema.index({ "package.duration": 1, "package.state": 1 }); // Fast exact match combo
// Testing filter API: duration + pickup / drop / places
addSchema.index({ "package.duration": 1, "package.pickupLocation": 1 });
addSchema.index({ "package.duration": 1, "package.dropLocation": 1 });
addSchema.index({
  "package.packagePlaces.placeCover": 1,
  "package.packagePlaces.nights": 1,
});
addSchema.index({ uniqueSignature: 1 });
addSchema.index(
  {
    "package.packageName": "text",
    "package.state": "text",
    "package.duration": "text",
  },
  {
    weights: {
      "package.packageName": 10,
      "package.state": 5,
      "package.duration": 3,
    },
    name: "package_search_text",
  }
);

const Add = mongoose.model('Add', addSchema);
export default Add;
