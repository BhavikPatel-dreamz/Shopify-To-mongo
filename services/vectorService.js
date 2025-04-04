import { PineconeIndex } from '../config/pinecone.js';
import Product from '../models/Product.js';
import  { formatProductForEmbedding, generateEmbedding } from './embeddingService.js';

/**
 * Store product embedding in Pinecone
 * @param {string} productId - MongoDB product ID
 * @param {number[]} embedding - Vector embedding
 * @returns {Promise<boolean>} - Success status
 */
async function storeProductEmbedding(product, embedding) {
  try {
    // Create vector record for Pinecone
    const vector = {
      id: product._id.toString(),
      values: embedding,
      metadata: {
        productId: product._id.toString(),
        name: product.name,
        category: product.category,
        color: product.color,
        size: product.size,
        material: product.material,
        price: product.price,
      }
    };
    
    console.log(vector);

    // Upsert the vector to Pinecone
    await PineconeIndex.upsert([
      {
         id: 'vec1', 
         values: [1.0, 1.5],
         metadata: { genre: 'drama' }
      },
      {
         id: 'vec2', 
         values: [2.0, 1.0],
         metadata: { genre: 'action' }
      },
      {
         id: 'vec3', 
         values: [0.1, 0.3],
         metadata: { genre: 'drama' }
      },
      {
         id: 'vec4', 
         values: [1.0, -2.5],
         metadata: { genre: 'action' }
      }
    ]);

    
    // Update the product in MongoDB to mark it as having an embedding
    // await Product.findByIdAndUpdate(productId, {
    //   vectorId: productId,
    //   hasEmbedding: true,
    //   embeddingUpdatedAt: new Date()
    // });
    
    console.log(`Stored embedding for product ${productId} in Pinecone`);
    return true;
  } catch (error) {
    console.error('Error storing product embedding:', error);
    throw error;
  }
}

/**
 * Find similar products based on product ID
 * @param {string} productId - Product ID to find similar items for
 * @param {number} limit - Number of similar products to return
 * @returns {Promise<Array>} - Array of similar products with scores
 */
async function findSimilarProducts(productId, limit = 10) {
  try {
    // Get the product from MongoDB
    const product = await Product.findById(productId);
    if (!product) {
      throw new Error(`Product with ID ${productId} not found`);
    }
    
    // Generate embedding for the product
    const formattedText = formatProductForEmbedding(product);
    const embedding = await generateEmbedding(formattedText);
    
    // Query Pinecone for similar products
    const results = await searchSimilarProducts(embedding, { limit });
    
    // Filter out the original product
    return results.filter(item => item.productId !== productId);
  } catch (error) {
    console.error('Error finding similar products:', error);
    throw error;
  }
}

/**
 * Search for similar products in Pinecone
 * @param {number[]} queryEmbedding - Query vector embedding
 * @param {Object} options - Search options
 * @returns {Promise<Array>} - Array of product IDs and scores
 */
async function searchSimilarProducts(queryEmbedding, options = {}) {
  const { limit = 10, minScore = 0.5, filter = {} } = options;
  
  try {
    // Query Pinecone for similar vectors
    const queryResponse = await PineconeIndex.query({
      vector: queryEmbedding,
      topK: limit,
      includeMetadata: true,
      filter: filter
    });
    
    // Extract matches from the response
    const matches = queryResponse.matches || [];
    
    // Filter by minimum score and map to the desired format
    const results = matches
      .filter(match => match.score >= minScore)
      .map(match => ({
        productId: match.metadata.productId,
        score: match.score
      }));
    
    // Fetch product details from MongoDB
    const productIds = results.map(result => result.productId);
    const products = await Product.find({ _id: { $in: productIds } }).lean();
    
    // Merge product details with search results
    const productsWithScores = results.map(result => {
      const product = products.find(p => p._id.toString() === result.productId);
      if (!product) return null;
      return {
        ...product,
        similarityScore: result.score
      };
    }).filter(Boolean);
    
    return productsWithScores;
  } catch (error) {
    console.error('Error searching similar products:', error);
    throw error;
  }
}

/**
 * Search products by natural language query
 * @param {string} query - Natural language query
 * @param {Object} options - Search options
 * @returns {Promise<Array>} - Array of matching products
 */
async function searchProductsByQuery(query, options = {}) {
  try {
    // Generate embedding for the query
    const queryEmbedding = await embeddingService.generateEmbedding(query);
    
    // Search for similar products
    const results = await searchSimilarProducts(queryEmbedding, options);
    
    return results;
  } catch (error) {
    console.error('Error searching products by query:', error);
    throw error;
  }
}

const vectorService = {
  storeProductEmbedding,
  findSimilarProducts,
  searchSimilarProducts,
  searchProductsByQuery,
};

export default vectorService;
