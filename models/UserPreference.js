import mongoose from 'mongoose';

const UserPreferenceSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true
  },
  preferenceVector: {
    type: [Number],
    required: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('UserPreference', UserPreferenceSchema, 'UserPreference'); 