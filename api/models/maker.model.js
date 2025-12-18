import mongoose from 'mongoose';

const makerSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  dateOfBirth: {
    type: Date,
    required: true
  },
  userType: {
    type: String,
   
  },
  teamLeaderName: {
    type: String,
  },
  teamLeaderId:{
type:String,
  },
    managerId:{
type:String,
  },
  managerName: {
    type: String,
  },
  designation: {
    type: String,
    required: true
  },
  gender: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  companyName: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  contactNo: {
    type: String,
    required: true,
      unique: true
  },
  address: {
    type: String,
    required: true
  },
  publish: {
    type: String,
    default: 'No'
  }
}, { timestamps: true });

const Maker = mongoose.model('Maker', makerSchema);
export default Maker;
