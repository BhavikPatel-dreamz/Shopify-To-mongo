import express from 'express';
import { handleProductUpdate } from '../controllers/webhookController.js';
import verifyShopifyWebhook from '../middleware/verifyWebhook.js';

const router = express.Router();


// Product update webhook with verification
router.post('/product-update', 
  express.raw({type: 'application/json'}),
  //verifyShopifyWebhook,
  handleProductUpdate
);

export default router; 