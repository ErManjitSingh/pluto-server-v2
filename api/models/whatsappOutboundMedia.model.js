import mongoose from 'mongoose';

/** Metadata for files uploaded for WhatsApp outbound media (bytes on disk; record in MongoDB). */
const whatsappOutboundMediaSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, index: true },
    storedFilename: { type: String, required: true },
    originalFilename: { type: String, default: '' },
    mimeType: { type: String, required: true },
    size: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'whatsappoutboundmedias' }
);

export default mongoose.model('WhatsappOutboundMedia', whatsappOutboundMediaSchema);
