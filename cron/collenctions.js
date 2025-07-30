import cron from 'node-cron';

import { shopifyClient } from '../config/shopify.js';
import connectDB from '../config/database.js';

import Collection from '../models/Collection.js';
import CollectionState from '../models/CollectionState.js';
import SyncState from '../models/SyncState.js'; // New model for storing sync state
import { productsQuery } from '../graphql/queries/products.js';
import processBatch from '../migrations/products/processBatch.js';
import { collectionsQueryUpdate } from '../graphql/queries/collections.js';

// Function to save cursor state for resuming later
async function saveCursorState(collectionId, cursor, totalProcessed) {
  await SyncState.updateOne(
    { collectionId },
    { 
      $set: { 
        cursor, 
        totalProcessed, 
        lastUpdated: new Date(),
        status: 'in_progress'
      } 
    },
    { upsert: true }
  );
}

// Function to get saved cursor state
async function getCursorState(collectionId) {
  const state = await SyncState.findOne({ collectionId });
  return state || { cursor: null, totalProcessed: 0 };
}

// Function to mark sync as completed
async function markSyncCompleted(collectionId, totalProcessed) {
  await SyncState.updateOne(
    { collectionId },
    { 
      $set: { 
        cursor: null,
        totalProcessed,
        lastUpdated: new Date(),
        status: 'completed'
      } 
    },
    { upsert: true }
  );
}

async function fetchRecentCollections() {
  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const isoTime = fiveMinutesAgo.toISOString();
  console.log(`Fetching collections updated since: ${isoTime}`);

  let allCollections = [];
  let hasNextPage = true;
  let cursor = null;

  // Format the query string for Shopify
  const updatedSinceQuery = `updated_at:>=${isoTime}`;

  while (hasNextPage) {
    try {
      const data = await shopifyClient.query(collectionsQueryUpdate, { 
        cursor, 
        updatedSince: updatedSinceQuery 
      });
      
      if (!data || !data.collections || !data.collections.edges) {
        console.log('No collections data received');
        break;
      }

      const collections = data.collections.edges.map(edge => edge.node);

      // save collections to Db
      await saveCollectionsToDb(collections);

      hasNextPage = data.collections.pageInfo.hasNextPage;
      cursor = data.collections.pageInfo.endCursor;

      console.log(`Fetched ${collections.length} collections in this batch, total: ${allCollections.length}`);

      // Add delay to avoid rate limiting
      if (hasNextPage) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
    } catch (error) {
      console.error('Error fetching collections from Shopify:', error);
      throw error;
    }
  }

  return allCollections;
}

