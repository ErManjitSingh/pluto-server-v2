import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const agentSchema = new mongoose.Schema(
  {
    agencyName: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    contactName: {
      type: String,
      required: true,
    },
    gstNumber: {
      type: String,
      required: true,
      unique: true,
    },
    panCard: {
      type: String,
      required: true,
      unique: true,
    },
    operationCity: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    rejectionReason: {
      type: String,
      default: null
    },
    phoneNumber: {
      type: String,
      required: true
    },
    isActive: {
      type: Boolean,
      default: false
    },
    adminComments: {
      type: String,
      default: null
    },
    username: {
      type: String,
      unique: true,
      sparse: true
    },
    password: {
      type: String,
      select: false
    },
    isAgent: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

agentSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 12);
  }
  next();
});

const Agent = mongoose.model('Agent', agentSchema);
export default Agent;