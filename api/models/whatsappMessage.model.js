import mongoose from 'mongoose';

const whatsappMessageSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true },
    message: { type: String, required: true },
    direction: { type: String, enum: ['incoming', 'outgoing'], default: 'incoming' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    metaMessageId: { type: String, default: null }, // optional: from Meta webhook for idempotency
  },
  { timestamps: true }
);

export default mongoose.model('WhatsappMessage', whatsappMessageSchema);
