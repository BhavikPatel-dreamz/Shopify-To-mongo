import 'dotenv/config';
import connectDB from '../config/database.js';
import { shopifyClient } from '../config/shopify.js';
import { productsQuery } from '../graphql/queries/products.js';
import processBatch from './products/processBatch.js';
import MigrationState from '../models/MigrationState.js';
import cron from "node-cron";

// Initialize MongoDB connection
await connectDB();

/**
 * Get the last saved cursor state
 */
async function getLastCursor() {
  try {
    const state = await MigrationState.findOne({ name: 'shopify_products' });
    return state?.lastCursor;
  } catch (error) {
    console.error('Error fetching last cursor:', error);
    return null;
  }
} 

/**
 * Update the cursor state
 */
async function updateCursorState(cursor, totalProcessed) {
  try {
    await MigrationState.findOneAndUpdate(
      { name: 'shopify_products' },
      { 
        lastCursor: cursor, 
        lastRun: new Date(),
        totalProcessed: totalProcessed
      },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error updating cursor state:', error);
  }
}

/**
 * Main migration function with pagination
 */
async function migrateProducts() { 
  console.log('Starting product migration...');
  
  let hasNextPage = true;
  let cursor = await getLastCursor();
  let totalProcessed = 0;
  
  // Log the starting point
  if (cursor) {
    console.log('Resuming migration from cursor:', cursor);
  } else {
    console.log('Starting new migration from the beginning');
  }
  
  while (hasNextPage) {
    try {
      // If cursor is null, it will start from the beginning
      const data = await shopifyClient.query(productsQuery, { cursor });
      const products = data.products.edges.map(edge => edge.node);
      
      await processBatch(products);
      
      hasNextPage = data.products.pageInfo.hasNextPage;
      cursor = data.products.pageInfo.endCursor;
      totalProcessed += products.length;
      
      // Update the cursor state after each batch
      await updateCursorState(cursor, totalProcessed);
      
      console.log(`Processed ${totalProcessed} products so far.`);
      
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      console.error('Error during migration:', error);
      // Save the current state before breaking
      await updateCursorState(cursor, totalProcessed);
      break;
    }
  }

  console.log(`Migration completed. Total products processed: ${totalProcessed}`);
  process.exit(0);
}

async function syncShopifyProducts() {
  let hasNextPage = true;
  let cursor = await getLastCursor();
  let totalProcessed = 0;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const updatedAtQuery = `updated_at:>=${yesterday.toISOString().split('T')[0]}`;

  if (cursor) {
    console.log('Resuming migration from cursor:', cursor);
  } else {
    console.log('Starting new migration from the beginning');
  }

  while (hasNextPage) {
    try {

      const data = await shopifyClient.query(productsQuery, { cursor,updatedAtQuery });
      const products = data.products.edges.map(edge => edge.node);
      await processBatch(products);

      hasNextPage = data.products.pageInfo.hasNextPage;
      cursor = data.products.pageInfo.endCursor;
      totalProcessed += products.length;

      await updateCursorState(cursor, totalProcessed);
      console.log(`Processed ${totalProcessed} products}`);
    } catch (error) {
      console.error('Error during migration:', error);
      await updateCursorState(cursor, totalProcessed);
      break;
    }
  }
  console.log(`Migration completed. Total products processed: ${totalProcessed}`);
}

// Schedule the product added job 
export const startProductAddedJob = () => {
  cron.schedule('0 0 * * *', syncShopifyProducts);
  console.log('Product added job scheduled');
};
// Run migration
// migrateProducts().catch(error => {
//   console.error('Migration failed:', error);
//   process.exit(1);
// }); 