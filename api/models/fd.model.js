import mongoose from 'mongoose';

const fdSchema = new mongoose.Schema(
  {
    duration: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      type: String,
      required: true,
      trim: true,
    },
    pdfUrl: {
      type: String,
      required: true,
      trim: true,
    },
    originalFilename: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

fdSchema.index({ createdAt: -1 });
fdSchema.index({ location: 1, duration: 1 });

const Fd = mongoose.model('Fd', fdSchema);

export default Fd;
