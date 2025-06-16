import express from 'express';
import { handleProductUpdate, handleOrderUpdate } from '../controllers/webhookController.js';
import verifyShopifyWebhook from '../middleware/verifyWebhook.js';

const router = express.Router();

// Product update webhook with verification
router.post('/product-update', 
  express.raw({type: 'application/json'}),
  //verifyShopifyWebhook,
  handleProductUpdate
);

// Order update webhook with verification
router.post('/order-update',
  express.raw({type: 'application/json'}),
  //verifyShopifyWebhook,
  handleOrderUpdate
);

export default router; 