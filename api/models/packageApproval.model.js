import mongoose from 'mongoose';

const packageapproval = new mongoose.Schema({
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
  currentUser: {
  type: Object
  },
  packageStatus: {
type:String
  },
  activities: [{
    type: Object
  }],
  sightseeing: [{
    type: Object
  }]
}, { timestamps: true });

const approval = mongoose.model('packageapproval', packageapproval);
export default approval;