async function saveCollectionsToDb(collections) {
  console.log(`Saving ${collections.length} collections to the database...`);

  try {
    // Process collections in batches to avoid overwhelming the database
    const batchSize = 10;
    const batches = [];
    
    for (let i = 0; i < collections.length; i += batchSize) {
      batches.push(collections.slice(i, i + batchSize));
    }

    let totalSaved = 0;
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} collections)`);
      
      // Process batch operations in parallel
      const batchOperations = batch.map(collection => 
        Collection.updateOne(
          { id: collection.id },
          { $set: collection },
        )
      );
      
      await Promise.all(batchOperations);
      totalSaved += batch.length;
      
      console.log(`Batch ${batchIndex + 1} completed. Total saved so far: ${totalSaved}/${collections.length}`);
      
      // Add delay between batches to avoid overwhelming the database
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`Successfully saved all ${totalSaved} collections to the database.`);
  } catch (error) {
    console.error('Error saving collections to database:', error);
    throw error;
  }
}

async function syncProductsForCollection(collectionId) {
  console.log(`Starting product sync for collection: ${collectionId}`);

  // Get saved state to resume from where we left off
  const savedState = await getCursorState(collectionId);
  let { cursor, totalProcessed } = savedState;

  let hasNextPage = true;

  // Log the starting point
  if (cursor) {
    console.log(`Resuming migration from cursor: ${cursor}, already processed: ${totalProcessed}`);
  } else {
    console.log('Starting new migration from the beginning');
  }

  const updatedAtQuery = `collection_id:${collectionId}`;

  while (hasNextPage) {
    try {
      console.log(`Fetching products batch with cursor: ${cursor || 'null'}`);
      
      // If cursor is null, it will start from the beginning
      const data = await shopifyClient.query(productsQuery, { cursor, updatedAtQuery });
      
      if (!data || !data.products || !data.products.edges) {
        console.log('No products data received, ending sync');
        break;
      }

      const products = data.products.edges.map(edge => edge.node);
      
      if (products.length === 0) {
        console.log('No products in this batch, ending sync');
        break;
      }

      console.log(`Processing batch of ${products.length} products...`);
      await processBatch(products);

      hasNextPage = data.products.pageInfo.hasNextPage;
      cursor = data.products.pageInfo.endCursor;
      totalProcessed += products.length;

      // Save progress after each batch
      await saveCursorState(collectionId, cursor, totalProcessed);
      
      console.log(`Processed ${totalProcessed} products so far for collection ${collectionId}.`);

      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      console.error(`Error during product sync for collection ${collectionId}:`, error);
      
      // Save current state before breaking
      await saveCursorState(collectionId, cursor, totalProcessed);
      
      // Don't exit the entire process, just break this collection's sync
      break;
    }
  }

  // Mark sync as completed
  await markSyncCompleted(collectionId, totalProcessed);
  console.log(`Product sync completed for collection ${collectionId}. Total products processed: ${totalProcessed}`);
  // If no more pages, delete the collection state
  if (!hasNextPage || cursor === null) {
    console.log(`No more products to process for collection ${collectionId}. Deleting collection state...`);
    await CollectionState.deleteOne(
      { id: collectionId },
    );
  }
}

async function processCollections() {
  try {

      const collections = await CollectionState.find();
      // Process each collection's products
    for (const collection of collections) {
      console.log(`Processing collection: ${collection.title} (${collection.id})`);

      try {
       const existingCollection = await Collection.findOne({ handle: collection.handle });
        
        if (!existingCollection) {
           await Collection.create({
            handle: collection.handle,
            title: collection.title,
            descriptionHtml: collection.body_html || '',
            shopifyId: `gid://shopify/Collection/${collection.id}`,
          });
          console.log(`Added new collection: ${collection.handle}`);
        }
        // Sync products for this collection
        await syncProductsForCollection(collection.id);
      } catch (error) {
        console.error(`Failed to sync products for collection ${collection.id}:`, error);
        // Continue with next collection instead of stopping everything
        continue;
      }
    }

    console.log('All collections processed successfully.');

  } catch (error) {
    console.error('Error in processCollections:', error);
    throw error;
  }
}

// Function to resume incomplete syncs on startup
async function resumeIncompleteSyncs() {
  try {
    await connectDB();

    // Find all collections with incomplete syncs
    const incompleteSyncs = await SyncState.find({ status: 'in_progress' });

    if (incompleteSyncs.length > 0) {
      console.log(`Found ${incompleteSyncs.length} incomplete syncs to resume...`);

      for (const syncState of incompleteSyncs) {
        console.log(`Resuming sync for collection: ${syncState.collectionId}`);
        try {
          await syncProductsForCollection(syncState.collectionId);
        } catch (error) {
          console.error(`Failed to resume sync for collection ${syncState.collectionId}:`, error);
        }
      }
    } else {
      console.log('No incomplete syncs found.');
    }
  } catch (error) {
    console.error('Error resuming incomplete syncs:', error);
  }
}

// If running as a script (not scheduled), process collections once
if (process.argv[2] === 'run-once') {
  processCollections()
    .then(() => {
      console.log('Single run completed.');
      process.exit(0);
    })
    .catch(error => {
      console.error('Single run failed:', error);
      process.exit(1);
    });
}

// If running as a script with resume flag
if (process.argv[2] === 'resume') {
  resumeIncompleteSyncs()
    .then(() => {
      console.log('Resume completed.');
      process.exit(0);
    })
    .catch(error => {
      console.error('Resume failed:', error);
      process.exit(1);
    });
}

// Schedule the cron job to run every 5 minutes (adjust as needed)
export const startCollectionJob = () => {
  cron.schedule('*/5 * * * *', () => {
    console.log('Running scheduled collection sync...');
    processCollections().catch(console.error);
  });
};


// Start initial processing and resume any incomplete syncs on startup
(async () => {
  try {
    console.log('Starting initial collection processing...');
    await processCollections();
    
    console.log('Resuming any incomplete syncs...');
    await resumeIncompleteSyncs();
  } catch (error) {
    console.error('Error during startup:', error);
  }
})();

export default startCollectionJob;
