import crypto from 'crypto';

const verifyShopifyWebhook = (req, res, next) => {
  try {
    const hmac = req.headers['x-shopify-hmac-sha256'];
    
    // Check if HMAC signature exists
    if (!hmac) {
      return res.status(401).json({ error: 'Missing Shopify HMAC signature' });
    }

    // Get raw body (ensure your Express app is configured to expose raw body)
    const rawBody = req.rawBody || JSON.stringify(req.body);
    
    if (!rawBody) {
      return res.status(401).json({ error: 'Missing request body' });
    }

    // Create hash using webhook secret
    const hash = crypto
      .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET)
      .update(rawBody, 'utf8')
      .digest('base64');

      res.status(401).json({ error: 'hasss '+hash });
    
    // Compare our computed hash with Shopify's hash
    if (crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac))) {
      // Valid webhook - proceed to next middleware
      next();
    } else {
      // Invalid webhook
      res.status(401).json({ error: 'Invalid webhook signature' });
    }
  } catch (error) {
    console.error('Webhook verification error:', error);
    res.status(500).json({ error: 'Webhook verification failed' });
  }
};

export default verifyShopifyWebhook; 