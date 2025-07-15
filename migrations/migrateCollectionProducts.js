import 'dotenv/config';
import connectDB from '../config/database.js';
import { shopifyClient } from '../config/shopify.js';
import { collectionProductsQuery } from '../graphql/queries/collections.js';
import processBatch from './products/processBatch.js';
import MigrationState from '../models/MigrationState.js';
import Collection from '../models/Collection.js';
//import { productsQuery } from '../graphql/queries/products.js';


// Initialize MongoDB connection
await connectDB();

async function getLastCollectionCursor() {
  try {
    const state = await MigrationState.findOne({ name: 'shopify_collection_products' });
    return state?.lastCursor;
  } catch (error) {
    console.error('Error fetching last collection cursor:', error);
    return null;
  }
}

async function updateMigrationState(cursor, collection, totalProcessed) {
  try {
    await MigrationState.findOneAndUpdate(
      { name: 'shopify_collection_products' },
      {
        lastCursor: cursor,
        lastCollection: collection?.handle,
        lastRun: new Date(),
        totalProcessed
      },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error updating migration state:', error);
  }
}

async function migrateCollectionProducts(collectionHandle = '') {
  console.log('🛠 Starting collection-wise product migration...');
  console.log(collectionHandle ? `➡️ Filtering by collection: ${collectionHandle}` : '⚠️ Collection handle is missing');

  let hasNextPage = true;
  let cursor = await getLastCollectionCursor(collectionHandle); // assumes per-collection cursor
  let totalProcessed = 0;

  const variables = {
    handle: collectionHandle,
    cursor: null
  };

  while (hasNextPage) {
    try {
      variables.cursor = cursor;

      const response = await shopifyClient.query(collectionProductsQuery, variables);
      const collection = response?.collectionByHandle;
      //console.log(response?.collectionByHandle?.products?.edges);

      if (!collection || !collection.products?.edges?.length) {
        console.warn(`⚠️ Collection not found or has no products: "${collectionHandle}"`);
        break;
      }

      const products = collection.products.edges.map(edge => edge.node);
      console.log(products);

      console.log(`✅ Found ${products.length} products in collection: "${collection.title}"`);

      const success = await processBatch(products);
      if (success) {
        totalProcessed += products.length;
        console.log(`🔄 Total products processed so far: ${totalProcessed}`);
      }

      hasNextPage = collection.products.pageInfo.hasNextPage;
      cursor = collection.products.pageInfo.endCursor;

      // Save migration progress
      await updateMigrationState(cursor, { handle: collectionHandle }, totalProcessed);

      // Prevent Shopify rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error('❌ Error during migration:', error.message || error);
      await updateMigrationState(cursor, { handle: collectionHandle }, totalProcessed);
      break;
    }
  }

  console.log(`🎉 Migration completed for "${collectionHandle}". Total products: ${totalProcessed}`);
  process.exit(0);
}
// Usage examples:
// Migrate specific collection

async function migrateAllCollections() {
  // Migrate all collections

  console.log("Starting migration");
  
  
  const collections = await Collection.find({}).limit(10);
   for (const collection of collections) {
     await migrateCollectionProducts(collection.handle);
   }
   console.log("Migration completed");
   process.exit(0);

}

await migrateCollectionProducts('all-lehengas')
//await migrateAllCollections();

