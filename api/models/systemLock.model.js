import mongoose from 'mongoose';

/**
 * Lightweight advisory locks for multi-instance jobs (e.g. Meta lead sync).
 * Document _id is the lock name.
 */
const systemLockSchema = new mongoose.Schema(
  {
    _id: { type: String },
    expiresAt: { type: Date, required: true },
    lockedAt: { type: Date, required: true },
    holder: { type: String, required: false }
  },
  { collection: 'system_locks' }
);

const SystemLock = mongoose.model('SystemLock', systemLockSchema);

export default SystemLock;
