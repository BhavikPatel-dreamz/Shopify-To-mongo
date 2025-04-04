import express from 'express';
import recommendationController from '../controllers/recommendationController.js';
import userInteractionController from '../controllers/userInteractionController.js';
import embeddingController from '../controllers/embeddingController.js';
import productController from '../controllers/productController.js';

const router = express.Router();

// Recommendation routes
router.get('/recommend', recommendationController.getRecommendations);
router.get('/similar/:productId', recommendationController.getSimilarProducts);
router.get('/popular', recommendationController.getPopularProducts);
router.get('/search', recommendationController.searchProducts);
router.get('/filter', recommendationController.filterProducts);
router.get('/filterOptions', recommendationController.getFilterOptions);

//User interaction routes
router.post('/trackView', userInteractionController.trackView);
router.post('/likeProduct', userInteractionController.likeProduct);
router.post('/trackPurchase', userInteractionController.trackPurchase);

//Embedding routes
router.post('/embeddingSync', embeddingController.syncEmbeddings);

// // Product routes - new endpoints
router.get('/products', productController.getProducts);
router.get('/products/filters', productController.getProductFilters); 



export default router; 