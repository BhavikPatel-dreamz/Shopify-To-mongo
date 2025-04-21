import Product from '../models/Product.js';
import { transformWebhookProduct } from '../migrations/products/webhookTransform.js';

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