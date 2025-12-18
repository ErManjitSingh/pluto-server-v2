import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const cabLoginSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  userType: {
    type: String,
    required: true
   
  },
   companyType: {
    type: String,
    required: true
   
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  }
}, { timestamps: true });

// Hash password before saving
cabLoginSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Method to compare passwords
cabLoginSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const CabLogin = mongoose.model('CabLogin', cabLoginSchema);

export default CabLogin;
