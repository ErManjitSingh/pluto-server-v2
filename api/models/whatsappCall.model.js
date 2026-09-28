import mongoose from 'mongoose';

/**
 * Voice calls only. Chat messages stay in WhatsappMessage / WhatsappMessageDemand.
 * `line` matches the existing route, not a renamed company:
 * - whatsapp         → /api/whatsapp          → WHATSAPP_ACCESS_TOKEN
 * - whatsapp-demand  → /api/whatsapp-demand   → WHATSAPP_*_DEMAND
 */
const whatsappCallSchema = new mongoose.Schema(
  {
    line: { type: String, enum: ['whatsapp', 'whatsapp-demand'], required: true },
    metaCallId: { type: String },
    phone: { type: String, default: '' },
    customerName: { type: String, default: null },
    direction: { type: String, enum: ['incoming', 'outgoing'], required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, default: null },
    status: {
      type: String,
      enum: ['starting', 'ringing', 'pre_accepted', 'accepted', 'rejected', 'missed', 'completed', 'failed'],
      default: 'ringing',
    },
    metaStatus: { type: String, default: null },
    duration: { type: Number, default: null },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    answeredAt: { type: Date, default: null },
    sdpOffer: { type: String, default: null },
    sdpAnswer: { type: String, default: null },
    recordingStatus: {
      type: String,
      enum: ['idle', 'pending', 'ready', 'unavailable', 'failed'],
      default: 'idle',
    },
    recordingMediaId: { type: String, default: null },
    recordingSha256: { type: String, default: null },
    recordingMimeType: { type: String, default: null },
    recordingFilename: { type: String, default: null },
    /** Firebase Storage object path, for example whatsapp-calls/whatsapp-demand/<token>.ogg */
    recordingStoragePath: { type: String, default: null },
    recordingBucket: { type: String, default: null },
    recordingToken: { type: String, default: null },
    recordingHashOk: { type: Boolean, default: null },
    recordingSourceUrl: { type: String, default: null },
    metaErrors: { type: mongoose.Schema.Types.Mixed, default: null },
    notifiedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'whatsappcalls' }
);

whatsappCallSchema.index({ metaCallId: 1 }, { unique: true, sparse: true });
whatsappCallSchema.index({ recordingToken: 1 }, { unique: true, sparse: true });
whatsappCallSchema.index({ line: 1, phone: 1, createdAt: -1 });
whatsappCallSchema.index({ assignedTo: 1, status: 1, createdAt: -1 });

export default mongoose.model('WhatsappCall', whatsappCallSchema);
