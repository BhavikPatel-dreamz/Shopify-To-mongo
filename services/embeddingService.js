import axios from 'axios';
import Product from '../models/Product.js';
import embeddingConfig from '../config/embedding.js';

/**
 * Generate embedding vector using a simple model
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} - Embedding vector
 */
async function generateEmbedding(text) {
  try {
    const response = await axios.post(embeddingConfig.embeddingApiUrl, text, {
      headers: { "Content-Type": "text/plain" },
    });

    if (!Array.isArray(response.data)) {
      throw new Error("Invalid embedding response format");
    }

    return response.data;
  } catch (error) {
    console.error("❌ Error fetching embedding:", error.message);
    return null; // Return null so it doesn't break processing
  }
}

/**
 * Format product data for embedding
 * @param {Object} product - Product object
 * @returns {string} - Formatted text for embedding
 */
function formatProductForEmbedding(product) {
  return `
    Product: ${product.name || ''}
    Description: ${product.description || ''}
    Categories: ${(product.categories || []).join(', ')}
    Tags: ${(product.tags || []).join(', ')}
    Color: ${product.attributes?.color || ''}
    Size: ${product.attributes?.size || ''}
    Material: ${product.attributes?.material || ''}
    Season: ${product.attributes?.season || ''}
  `.trim();
}

/**
 * Generate embeddings for all products in the database
 */
async function generateAllProductEmbeddings() {
  try {
    const products = await Product.find({});
    console.log(`Found ${products.length} products to process`);
    
    for (const product of products) {
      const formattedText = formatProductForEmbedding(product);
      const embedding = await generateEmbedding(formattedText);
      
      // Store the embedding in your vector database (implemented in vectorService)
      console.log(`Generated embedding for product: ${product.name}`);
    }
    
    console.log('All product embeddings generated successfully');
  } catch (error) {
    console.error('Error generating product embeddings:', error);
    throw error;
  }
}

const embeddingService ={generateEmbedding,
  formatProductForEmbedding,
  generateAllProductEmbeddings}
export {
  embeddingService,
  generateEmbedding,
  formatProductForEmbedding,
  generateAllProductEmbeddings
}; 