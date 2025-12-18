import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const cabUserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,  
  },
  mobile: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  
  vehicles: [{
    vehicleName: {
      type: String,      
    },
    cabType:{
type: String,    
},
    RC: {
      type: String,    
    },
    RCImage: {
      type: String,  // URL or file path for RC image
    }
  }],
  
  drivingLicense: {
    type: String,
  },
  drivingLicenseImage: {
    type: String,  // URL or file path for driving license image
  },
  states: {
    type: [String],
    validate: [arrayLimit, 'You must specify at least one state']
  }
}, { timestamps: true });

// Validator to ensure states array isn't empty
function arrayLimit(val) {
  return val.length > 0;
}

// Hash password before saving
cabUserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Method to compare passwords
cabUserSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const CabUser = mongoose.model('CabUser', cabUserSchema);

export default CabUser;
