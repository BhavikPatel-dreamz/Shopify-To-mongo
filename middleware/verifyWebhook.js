import crypto from 'crypto';

const verifyShopifyWebhook = (req, res, next) => {
  try {
    const hmac = req.headers['x-shopify-hmac-sha256'];
    const body = req.body;
    
    if (!hmac || !body) {
      return res.status(401).json({ error: 'Missing signature or body' });
    }

    // Get raw body as buffer
    const rawBody = req.rawBody;
    
    // Create hash using your webhook secret
    const hash = crypto
      .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET)
      .update(rawBody, 'utf8')
      .digest('base64');
    
    // Compare our hash with Shopify's hash
    if (hash === hmac) {
      // Valid webhook
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