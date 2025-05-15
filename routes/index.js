import express from 'express';
import recommendationController from '../controllers/recommendationController.js';
import userInteractionController from '../controllers/userInteractionController.js';
import embeddingController from '../controllers/embeddingController.js';
import productController from '../controllers/productController.js';
import filterController from '../controllers/filterController.js';

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

/**
 * Product & Filter Routes
 * 
 * GET /products
 * Returns paginated list of products with advanced filtering options
 * Query Parameters:
 * - page: Current page number (default: 1)
 * - limit: Items per page (default: 20)
 * - sort: Sorting option (featured, best_selling, price_asc, price_desc, etc.)
 * - search: Search term for product name/description
 * - category, color, size, material, season, gender, etc.: Filter attributes
 * - minPrice/maxPrice: Price range filters
 * 
 * GET /products/filters
 * Returns available filter options based on current product data
 * Includes:
 * - Categories, Collections
 * - Colors, Sizes, Materials, Seasons, Genders
 * - Product Groups, Types, Brands
 * - Price Ranges
 * - Available attribute values for current filter context
 * All responses are cached for performance optimization
 */
router.get('/products', productController.getProducts);
router.get('/products/filters', filterController.getProductFilters);

export default router; 