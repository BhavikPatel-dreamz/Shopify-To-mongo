import mongoose from 'mongoose';

const syncStateSchema = new mongoose.Schema({
  collectionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  cursor: {
    type: String,
    default: null
  },
  totalProcessed: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['in_progress', 'completed', 'failed'],
    default: 'in_progress'
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  error: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

const SyncState = mongoose.model('SyncState', syncStateSchema);

export default SyncState;