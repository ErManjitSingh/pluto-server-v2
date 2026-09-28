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
    /** Omit until a file exists. A stored null collides on the unique index. */
    recordingToken: { type: String },
    recordingHashOk: { type: Boolean, default: null },
    recordingSourceUrl: { type: String, default: null },
    metaErrors: { type: mongoose.Schema.Types.Mixed, default: null },
    notifiedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'whatsappcalls' }
);

whatsappCallSchema.index({ metaCallId: 1 }, { unique: true, sparse: true });
whatsappCallSchema.index(
  { recordingToken: 1 },
  {
    unique: true,
    name: 'recordingToken_1',
    partialFilterExpression: { recordingToken: { $type: 'string' } },
  }
);
whatsappCallSchema.index({ line: 1, phone: 1, createdAt: -1 });
whatsappCallSchema.index({ assignedTo: 1, status: 1, createdAt: -1 });

whatsappCallSchema.pre('save', function omitBlankRecordingToken(next) {
  if (this.recordingToken == null || this.recordingToken === '') {
    this.$unset('recordingToken');
    this.recordingToken = undefined;
    delete this._doc.recordingToken;
  }
  next();
});

const WhatsappCall = mongoose.model('WhatsappCall', whatsappCallSchema);

/**
 * The old unique index treated a missing recording as null, so the second call
 * could not be inserted. Keep uniqueness only for real token strings.
 */
export async function ensureRecordingTokenIndex() {
  const collection = WhatsappCall.collection;
  const indexes = await collection.indexes();
  const current = indexes.find((idx) => idx.name === 'recordingToken_1');
  const isPartial = current?.partialFilterExpression?.recordingToken?.$type === 'string';
  if (current && !isPartial) {
    await collection.dropIndex('recordingToken_1');
  }
  await collection.updateMany(
    { $or: [{ recordingToken: null }, { recordingToken: '' }] },
    { $unset: { recordingToken: '' } }
  );
  if (!isPartial) {
    await collection.createIndex(
      { recordingToken: 1 },
      {
        unique: true,
        name: 'recordingToken_1',
        partialFilterExpression: { recordingToken: { $type: 'string' } },
      }
    );
  }
}

export default WhatsappCall;
