import 'dotenv/config';
import Order from '../models/Order.js';
import connectDB from '../config/database.js';
import { shopifyClient } from '../config/shopify.js';
import { ordersQuery } from '../graphql/queries/orders.js';
import MigrationState from '../models/MigrationState.js';
import cron from 'node-cron';
import mongoose from 'mongoose';

// Define OrderIndex model if not already defined
const orderIndexSchema = new mongoose.Schema({
  order_id: { type: Number, required: true, unique: true },
  totalQuantity: { type: Number, required: true }
});
const OrderIndex = mongoose.models.OrderIndex || mongoose.model('OrderIndex', orderIndexSchema);

// Get the last saved cursor state for orders
async function getLastCursor() {
  try {
    const state = await MigrationState.findOne({ name: 'shopify_orders' });
    return state?.lastCursor;
  } catch (error) {
    console.error('Error fetching last cursor:', error);
    return null;
  }
}

// Update the cursor state for orders
async function updateCursorState(cursor, totalProcessed) {
  try {
    await MigrationState.findOneAndUpdate(
      { name: 'shopify_orders' },
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

async function syncShopifyOrders() {
  await connectDB();
  let hasNextPage = true;
  let cursor = await getLastCursor();
  let totalProcessed = 0;
  // migration code for orders
  //  const sixMonthsAgo = new Date();
  // sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  // const createdAtQuery = `created_at:>=${sixMonthsAgo.toISOString().split('T')[0]}`;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const createdAtQuery = `created_at:>=${yesterday.toISOString().split('T')[0]}`; // YYYY-MM-DD 
  
  if (cursor) {
    console.log('Resuming order migration from cursor:', cursor);
  } else {
    console.log('Starting new order migration from the beginning');
  }

  while (hasNextPage) {
    try {
      const data = await shopifyClient.query(ordersQuery, { cursor, createdAtQuery });
      const orders = data.orders.edges;

      // Check if we actually have orders
      if (!orders || orders.length === 0) {
        console.log('No orders found in this batch');
        break;
      }

      for (const edge of orders) {
        const order = edge.node;
        let orderTotalQty = 0;

        for (const itemEdge of order.lineItems.edges) {
          const item = itemEdge.node;
          console.log(order.createdAt)
          if (item.product) {
            orderTotalQty += item.quantity;
            await Order.findOneAndUpdate(
              {
                order_id: Number(order.id.split('/').pop()),
                product_id: item.product.id.split('/').pop(),
              },
              {
                $set: {
                  order_id: Number(order.id.split('/').pop()),       // Make sure it's a Number
                  product_id: item.product.id.split('/').pop(),      // Keep as String
                  quantity: item.quantity,
                  createdAt: new Date(order.createdAt),              // Convert to JS Date
                  updatedAt: new Date()
                },
              },
              { upsert: true }
            );
          }

        }
        // Upsert order index with total quantity
        await OrderIndex.findOneAndUpdate(
          { order_id: Number(order.id.split('/').pop()) },
          { $set: { order_id: Number(order.id.split('/').pop()), totalQuantity: orderTotalQty } },
          { upsert: true }
        );
        totalProcessed++;
       }
      hasNextPage = data.orders.pageInfo.hasNextPage;
      cursor = orders.length ? orders[orders.length - 1].cursor : null;
      await updateCursorState(cursor, totalProcessed);
      console.log(`Processed batch, next cursor: ${cursor}`);
    } catch (error) {
      console.error('Error during order migration:', error);
      await updateCursorState(cursor, totalProcessed);
      break;
    }
  }
  
  console.log(`Shopify order sync complete. Total processed: ${totalProcessed}`);
}

// Run migration
// syncShopifyOrders().catch(error => {
//   console.error('Migration failed:', error);
//   process.exit(1);
// }); 

//Run daily at midnight
export const startOrderAddedJob = () => {
  cron.schedule('0 0 * * *', syncShopifyOrders);
  console.log('Order added job scheduled');
};