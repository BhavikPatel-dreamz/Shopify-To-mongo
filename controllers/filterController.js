import Product from '../models/Product.js';
import { queryPatternTracker } from '../models/Product.js';
import AdvancedCache from '../utils/AdvancedCache.js';
import { buildSharedQuery } from './productController.js';
import { generateCacheKey } from '../utils/comman.js';

/**
 * Cache Configuration
 * 
 * filterCache: Stores computed filter results
 * - Capacity: 2000 entries
 * - TTL: 30 minutes
 * - Cleanup: Every 5 minutes
 * 
 * countCache: Stores total product counts
 * - Capacity: 100 entries
 * - TTL: 5 minutes
 * - Cleanup: Every minute
 */
const filterCache = new AdvancedCache({
  maxSize: 2000,
  timeout: 30 * 60 * 1000, // 30 minutes
  cleanupInterval: 5 * 60 * 1000 // 5 minutes
});

const countCache = new AdvancedCache({
  maxSize: 100,
  timeout: 5 * 60 * 1000, // 5 minutes
  cleanupInterval: 60 * 1000 // 1 minute
});



/**
 * Processes and sorts filter result items
 * @param {Array} items - Array of MongoDB aggregation results
 * @returns {Array} Sorted array of unique filter values
 */
const processResults = (items) => {
  return items
    .map(item => item._id)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
};

/**
 * Get available filter options based on product data
 * 
 * Features:
 * - Caches results for performance optimization
 * - Uses MongoDB aggregation for efficient filtering
 * - Tracks query patterns for optimization
 * - Provides comprehensive filter options
 * - Handles error cases gracefully
 * 
 * Response includes:
 * - Total available products count
 * - Categories and collections
 * - Product attributes (color, size, etc.)
 * - Price ranges
 * - Brand and type information
 * 
 * Performance optimizations:
 * - Uses caching for both filter results and counts
 * - Implements cleanup for memory management
 * - Uses efficient MongoDB aggregation
 * - Tracks execution time for monitoring
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getProductFilters = async (req, res) => {
  const startTime = Date.now();
  try {
    const cacheKey = generateCacheKey(req.query);
    
    if (filterCache.isValid(cacheKey)) {
      console.log('Cache hit - Response time:', Date.now() - startTime, 'ms');
      return res.json(filterCache.get(cacheKey));
    }

    console.log('Cache miss - Building new response');
    
    const query = await buildSharedQuery(req.query);
    queryPatternTracker.trackQuery(query);

    const countKey = 'total_count';
    let totalAvailableProducts;
    
    if (countCache.isValid(countKey)) {
      totalAvailableProducts = countCache.get(countKey);
    } else {
      totalAvailableProducts = await Product.countDocuments({ isAvailable: true });
      countCache.set(countKey, totalAvailableProducts);
    }

    const filterResults = await Product.aggregate([
      { $match: query },
      {
        $facet: {
          categories: [
            { $unwind: { path: '$categories', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$categories', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $project: { _id: 1 } }
          ],
          collections: [
            { $unwind: { path: '$collections', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$collections', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $project: { _id: 1 } }
          ],
          colors: [
            { $unwind: { path: '$attributes.color', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$attributes.color', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $project: { _id: 1 } }
          ],
          sizes: [
            { $unwind: { path: '$attributes.size', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$attributes.size', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $project: { _id: 1 } }
          ],
          materials: [
            { $unwind: { path: '$attributes.material', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$attributes.material', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $project: { _id: 1 } }
          ],
          seasons: [
            { $unwind: { path: '$attributes.season', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$attributes.season', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $project: { _id: 1 } }
          ],
          genders: [
            { $unwind: { path: '$attributes.gender', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$attributes.gender', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $project: { _id: 1 } }
          ],
          productGroups: [
            { $match: { productGroup: { $ne: null } } },
            { $group: { _id: '$productGroup', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $project: { _id: 1 } }
          ],
          productTypes: [
            { $match: { productType: { $ne: null } } },
            { $group: { _id: '$productType', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $project: { _id: 1 } }
          ],
          brands: [
            { $match: { brand: { $ne: null } } },
            { $group: { _id: '$brand', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $project: { _id: 1 } }
          ],
          fabrics: [
            { $unwind: { path: '$attributes.fabric', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$attributes.fabric', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $project: { _id: 1 } }
          ],
          works: [
            { $unwind: { path: '$attributes.work', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$attributes.work', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $project: { _id: 1 } }
          ],
          priceRange: [
            {
              $group: {
                _id: null,
                minPrice: { $min: '$price' },
                maxPrice: { $max: '$price' }
              }
            }
          ]
        }
      }
    ]).option({ 
      maxTimeMS: 30000,
      allowDiskUse: true
    });

    const result = filterResults[0];
    const priceRange = result.priceRange[0] || { minPrice: 0, maxPrice: 1000 };

    const response = {
      success: true,
      data: {
        totalAvailableProducts,
        categories: processResults(result.categories),
        collections: processResults(result.collections),
        tags: req.query.tags ? req.query.tags.split(',').sort() : [],
        attributes: {
          colors: processResults(result.colors),
          sizes: processResults(result.sizes),
          materials: processResults(result.materials),
          seasons: processResults(result.seasons),
          genders: processResults(result.genders),
          fabrics: processResults(result.fabrics),
          works: processResults(result.works)
        },
        productGroups: processResults(result.productGroups),
        productTypes: processResults(result.productTypes),
        brands: processResults(result.brands),
        priceRange: {
          min: Math.floor(priceRange.minPrice),
          max: Math.ceil(priceRange.maxPrice)
        }
      }
    };

    filterCache.set(cacheKey, response);
    console.log('Total response time:', Date.now() - startTime, 'ms');
    res.json(response);

  } catch (error) {
    console.error('Error fetching product filters:', error);
    console.error('Error occurred after:', Date.now() - startTime, 'ms');
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product filters',
      message: error.message
    });
  }
};

export default {
  getProductFilters
}; 