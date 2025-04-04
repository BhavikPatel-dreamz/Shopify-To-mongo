import mongoose from 'mongoose';

const UserInteractionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  productId: {
    type: String,
    required: true
  },
  interactionType: {
    type: String,
    enum: ['view', 'like', 'purchase'],
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Compound index for efficient querying
UserInteractionSchema.index({ userId: 1, productId: 1, interactionType: 1 });

export default mongoose.model('UserInteraction', UserInteractionSchema, 'shopify.UserInteraction');    