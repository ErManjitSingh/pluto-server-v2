import mongoose from 'mongoose';

/** Customer-sent media pulled from Meta and stored on disk; token is used in public CRM URLs. */
const whatsappInboundMediaSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, index: true },
    storedFilename: { type: String, required: true },
    originalFilename: { type: String, default: '' },
    mimeType: { type: String, required: true },
    size: { type: Number, default: 0 },
    whatsappMessageId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true, collection: 'whatsappinboundmedias' }
);

export default mongoose.model('WhatsappInboundMedia', whatsappInboundMediaSchema);
