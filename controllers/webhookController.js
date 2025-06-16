import Product from '../models/Product.js';
import { transformWebhookProduct } from '../migrations/products/webhookTransform.js';
import { transformWebhookOrder } from '../migrations/order/transformOrder.js'
import OrderProductCount from '../models/OrderProductCount.js';

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



    // Transform the product data
    const productData = transformWebhookProduct(shopifyProduct);

    // Update or create the product in database
    await Product.findOneAndUpdate(
      { shopifyId: productData.shopifyId },
      productData,
      {
        upsert: true,
        new: true,
        runValidators: true
      }
    );

    console.log(`Successfully updated product: ${productData.name}`);
    res.status(200).json({ success: true });

  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
};

export const handalOrderWebhook = async (req, res) => {
  try {
    const shopifyHmac = req.headers['x-shopify-hmac-sha256'];
    if (!shopifyHmac) {
      return res.status(401).json({ error: 'Missing Shopify HMAC header' });
    }

    // Get the raw product data from webhook
    const shopifyProduct = req.body;

    const orderData = transformWebhookOrder(shopifyProduct);

    for (const order of orderData) {
      await OrderProductCount.findOneAndUpdate(
        {
          order_id: order.order_id,
          product_id: order.product_id
        },
        order,
        {
          upsert: true,
          new: true,
          runValidators: true
        }
      )
    }
    console.log(`Successfully updated order`);
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
}