import mongoose from 'mongoose';

/** Same shape as WhatsappMessage; separate collection so main and demand lines never share documents. */
const whatsappMessageDemandSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true },
    message: { type: String, required: true },
    direction: { type: String, enum: ['incoming', 'outgoing'], default: 'incoming' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    metaMessageId: { type: String, default: null },
    /** Outgoing media (Meta Cloud API uses a public HTTPS link). */
    messageType: {
      type: String,
      enum: ['text', 'document', 'image', 'video', 'audio'],
      default: 'text',
    },
    mediaUrl: { type: String, default: null },
    caption: { type: String, default: null },
    filename: { type: String, default: null },
  },
  { timestamps: true, collection: 'whatsappdemandmessages' }
);

export default mongoose.model('WhatsappMessageDemand', whatsappMessageDemandSchema);
