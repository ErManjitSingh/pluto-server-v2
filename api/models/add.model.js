import mongoose from 'mongoose';

const addSchema = new mongoose.Schema({
  package: {
    type: Object,
    required: true
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
