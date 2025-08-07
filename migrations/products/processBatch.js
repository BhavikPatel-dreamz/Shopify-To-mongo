import Product from '../../models/Product.js';
import Collection from '../../models/Collection.js';
import * as embeddingService from '../../services/embeddingService.js';
import * as vectorService from '../../services/vectorService.js';
import { transformProduct } from './transformProduct.js';
import { getProductsCollectionsHanls } from '../../utils/comman.js';
import fs from 'fs/promises';
import path from 'path';

// ----Old code for processing a batch of products
// async function processBatch(products) {
//   console.log(`Processing batch of ${products.length} products...`);
  
  
  
//   for (const shopifyProduct of products) {
//     try {
//       // Transform Shopify product to our schema
//       const productData = transformProduct(shopifyProduct);
//       console.log('Transformed Product Data:', productData);
//       // Save or update product in MongoDB
//       const product = await Product.findOneAndUpdate(
//         { shopifyId: productData.shopifyId },
//         {
//           ...productData,
//         },
//         {
//           upsert: true,
//           new: true
//         }
//       );

//      // console.log(`Product updated with ${collection_handle.length} collection handles:`, collection_handle);

//       // console.log('Saved Product:', {
//       //   id: product._id,
//       //   shopifyId: product.shopifyId,
//       //   name: product.name,
//       //   hasEmbedding: product.hasEmbedding
//       // });

//       // Generate and store embedding if needed
//       // if (!product.hasEmbedding) {
//       //   try {
//       //     // Format product text for embedding
//       //     // const productText = embeddingService.formatProductForEmbedding(product);
//       //     // console.log('Product Text for Embedding:', productText);
          
//       //     // // Generate embedding
//       //     // const embedding = await embeddingService.generateEmbedding(productText);
//       //     // console.log('Generated Embedding Length:', embedding.length);

//       //     // // Store embedding in Pinecone
//       //     // await vectorService.storeProductEmbedding(product, embedding);
//       //     // console.log('Embedding stored in Pinecone');
          
//       //     // // Update product status
//       //     // await Product.findByIdAndUpdate(product._id, {
//       //     //   hasEmbedding: true,
//       //     //   vectorId: product._id.toString()
//       //     // });

//       //     console.log(`✅ Successfully processed product: ${product.name}`);
//       //   } catch (embeddingError) {
//       //     console.error('Error in embedding process:', embeddingError);
//       //     // Continue with next product even if embedding fails
//       //   }
//       // } else {
//       //   console.log(`Skipping embedding generation for ${product.name} - already exists`);
//       // }
//     } catch (error) {
//       console.error('Error processing product:', {
//         title: shopifyProduct.title,
//         error: error.message,
//         stack: error.stack
//       });
//     }
//   }
// }

