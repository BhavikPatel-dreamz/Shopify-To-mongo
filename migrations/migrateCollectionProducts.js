import 'dotenv/config';
import connectDB from '../config/database.js';
import { shopifyClient } from '../config/shopify.js';
import { collectionProductsQuery, collectionsQuery } from '../graphql/queries/collections.js';
import processBatch from './products/processBatch.js';
import MigrationState from '../models/MigrationState.js';
import Collection from '../models/Collection.js';
import { productsQuery } from '../graphql/queries/products.js';


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
  console.log('Starting collection-wise product migration...');
  console.log(collectionHandle ? `Filtering by collection: ${collectionHandle}` : 'Processing all collections');
  
  let hasNextPage = true;
  let cursor = await getLastCollectionCursor();
  let totalProcessed = 0;
  console.log(cursor)
  const updatedAtQuery = `collection:handle:"${collectionHandle}"`;
  console.log(updatedAtQuery)


  while (hasNextPage) {
    try {
  
      // Query collection products with pagination


      const data = await shopifyClient.query(collectionProductsQuery, { cursor,updatedAtQuery });

      console.log("data",data);

      // Extract collection data
      // const collection = data.collectionByHandle;
      // if (!collection) {
      //   console.error(`Collection not found: ${collectionHandle}`);
      //   break;
      // }

      // // Process products from the collection
      // const products = collection.products.edges.map(edge => edge.node);
      // console.log(`\nProcessing ${products.length} products from collection: ${collection.title}`);
      
      // const success = await processBatch(products);
      // if (success) {
      //   totalProcessed += products.length;
      //   console.log(`Successfully processed ${totalProcessed} products total`);
      // }

      // // Update pagination info
      // hasNextPage = collection.products.pageInfo.hasNextPage;
      // cursor = collection.products.pageInfo.endCursor;

      // // Update migration state
      // await updateMigrationState(cursor, { handle: collectionHandle }, totalProcessed);

      // // Add delay to avoid rate limiting
      // await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error('Error during migration:', error);
      await updateMigrationState(cursor, { handle: collectionHandle }, totalProcessed);
      break;
    }
  }

  console.log(`\nMigration completed. Total products processed: ${totalProcessed}`);
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

