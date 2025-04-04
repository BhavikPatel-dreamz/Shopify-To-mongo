import UserInteraction from '../models/UserInteraction.js';
import UserPreference from '../models/UserPreference.js';
import Product from '../models/Product.js';
import { embeddingService } from '../services/embeddingService.js';

/**
 * Track product view
 */
async function trackView(req, res) {
  try {
    const { userId, productId } = req.body;
    
    if (!userId || !productId) {
      return res.status(400).json({ error: 'User ID and Product ID are required' });
    }
    
    // Create interaction record
    await UserInteraction.create({
      userId,
      productId,
      interactionType: 'view'
    });
    
    // Update user preference vector (async, don't wait)
    updateUserPreferenceVector(userId).catch(err => 
      console.error('Error updating user preference vector:', err)
    );
    
    res.status(201).json({ success: true });
  } catch (error) {
    console.error('Error tracking view:', error);
    res.status(500).json({ error: 'Failed to track view' });
  }
}

/**
 * Track product like
 */
async function likeProduct(req, res) {
  try {
    const { userId, productId } = req.body;
    
    if (!userId || !productId) {
      return res.status(400).json({ error: 'User ID and Product ID are required' });
    }
    
    // Create interaction record
    await UserInteraction.create({
      userId,
      productId,
      interactionType: 'like'
    });
    
    // Update user preference vector (async, don't wait)
    updateUserPreferenceVector(userId).catch(err => 
      console.error('Error updating user preference vector:', err)
    );
    
    res.status(201).json({ success: true });
  } catch (error) {
    console.error('Error tracking like:', error);
    res.status(500).json({ error: 'Failed to track like' });
  }
}

/**
 * Track product purchase
 */
async function trackPurchase(req, res) {
  try {
    const { userId, productId } = req.body;
    
    if (!userId || !productId) {
      return res.status(400).json({ error: 'User ID and Product ID are required' });
    }
    
    // Create interaction record
    await UserInteraction.create({
      userId,
      productId,
      interactionType: 'purchase'
    });
    
    // Update user preference vector (async, don't wait)
    updateUserPreferenceVector(userId).catch(err => 
      console.error('Error updating user preference vector:', err)
    );
    
    res.status(201).json({ success: true });
  } catch (error) {
    console.error('Error tracking purchase:', error);
    res.status(500).json({ error: 'Failed to track purchase' });
  }
}

/**
 * Update user preference vector based on interactions
 */
async function updateUserPreferenceVector(userId) {
  try {
    // Get user interactions, weighted by type
    const interactions = await UserInteraction.find({ userId });
    
    if (interactions.length === 0) {
      return;
    }
    
    // Weight different interaction types
    const weights = {
      view: 1,
      like: 3,
      purchase: 5
    };
    
    // Get unique product IDs with their weights
    const productWeights = {};
    interactions.forEach(interaction => {
      const weight = weights[interaction.interactionType] || 1;
      if (productWeights[interaction.productId]) {
        productWeights[interaction.productId] += weight;
      } else {
        productWeights[interaction.productId] = weight;
      }
    });
    
    // Get products and their embeddings
    const productIds = Object.keys(productWeights);
    const products = await Product.find({ _id: { $in: productIds } });
    
    // Calculate weighted average of product embeddings
    // This is a simplified approach - in a real system, you might use more sophisticated methods
    let userVector = null;
    let totalWeight = 0;
    
    for (const product of products) {
      if (!product.vectorId) continue;
      
      const weight = productWeights[product._id.toString()];
      totalWeight += weight;
      
      // In a real implementation, you would fetch the vector from Pinecone
      // For now, we'll regenerate it (not efficient, but works for demo)
      const formattedText = embeddingService.formatProductForEmbedding(product);
      const embedding = await embeddingService.generateEmbedding(formattedText);
      
      if (!userVector) {
        userVector = embedding.map(val => val * weight);
      } else {
        userVector = userVector.map((val, i) => val + embedding[i] * weight);
      }
    }
    
    if (!userVector || totalWeight === 0) {
      return;
    }
    
    // Normalize the vector
    userVector = userVector.map(val => val / totalWeight);
    
    // Update or create user preference
    await UserPreference.findOneAndUpdate(
      { userId },
      { 
        userId,
        preferenceVector: userVector,
        lastUpdated: new Date()
      },
      { upsert: true }
    );
    
    console.log(`Updated preference vector for user ${userId}`);
  } catch (error) {
    console.error('Error updating user preference vector:', error);
    throw error;
  }
}
export default {
  trackView,
  likeProduct,
  trackPurchase
};