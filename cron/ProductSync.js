import cron from 'node-cron';
import MigrationState from '../models/MigrationState.js';
import { shopifyClient } from '../config/shopify.js';
import { productsQuery } from '../graphql/queries/products.js';
import processBatch from '../migrations/products/processBatch.js';
import connectDB from '../config/database.js';


// // Initialize MongoDB connection
await connectDB();

// /**
//  * Get the last saved cursor state
//  */
async function getLastCursor() {
  try {
    const state = await MigrationState.findOne({ name: 'shopify_products_cron' });
    return state?.lastCursor;
  } catch (error) {
    console.error('Error fetching last cursor:', error);
    return null;
  }
}

// /**
//  * Update the cursor state
//  */
async function updateCursorStateOnly(cursor, totalProcessed, endDate) {
  try {
    await MigrationState.findOneAndUpdate(
      { name: 'shopify_products_cron' },
      {
        lastCursor: cursor,
        lastRun: endDate ? endDate : new Date(),
        totalProcessed: totalProcessed
      },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error updating cursor state:', error);
  }
}

async function getLastRun() {
  try {
    const state = await MigrationState.findOne({ name: 'shopify_products_cron' });
    return state?.lastRun;
  } catch (error) {
    console.error('Error fetching last cursor:', error);
    return null;
  }
}

/**
 * Main migration function with pagination
 */
async function syncShopifyProducts() {
  console.log('Starting product sync...');

  let hasNextPage = true;
  let cursor = await getLastCursor();
  let lastRun = await getLastRun();
  let totalProcessed = 0;

  // Log the starting point
  if (cursor) {
    console.log('Resuming sync from cursor:', cursor);
  } else {
    console.log('Starting new sync from the beginning');
  }
  // Use the last run date or default to 2 days ago if not available
  const updatedAtQuery = lastRun ? `updated_at:>=${lastRun.toISOString().split('T')[0]}` :
    `updated_at:>=${new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}`; // 2 days ago

  while (hasNextPage) {
    try {
      // If cursor is null, it will start from the beginning
      const data = await shopifyClient.query(productsQuery, { cursor, updatedAtQuery });
      const products = data.products.edges.map(edge => edge.node);

      await processBatch(products);

      hasNextPage = data.products.pageInfo.hasNextPage;
      cursor = data.products.pageInfo.endCursor;
      totalProcessed += products.length;

      // Update the cursor state after each batch
      const endDate = new Date().toISOString()
      await updateCursorStateOnly(cursor, totalProcessed, endDate);

      console.log(`Processed ${totalProcessed} products so far.`);

      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      console.error('Error during migration:', error);
      // Save the current state before breaking
      const endDate = new Date().toISOString()
      await updateCursorStateOnly(cursor, totalProcessed, endDate);
      break;
    }
  }
  console.log(`Synchronization completed. Total products processed: ${totalProcessed}`);
};

// Run migration
export const startProductAddedJob = () => {
    cron.schedule('*/5 * * * *', syncShopifyProducts);
    console.log('added product jobs scheduled every 5 minutes');
}




