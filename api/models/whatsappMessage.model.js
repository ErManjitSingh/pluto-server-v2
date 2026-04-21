import mongoose from 'mongoose';

const whatsappMessageSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true },
    message: { type: String, required: true },
    direction: { type: String, enum: ['incoming', 'outgoing'], default: 'incoming' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    metaMessageId: { type: String, default: null }, // optional: from Meta webhook for idempotency
    messageType: {
      type: String,
      enum: ['text', 'document', 'image', 'video', 'audio'],
      default: 'text',
    },
    mediaUrl: { type: String, default: null },
    caption: { type: String, default: null },
    filename: { type: String, default: null },
    metaMediaId: { type: String, default: null },
    mimeType: { type: String, default: null },
    deliveryStatus: {
      type: String,
      enum: ['sent', 'delivered', 'read', 'failed'],
      default: null,
    },
    deliveryTick: {
      type: String,
      enum: ['single', 'double-grey', 'double-blue'],
      default: null,
    },
    statusUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('WhatsappMessage', whatsappMessageSchema);
