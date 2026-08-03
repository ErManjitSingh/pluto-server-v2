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
  }],
  uniqueSignature: {
    type: String,
    default: "",
  },
}, { timestamps: true });

packageapproval.index({ uniqueSignature: 1 });

const approval = mongoose.model('packageapproval', packageapproval);
export default approval;
