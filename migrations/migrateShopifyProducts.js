import 'dotenv/config';
import connectDB from '../config/database.js';
import { shopifyClient } from '../config/shopify.js';
import { productsQuery } from '../graphql/queries/products.js';
import processBatch from './products/processBatch.js';

// Initialize MongoDB connection
await connectDB();

/**
 * Main migration function with pagination
 */
async function migrateProducts() {
  console.log('Starting product migration...');
  
  let hasNextPage = true;
  let cursor = null;
  let totalProcessed = 0;

  while (hasNextPage) {
    try {
      const data = await shopifyClient.query(productsQuery, { cursor });
      const products = data.products.edges.map(edge => edge.node);
      
      await processBatch(products);
      
      hasNextPage = data.products.pageInfo.hasNextPage;
      //hasNextPage = false;
      cursor = data.products.pageInfo.endCursor;
      totalProcessed += products.length;
      
      console.log(`Processed ${totalProcessed} products so far`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Error during migration:', error);
      break;
    }
  }

  console.log(`Migration completed. Total products processed: ${totalProcessed}`);
  process.exit(0);
}

// Run migration
migrateProducts().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
}); 