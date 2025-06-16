import express from 'express';
import { handleProductUpdate,handalOrderWebhook} from '../controllers/webhookController.js';
import verifyShopifyWebhook from '../middleware/verifyWebhook.js';

const router = express.Router();


// Product update webhook with verification
router.post('/product-update', 
  express.raw({type: 'application/json'}),
  //verifyShopifyWebhook,
  handleProductUpdate
);
router.post('/order-webhook', 
  express.raw({type: 'application/json'}),
  handalOrderWebhook
);
export default router; 