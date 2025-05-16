import 'dotenv/config';
import connectDB from '../config/database.js';
import { shopifyClient } from '../config/shopify.js';
import { collectionsQuery } from '../graphql/queries/collections.js';
import MigrationState from '../models/MigrationState.js';
import Collection from '../models/Collection.js';
import Product from '../models/Product.js';

// Initialize MongoDB connection
await connectDB();

/**
 * Get the last saved cursor state
 */
async function getLastCursor() {
  try {
    const state = await MigrationState.findOne({ name: 'shopify_collections' });
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
      { name: 'shopify_collections' },
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
 * Process a batch of collections
 */
async function processBatch(collections) {
  try {
    for (const collection of collections) {
      // Get product IDs from Shopify
      const productIds = collection.products?.edges?.map(edge => edge.node.id) || [];
      
      // Find corresponding products in MongoDB
      const products = await Product.find({ shopifyId: { $in: productIds } });
      const productObjectIds = products.map(p => p._id);

      const collectionData = {
        shopifyId: collection.id,
        title: collection.title,
        handle: collection.handle,
        description: collection.description,
        descriptionHtml: collection.descriptionHtml,
        updatedAt: collection.updatedAt,
        publishedAt: collection.publishedAt,
        productCount: productObjectIds.length,
        products: productObjectIds,
        image: collection.image ? {
          url: collection.image.url,
          altText: collection.image.altText,
          width: collection.image.width,
          height: collection.image.height
        } : null
      };

      // Update collection
      const updatedCollection = await Collection.findOneAndUpdate(
        { shopifyId: collection.id },
        collectionData,
        { upsert: true, new: true }
      );

      // Update products with collection reference
      await Product.updateMany(
        { _id: { $in: productObjectIds } },
        { $addToSet: { collections: collection.id } }
      );

      console.log(`Processed collection: ${collection.title} with ${productObjectIds.length} products`);
    }
  } catch (error) {
    console.error('Error processing collection batch:', error);
    throw error;
  }
}

/**
 * Main migration function with pagination
 */
async function migrateCollections() {
  console.log('Starting collections migration...');

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
      const data = await shopifyClient.query(collectionsQuery, { cursor });
      const collections = data.collections.edges.map(edge => edge.node);

      await processBatch(collections);

      hasNextPage = data.collections.pageInfo.hasNextPage;
      cursor = data.collections.pageInfo.endCursor;
      totalProcessed += collections.length;

      // Update the cursor state after each batch
      await updateCursorState(cursor, totalProcessed);

      console.log(`Processed ${totalProcessed} collections so far. Current cursor: ${cursor}`);

      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      console.error('Error during migration:', error);
      // Save the current state before breaking
      await updateCursorState(cursor, totalProcessed);
      break;
    }
  }

  console.log(`Migration completed. Total collections processed: ${totalProcessed}`);
  process.exit(0);
}

// Run migration
migrateCollections().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
}); 