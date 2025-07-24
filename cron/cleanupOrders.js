import cron from 'node-cron';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import MigrationState from '../models/MigrationState.js';
import { shopifyClient } from '../config/shopify.js';
import { productsQuery } from '../graphql/queries/products.js';
import processBatch from '../migrations/products/processBatch.js';


// Run every day at midnight
const cleanupOldOrders = async () => {
    try {
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 36);

        const result = await Order.deleteMany({
            createdAt: { $lt: threeMonthsAgo }
        });

        console.log(`Cleaned up ${result.deletedCount} old orders`);
        return { success: true, deletedCount: result.deletedCount };
    } catch (error) {
        console.error('Error cleaning up old orders:', error);
        return { success: false, error: error.message };
    }
};

const cleanupProducts = async () => {
    try {
        const now = new Date();
        
        const result = await Product.deleteMany({
            updatedAt: {$lte: now },
            isAvailable: false
        });

        console.log(`Cleaned up ${result.deletedCount} unavailable products`);
        return { success: true, deletedCount: result.deletedCount };
    } catch (error) {
        console.error('Error cleaning up products:', error);
        return { success: false, error: error.message };
    }
};

// Product syc function
async function getLastRun() {
  try {
    const state = await MigrationState.findOne({ name: 'shopify_products_sync' });
    return state
  } catch (error) {
    console.error('Error fetching last cursor:', error);
    return null;
  }
}
async function updateCursorStateOnly(cursor, totalProcessed, endDate) {
  try {
    await MigrationState.findOneAndUpdate(
      { name: 'shopify_products_sync' },
      {
        lastCursor: cursor,
        lastRun: endDate,
        totalProcessed: totalProcessed
      },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error updating cursor state:', error);
  }
}
 async function syncShopifyProducts() {
  console.log('🚀 Cron job started at:', new Date().toISOString());

  let hasNextPage = true;
  let totalProcessed = 0;
  //--old code--//
  // const yesterday = new Date();
  // yesterday.setDate(yesterday.getDate() - 1);
  // const updatedAtQuery = `updated_at:>=${yesterday.toISOString().split('T')[0]}`;
  const { lastRun, lastCursor } = await getLastRun();
  let cursor = lastCursor
  const updatedAtQuery = `updated_at:>=${lastRun.toISOString().split('T')[0]}`;

  if (cursor) {
    console.log('Resuming migration from cursor:', cursor);
  } else {
    console.log('Starting new migration from the beginning');
  }

  try {
    while (hasNextPage) {
      try {
        const data = await shopifyClient.query(productsQuery, { cursor, updatedAtQuery });
        const products = data.products.edges.map(edge => edge.node);
        await processBatch(products);

        hasNextPage = data.products.pageInfo.hasNextPage;
        cursor = data.products.pageInfo.endCursor;
        totalProcessed += products.length;
        const endDate = new Date().toISOString()
        await updateCursorStateOnly(cursor, totalProcessed, endDate);
      } catch (error) {
        console.error('Error during migration:', error);
        const endDate = new Date().toISOString()
        await updateCursorStateOnly(cursor, totalProcessed, endDate);
      }
    }
    console.log(` Migration completed at ${new Date().toISOString()}. Total products processed: ${totalProcessed}`);
  } catch (error) {
    console.error(' Cron job failed:', error);
  }
}

// Schedule both cleanup jobs to run daily at midnight
export const startOrderCleanupJob = () => {
    cron.schedule('0 0 * * *', cleanupOldOrders);
    console.log('Daily cleanup jobs scheduled');
};
export const startProductCleanupJob = () => {
    cron.schedule('0 * * * *', cleanupProducts);
    console.log('Daily cleanup jobs scheduled');
};

export const startProductAddedJob = () => {
  cron.schedule('0 * * * *', syncShopifyProducts);
  console.log('Product added job scheduled');
};

