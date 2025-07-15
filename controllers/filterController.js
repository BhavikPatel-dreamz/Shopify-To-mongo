import Product from '../models/Product.js';
import { queryPatternTracker } from '../models/Product.js';
import AdvancedCache from '../utils/AdvancedCache.js';
import { buildSharedQuery } from './productController.js';

/**
 * Cache Configuration
 * 
 * filterCache: Stores computed filter results
 * - Capacity: 2000 entries
 * - TTL: 5 days
 * - Cleanup: Every 5 minutes
 */
const filterCache = new AdvancedCache({
  maxSize: 2000,
  timeout: 5 * 24 * 60 * 60 * 1000, // 5 days
  cleanupInterval: 5 * 60 * 1000 // 5 minutes
});

// Helper function to generate a consistent cache key for filters
const generateFilterCacheKey = (filters) => {
  // Sort the filter keys to ensure consistent ordering
  const sortedFilters = {};
  Object.keys(filters).sort().forEach(key => {
    // Convert arrays to sorted strings
    if (Array.isArray(filters[key])) {
      sortedFilters[key] = filters[key].sort().join(',');
    } else {
      sortedFilters[key] = filters[key];
    }
  });
  return `filters:${JSON.stringify(sortedFilters)}`;
};

/**
 * Normalizes a string value for consistent comparison
 * Converts to lowercase, trims, and removes extra spaces
 */
const normalizeValue = (value) => {
  if (!value) return '';
  if ('all-lehengas' === value) return "All Lehenga's";
      else {
        const normalized = value
          .replaceAll('-', ' ')       // "all-lehengas" → "all lehengas"
          .replace(/'s$/i, '')        // remove trailing 's
          .replace(/s$/i, '')         // remove plural s
          .trim()
          .toLowerCase();

        return new RegExp(`^${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      }
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
    // Remove pagination and sorting from filter cache key
    const { page, limit, sort, order, ...filterParams } = req.query;
    
    // Generate specific cache key for filters
    const cacheKey = generateFilterCacheKey(filterParams);
    
    // Try to get from cache
    const cachedResult = filterCache.get(cacheKey);
    if (cachedResult && filterCache.isValid(cacheKey)) {
      console.log('Cache hit - Response time:', Date.now() - startTime, 'ms');
      return res.json(cachedResult);
    }

    console.log('Cache miss - Building new response');
    
    const currentQuery = await buildSharedQuery(filterParams);
    queryPatternTracker.trackQuery(currentQuery);

    // Get the current search results count
    const currentResultCount = await Product.countDocuments(currentQuery);
    const queryWithoutPrice = { ...currentQuery };
    delete queryWithoutPrice.price;

    const baseQueryWithoutBrand = { ...currentQuery };
    delete baseQueryWithoutBrand.brand;

    const priceStats = await Product.aggregate([
      { $match: queryWithoutPrice },
      {
        $group: {
          _id: null,
          minPrice: { $min: "$price" },
          maxPrice: { $max: "$price" }
        }
      }
    ]);
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

    const allBrandsWithCounts = await Product.aggregate([
      { $match: { ...baseQueryWithoutBrand, isAvailable: true } },
      // Group by brand and count
      {
        $group: {
          _id: '$brand',
          count: { $sum: 1 }
        }
      },
      // Sort by count descending
      { $sort: { count: -1 } },
      // Filter out null brands
      { $match: { _id: { $ne: null } } }
    ]).option({
      maxTimeMS: 15000,
      allowDiskUse: true
    });

    const result = filterResults[0];
    const priceRange = priceStats[0] || { minPrice: 0, maxPrice: 1000 };

    const selectedBrands = filterParams.brand ?
      filterParams.brand.split(',').map(b => b.trim()) : [];

    const brandsWithSelection = allBrandsWithCounts.map(brand => ({
      value: brand._id,
      count: brand.count,
      selected: selectedBrands.includes(brand._id)
    }));
    const response = {
      success: true,
      data: {
        currentResultCount,
        appliedFilters: filterParams,  // Use filterParams instead of req.query
        categories: processResults(result.categories),
        collections: processResults(result.collections),
        tags: filterParams.tags ? filterParams.tags.split(',').map(tag => ({
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
        brands: brandsWithSelection,
        priceRange: {
          min: Math.floor(priceRange.minPrice),
          max: Math.ceil(priceRange.maxPrice),
          appliedMin: filterParams.minPrice ? parseFloat(filterParams.minPrice) : undefined,
          appliedMax: filterParams.maxPrice ? parseFloat(filterParams.maxPrice) : undefined
        }
      }
    };

    // Store in cache
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