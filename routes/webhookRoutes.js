import express from 'express';
import { handleProductUpdate, handleOrderUpdate, handleProductDelete,handleCollectionUpdate } from '../controllers/webhookController.js';
import verifyShopifyWebhook from '../middleware/verifyWebhook.js';

const router = express.Router();

// Product update webhook with verification
router.post('/product-update', 
  express.raw({type: 'application/json'}),
  //verifyShopifyWebhook,
  handleProductUpdate
);
router.post('/product-delete', 
  express.raw({type: 'application/json'}),
  //verifyShopifyWebhook,
  handleProductDelete
);

// Order update webhook with verification
router.post('/order-update',
  express.raw({type: 'application/json'}),
  //verifyShopifyWebhook,
  handleOrderUpdate
);

router.post('/collection-update',
  express.raw({type: 'application/json'}),
  //verifyShopifyWebhook,
  handleCollectionUpdate
);
export default router;