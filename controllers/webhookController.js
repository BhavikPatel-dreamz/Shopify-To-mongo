import Product from '../models/Product.js';
import { transformWebhookProduct } from '../migrations/products/webhookTransform.js';
import Order from '../models/Order.js';
import Collection from '../models/Collection.js';

/**
 * Handle product update webhook from Shopify
 */
export const handleProductUpdate = async (req, res) => {
  try {
    // Verify Shopify webhook
    const shopifyHmac = req.headers['x-shopify-hmac-sha256'];
    if (!shopifyHmac) {
      return res.status(401).json({ error: 'Missing Shopify HMAC header' });
    }

    // Get the raw product data from webhook
    const shopifyProduct = req.body;

    console.log(shopifyProduct)
    //
    // const allCollections = await Collection.find({}, { title: 1, handle: 1 }).lean();

    // // Create a map for faster lookup: title -> handle
    // const collectionTitleToHandle = new Map();
    // allCollections.forEach(collection => {
    //   collectionTitleToHandle.set(collection.title, collection.handle);
    // });


    // Transform the product data
    const productData = transformWebhookProduct(shopifyProduct);
    let collectionHandles = [];

    if (productData.collections && Array.isArray(productData.collections)) {
      // Query only the needed collections by title
      const matchedCollections = await Collection.find(
        { title: { $in: productData.collections } },
        { title: 1, handle: 1 }
      ).lean();

      // Create a map for faster lookup: title -> handle
      const collectionTitleToHandle = new Map();
      matchedCollections.forEach(collection => {
        collectionTitleToHandle.set(collection.title, collection.handle);
      });

      productData.collections.forEach(collectionTitle => {
        if (collectionTitleToHandle.has(collectionTitle)) {
          const handle = collectionTitleToHandle.get(collectionTitle);
          collectionHandles.push(handle);
        } else {
          console.warn(`Collection not found in collections table: "${collectionTitle}"`);
        }
      });
    }

    // Add collection_handle array to product data
    productData.collection_handle = collectionHandles;

    // Update or create the product in database
    await Product.findOneAndUpdate(
      { shopifyId: productData.shopifyId },
      {
        ...productData,
        collection_handle: collectionHandles
      },
      {
        upsert: true,
        new: true,
        runValidators: false
      }
    );

    console.log(`Successfully updated product: ${productData.name}`);
    res.status(200).json({ success: true, message: "Successfully updated product" });

  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
};

export const handleProductDelete = async (req, res) => {
  try {
    const productData = req.body;

    await Product.findOneAndDelete({ productId: productData.id });

    res.status(200).json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
};

export const handleOrderUpdate = async (req, res) => {
  try {
    const orderData = req.body;

    // Extract line items from the order
    const lineItems = orderData.line_items || [];

    // Process each line item
    for (const item of lineItems) {
      // Check if order already exists
      const existingOrder = await Order.findOne({
        order_id: orderData.id,
        product_id: item.product_id.toString()
      });

      if (existingOrder) {
        // Update existing order
        existingOrder.quantity = item.quantity;
        existingOrder.orderNumber = orderData.order_number;
        existingOrder.updatedAt = new Date();
        await existingOrder.save();
      } else {
        // Create new order
        const order = new Order({
          product_id: item.product_id.toString(),
          order_id: orderData.id,
          orderNumber: orderData.order_number,
          quantity: item.quantity
        });

        await order.save();
      }
    }

    res.status(200).json({ message: 'Order data processed successfully' });
  } catch (error) {
    console.error('Error processing order update:', error);
    res.status(500).json({ error: 'Error processing order update' });
  }
};