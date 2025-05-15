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
 * Normalizes a string value for consistent comparison
 * Converts to lowercase, trims, and removes extra spaces
 */
const normalizeValue = (value) => {
  if (!value) return '';
  return value.toString().toLowerCase().trim().replace(/\s+/g, ' ');
};

/**
 * Processes and sorts filter result items
 * Merges same values with different cases and combines their counts
 */
const processResults = (items) => {
  // First, normalize and merge counts for same values
  const mergedCounts = items.reduce((acc, item) => {
    if (!item._id) return acc;
    
    const normalizedValue = normalizeValue(item._id);
    if (!normalizedValue) return acc;

    // Keep track of the original casing that has the highest count
    if (!acc[normalizedValue] || acc[normalizedValue].count < item.count) {
      acc[normalizedValue] = {
        value: item._id, // Keep original casing of the most frequent occurrence
        count: (acc[normalizedValue]?.count || 0) + item.count
      };
    } else {
      acc[normalizedValue].count += item.count;
    }
    
    return acc;
  }, {});

  // Convert to array and sort
  return Object.values(mergedCounts)
    .filter(item => item.count > 0)
    .sort((a, b) => {
      // Sort by count first (descending)
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      // Then alphabetically
      return normalizeValue(a.value).localeCompare(normalizeValue(b.value));
    });
};

/**
 * Get available filter options based on current search results
 * Returns filter options with counts based on current query context
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getProductFilters = async (req, res) => {
  const startTime = Date.now();
  try {
    const baseKey = 'filters';
    const cachedResult = filterCache.getHierarchical(baseKey, req.query);
    
    if (cachedResult) {
      console.log('Cache hit (hierarchical) - Response time:', Date.now() - startTime, 'ms');
      return res.json(cachedResult);
    }

    console.log('Cache miss - Building new response');
    
    // Get the current search query
    const currentQuery = await buildSharedQuery(req.query);
    queryPatternTracker.trackQuery(currentQuery);

    // Get the current search results count
    const currentResultCount = await Product.countDocuments(currentQuery);

    // Calculate filters based on current search results
    const filterResults = await Product.aggregate([
      // First match the current search criteria
      { $match: currentQuery },
      {
        $facet: {
          categories: [
            { $unwind: { path: '$categories', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$categories', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          collections: [
            { $unwind: { path: '$collections', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$collections', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          colors: [
            { $unwind: { path: '$attributes.color', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$attributes.color', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          sizes: [
            { $unwind: { path: '$attributes.size', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$attributes.size', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          materials: [
            { $unwind: { path: '$attributes.material', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$attributes.material', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          seasons: [
            { $unwind: { path: '$attributes.season', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$attributes.season', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          genders: [
            { $unwind: { path: '$attributes.gender', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$attributes.gender', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          productGroups: [
            { $match: { productGroup: { $ne: null } } },
            { $group: { _id: '$productGroup', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          productTypes: [
            { $match: { productType: { $ne: null } } },
            { $group: { _id: '$productType', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          brands: [
            { $match: { brand: { $ne: null } } },
            { $group: { _id: '$brand', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          fabrics: [
            { $unwind: { path: '$attributes.fabric', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$attributes.fabric', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          works: [
            { $unwind: { path: '$attributes.work', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$attributes.work', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
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
        currentResultCount,  // Number of products in current search
        appliedFilters: req.query,
        categories: processResults(result.categories),
        collections: processResults(result.collections),
        tags: req.query.tags ? req.query.tags.split(',').map(tag => ({
          value: tag.trim(),
          count: currentResultCount
        })) : [],
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
          max: Math.ceil(priceRange.maxPrice),
          appliedMin: req.query.minPrice ? parseFloat(req.query.minPrice) : undefined,
          appliedMax: req.query.maxPrice ? parseFloat(req.query.maxPrice) : undefined
        }
      }
    };

    // Store in hierarchical cache
    filterCache.setHierarchical(baseKey, req.query, response);
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