async function processBatch(products) {

  const batchStartTime = new Date();
  const batchId = generateBatchId();

  // Arrays to store results
  const failedProducts = [];
  const successfulProducts = [];
  const batchResults = [];
  
  for (let i = 0; i < products.length; i++) {
    const shopifyProduct = products[i];
    const productStartTime = new Date();
    
    const productResult = {
      index: i + 1,
      shopifyId: shopifyProduct.id,
      title: shopifyProduct.title,
      status: 'processing',
      startTime: productStartTime.toISOString(),
      batchId: batchId
    };
    
    try {
      // Transform Shopify product to our schema
      let productData;
      try {
        productData = transformProduct(shopifyProduct);
        productResult.transformStatus = 'success';
        console.log('Transformed Product Data:', productData);
      } catch (transformError) {
        const errorInfo = {
          batchId,
          productIndex: i + 1,
          shopifyId: shopifyProduct.id,
          title: shopifyProduct.title,
          type: 'transformation_error',
          error: `Product transformation failed: ${transformError.message}`,
          shopifyProduct,
          transformError: {
            message: transformError.message,
            stack: transformError.stack
          },
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - productStartTime.getTime()
        };
        
        productResult.status = 'failed';
        productResult.error = transformError.message;
        productResult.errorType = 'transformation_error';
        
        failedProducts.push(errorInfo);
        console.error(`Transform failed for product ${shopifyProduct.id}: ${transformError.message}`);
        continue; // Skip to next product
      }
      
      // Save or update product in MongoDB
      let product;
      try {
        product = await Product.findOneAndUpdate(
          { shopifyId: productData.shopifyId },
          { ...productData },
          {
            upsert: true,
            new: true
          }
        );
        
        if (product) {
          productResult.status = 'success';
          productResult.mongoId = product._id;
          productResult.operation = product.isNew ? 'created' : 'updated';
          
          successfulProducts.push({
            shopifyId: productData.shopifyId,
            title: shopifyProduct.title,
            mongoId: product._id,
            operation: productResult.operation
          });
          
          console.log(`✅ Successfully processed product: ${productData.shopifyId}`);
        } else {
          throw new Error('Product was not saved/updated despite no error thrown');
        }
        
      } catch (dbError) {
        const errorInfo = {
          batchId,
          productIndex: i + 1,
          shopifyId: productData.shopifyId,
          title: shopifyProduct.title,
          type: 'database_error',
          error: `Database operation failed: ${dbError.message}`,
          dbError: {
            message: dbError.message,
            stack: dbError.stack,
            code: dbError.code
          },
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - productStartTime.getTime()
        };
        
        productResult.status = 'failed';
        productResult.error = dbError.message;
        productResult.errorType = 'database_error';
        
        failedProducts.push(errorInfo);
        console.error(`Database error for product ${productData.shopifyId}: ${dbError.message}`);
      }
      
    } catch (error) {
      // Catch any unexpected errors
      const errorInfo = {
        batchId,
        productIndex: i + 1,
        productId: shopifyProduct.id,
        title: shopifyProduct.title,
        type: 'unexpected_error',
        error: `Unexpected error: ${error.message}`,
        unexpectedError: {
          message: error.message,
          stack: error.stack,
          name: error.name
        },
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - productStartTime.getTime()
      };
      
      productResult.status = 'failed';
      productResult.error = error.message;
      productResult.errorType = 'unexpected_error';
      
      failedProducts.push(errorInfo);
      console.error('Unexpected error processing product:', {
        title: shopifyProduct.title,
        error: error.message,
        stack: error.stack
      });
    }
    
    productResult.endTime = new Date().toISOString();
    productResult.processingTime = Date.now() - productStartTime.getTime();
    batchResults.push(productResult);
  }
  
  const batchEndTime = new Date();
  const totalProcessingTime = batchEndTime.getTime() - batchStartTime.getTime();
  
  // Generate batch summary
  const batchSummary = {
    batchId,
    startTime: batchStartTime.toISOString(),
    endTime: batchEndTime.toISOString(),
    totalProcessingTime,
    totalProducts: products.length,
    successfulProducts: successfulProducts.length,
    failedProducts: failedProducts.length,
    successRate: `${((successfulProducts.length / products.length) * 100).toFixed(2)}%`,
    averageProcessingTime: Math.round(totalProcessingTime / products.length)
  };
  
  // Log batch results to files
  if (failedProducts.length > 0) {
    await logBatchErrors(failedProducts, batchSummary);
  }
  

  return {
    success: failedProducts.length === 0,
    batchId,
    batchSummary,
    failedProducts: failedProducts.map(fp => ({
      ShopifyId: fp.ShopifyId,
      title: fp.title,
      error: fp.error,
      type: fp.type
    })),
    successfulProducts,
    processedCount: successfulProducts.length,
    totalCount: products.length,
    processingTime: totalProcessingTime
  };
}

// Generate unique batch ID for tracking
function generateBatchId() {
  return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

// Log batch processing errors to file
async function logBatchErrors(failedProducts, batchSummary) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `batch-errors-${timestamp.split('T')[0]}.json`;
    const filePath = path.join(process.cwd(), 'logs', 'batch-processing', fileName);
    
    // Ensure logs directory exists
    try {
      await fs.mkdir(path.join(process.cwd(), 'logs', 'batch-processing'), { recursive: true });
    } catch (mkdirError) {
      if (mkdirError.code !== 'EEXIST') {
        console.warn('Could not create batch logs directory:', mkdirError.message);
      }
    }
    
    let existingLogs = [];
    try {
      const existingData = await fs.readFile(filePath, 'utf8');
      existingLogs = JSON.parse(existingData);
    } catch (readError) {
      // File doesn't exist yet, start with empty array
    }
    
    const batchErrorLog = {
      batchSummary,
      errors: failedProducts,
      loggedAt: new Date().toISOString()
    };
    
    existingLogs.push(batchErrorLog);
    
    await fs.writeFile(filePath, JSON.stringify(existingLogs, null, 2));
    console.log(`Batch errors logged to: ${filePath}`);
    
    // Also generate CSV for quick viewing
    await generateBatchErrorCSV(failedProducts, batchSummary, timestamp);
    
  } catch (logError) {
    console.error('Failed to log batch errors:', logError);
  }
}

async function generateBatchErrorCSV(failedProducts, batchSummary, timestamp) {
  try {
    const csvFileName = `batch-errors-${timestamp.split('T')[0]}.csv`;
    const csvFilePath = path.join(process.cwd(), 'logs', 'batch-processing', csvFileName);
    
    const csvHeader = 'Batch ID,Product Index,Shopify ID,Product Title,Error Type,Error Message,Processing Time (ms),Timestamp\n';
    const csvRows = failedProducts.map(product => 
      `"${batchSummary.batchId}","${product.productIndex}","${product.shopifyId}","${(product.title || '').replace(/"/g, '""')}","${product.type}","${(product.error || '').replace(/"/g, '""')}","${product.processingTime}","${product.timestamp}"`
    ).join('\n');
    
    const csvContent = csvHeader + csvRows;
    await fs.writeFile(csvFilePath, csvContent);
    console.log(`Batch error CSV generated: ${csvFilePath}`);
  } catch (csvError) {
    console.error('Error generating batch CSV file:', csvError);
  }
}


export default processBatch; 