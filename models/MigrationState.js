import mongoose from 'mongoose';

const migrationStateSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  lastCursor: { type: String, required: true },
  lastRun: { type: Date, default: Date.now },
  totalProcessed: { type: Number, default: 0 }
});

const MigrationState = mongoose.model('MigrationState', migrationStateSchema);

export default MigrationState; 