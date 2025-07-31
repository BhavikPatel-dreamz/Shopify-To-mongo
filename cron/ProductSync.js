import cron from 'node-cron';
import MigrationState from '../models/MigrationState.js';
import { shopifyClient } from '../config/shopify.js';
import { productsQuery } from '../graphql/queries/products.js';
import processBatch from '../migrations/products/processBatch.js';
import connectDB from '../config/database.js';

// Initialize MongoDB connection
await connectDB();



/**
 * Update the cursor state
 */
async function updateCursorStateOnly(cursor, totalProcessed, endDate) {
  try {
    await MigrationState.findOneAndUpdate(
      { name: 'shopify_products_cron_one' },
      {
        lastCursor: cursor,
        lastRun: endDate ? new Date(endDate) : new Date(),
        totalProcessed: totalProcessed
      },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error updating cursor state:', error);
  }
}



/**
 * Generate dynamic updated_at query for last 2 minutes
 * Shopify expects format: updated_at:>'2020-10-21T23:39:20Z'
 */
function generateUpdatedAtQuery() {
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
  // Shopify expects ISO string format with single quotes around the timestamp
  const isoString = twoMinutesAgo.toISOString();
  return `updated_at:>'${isoString}'`;
}

/**
 * Main migration function with pagination
 */
async function syncShopifyProducts() {
  console.log('Starting product sync...');

  let hasNextPage = true;
  let cursor = null;
  let totalProcessed = 0;
  
  // Generate dynamic query for products updated in last 2 minutes
  const updatedAtQuery = generateUpdatedAtQuery();
  console.log('Using updatedAtQuery:', updatedAtQuery);

  const startTime = new Date();

  while (hasNextPage) {
    try {
      // Query Shopify with the updated_at filter
      const data = await shopifyClient.query(productsQuery, { 
        cursor: cursor, 
        updatedAtQuery: updatedAtQuery 
      });
      
      const products = data.products.edges.map(edge => edge.node);

      // Only process if there are products
      if (products.length > 0) {
        await processBatch(products);
        console.log(`Processed batch of ${products.length} products`);
      }

      hasNextPage = data.products.pageInfo.hasNextPage;
      cursor = data.products.pageInfo.endCursor;
      totalProcessed += products.length;

      // Update the cursor state after each batch
      await updateCursorStateOnly(cursor, totalProcessed, startTime.toISOString());

      console.log(`Processed ${totalProcessed} products so far.`);

      // Add delay to avoid rate limiting (reduced since we're processing fewer products)
      if (hasNextPage) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error('Error during migration:', error);
      // Save the current state before breaking
      await updateCursorStateOnly(cursor || '', totalProcessed, startTime.toISOString());
      break;
    }
  }
  
  console.log(`Synchronization completed. Total products processed: ${totalProcessed}`);
  
  // Update final state
  await updateCursorStateOnly(null, totalProcessed, new Date().toISOString());
}

// Run migration job
export const startProductAddedJob = () => {
  cron.schedule('*/2 * * * *', async () => {
    try {
      await syncShopifyProducts();
    } catch (error) {
      console.error('Cron job error:', error);
    }
  });
  console.log('Product sync job scheduled every 2 minutes');
}

// Optional: Run once immediately on startup
export const runProductSyncOnce = async () => {
  try {
    await syncShopifyProducts();
  } catch (error) {
    console.error('One-time sync error:', error);
  }
}