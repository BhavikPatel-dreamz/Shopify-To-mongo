import Product from '../../models/Product.js';
import Collection from '../../models/Collection.js';
import * as embeddingService from '../../services/embeddingService.js';
import * as vectorService from '../../services/vectorService.js';
import { transformProduct } from './transformProduct.js';
import { getProductsCollectionsHanls } from '../../utils/comman.js';

async function processBatch(products) {
  console.log(`Processing batch of ${products.length} products...`);
  
  
  
  for (const shopifyProduct of products) {
    try {
      // Transform Shopify product to our schema
      const productData = transformProduct(shopifyProduct);
      console.log('Transformed Product Data:', productData);
      
      // Process collection mapping
      
      const collectionHandles = await getProductsCollectionsHanls(productData.collections);
      // Add collection_handle array to product data
      productData.collection_handle = collectionHandles;
      // Save or update product in MongoDB
      const product = await Product.findOneAndUpdate(
        { shopifyId: productData.shopifyId },
        {
          ...productData,
          collection_handle: collectionHandles
        },
        {
          upsert: true,
          new: true,
          runValidators: true // This ensures schema validation
        }
      );
      
      console.log(`Product updated with ${collectionHandles.length} collection handles:`, collectionHandles);
      
      // console.log('Saved Product:', {
      //   id: product._id,
      //   shopifyId: product.shopifyId,
      //   name: product.name,
      //   hasEmbedding: product.hasEmbedding
      // });

      // Generate and store embedding if needed
      // if (!product.hasEmbedding) {
      //   try {
      //     // Format product text for embedding
      //     // const productText = embeddingService.formatProductForEmbedding(product);
      //     // console.log('Product Text for Embedding:', productText);
          
      //     // // Generate embedding
      //     // const embedding = await embeddingService.generateEmbedding(productText);
      //     // console.log('Generated Embedding Length:', embedding.length);

      //     // // Store embedding in Pinecone
      //     // await vectorService.storeProductEmbedding(product, embedding);
      //     // console.log('Embedding stored in Pinecone');
          
      //     // // Update product status
      //     // await Product.findByIdAndUpdate(product._id, {
      //     //   hasEmbedding: true,
      //     //   vectorId: product._id.toString()
      //     // });

      //     console.log(`✅ Successfully processed product: ${product.name}`);
      //   } catch (embeddingError) {
      //     console.error('Error in embedding process:', embeddingError);
      //     // Continue with next product even if embedding fails
      //   }
      // } else {
      //   console.log(`Skipping embedding generation for ${product.name} - already exists`);
      // }
    } catch (error) {
      console.error('Error processing product:', {
        title: shopifyProduct.title,
        error: error.message,
        stack: error.stack
      });
    }
  }
}

export default processBatch; 