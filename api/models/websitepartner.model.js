import mongoose from 'mongoose';
import bcryptjs from 'bcryptjs';

const websitePartnerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    mobile: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    // Linked PackageMaker property document
    packageMakerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PackageMaker',
      required: false,
      index: true,
    },
  },
  { timestamps: true }
);

function isBcryptHash(value) {
  return (
    typeof value === 'string' &&
    (value.startsWith('$2a$') ||
      value.startsWith('$2b$') ||
      value.startsWith('$2y$'))
  );
}

websitePartnerSchema.pre('save', async function (next) {
  try {
    if (this.isModified('password') && this.password && !isBcryptHash(this.password)) {
      this.password = await bcryptjs.hash(this.password, 10);
    }
    next();
  } catch (error) {
    next(error);
  }
});

websitePartnerSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcryptjs.compare(candidatePassword, this.password);
};

const WebsitePartner = mongoose.model('WebsitePartner', websitePartnerSchema);

export default WebsitePartner;
