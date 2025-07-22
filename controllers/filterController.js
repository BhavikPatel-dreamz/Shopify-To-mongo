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

  // Standard normalization - always return a string
  const normalized = value
    .toString()
    .replace(/-/g, ' ')          // Replace all hyphens with spaces
    .replace(/'s$/i, '')         // Remove trailing 's
    .replace(/s$/i, '')          // Remove plural s
    .trim()
    .toLowerCase()
    .replace(/\b(?!\$)(\d+)\b/g, '$$$1');  // Add $ sign before numbers only if not already present
  return normalized;
};

/**
 * Creates a regex pattern for matching normalized values
 */
const createNormalizedRegex = (value) => {
  if (!value) return null;

  const normalized = normalizeValue(value);
  if (!normalized) return null;

  // Escape special regex characters
  const escapedValue = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escapedValue}`, 'i');
};

/**
 * Processes and sorts filter result items
 * Merges same values with different cases and combines their counts
 */
const processResults = (items) => {
  if (!Array.isArray(items)) return [];

  // First, normalize and merge counts for same values
  const mergedCounts = items.reduce((acc, item) => {
    if (!item._id) return acc;

    const normalizedKey = normalizeValue(item._id);
    if (!normalizedKey) return acc;

    // Keep track of the original casing that has the highest count
    if (!acc[normalizedKey] || acc[normalizedKey].count < item.count) {
      acc[normalizedKey] = {
        value: item._id, // Keep original casing of the most frequent occurrence
        count: (acc[normalizedKey]?.count || 0) + item.count
      };
    } else {
      acc[normalizedKey].count += item.count;
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
      // Then alphabetically - ensure both values are strings
      const aValue = normalizeValue(a.value) || '';
      const bValue = normalizeValue(b.value) || '';
      return aValue.localeCompare(bValue);
    });
};

const getProductFilters = async (req, res) => {
  const startTime = Date.now();
  try {
    // Extract all parameters including sort
    const {  ...filterParams } = req.query;

    // Generate specific cache key for filters (include sort in cache key)
    const cacheKey = generateFilterCacheKey({ ...filterParams });

    // Try to get from cache
    const cachedResult = filterCache.get(cacheKey);
    if (cachedResult && filterCache.isValid(cacheKey)) {
      console.log('Cache hit - Response time:', Date.now() - startTime, 'ms');
      return res.json(cachedResult);
    }

    console.log('Cache miss - Building new response');

    const currentQuery = await buildSharedQuery(filterParams);
    queryPatternTracker.trackQuery(currentQuery);

    let currentResultCount;
    let filterResults;

      currentResultCount = await Product.countDocuments(currentQuery);

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
      filterResults = await Product.aggregate([
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
             collection_handle: [
              { $unwind: { path: '$collection_handle', preserveNullAndEmptyArrays: false } },
              { $group: { _id: '$collection_handle', count: { $sum: 1 } } },
              { $sort: { count: -1 } }
            ],
            // NEW: Collection handle wise gender breakdown
            collectionGenderBreakdown: [
              { $unwind: { path: '$collection_handle', preserveNullAndEmptyArrays: false } },
              { $unwind: { path: '$attributes.gender', preserveNullAndEmptyArrays: false } },
              { 
                $group: { 
                  _id: {
                    collection: '$collection_handle',
                    gender: '$attributes.gender'
                  }, 
                  count: { $sum: 1 } 
                } 
              },
              { $sort: { '_id.collection': 1, '_id.gender': 1 } }
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
        {
          $group: {
            _id: '$brand',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
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

      // Process collection-gender breakdown
      const collectionGenderMap = {};
      result.collectionGenderBreakdown.forEach(item => {
        const collection = item._id.collection;
        const gender = item._id.gender;
        const count = item.count;
        
        if (!collectionGenderMap[collection]) {
          collectionGenderMap[collection] = {};
        }
        collectionGenderMap[collection][gender] = count;
      });

      const response = {
        success: true,
        data: {
          currentResultCount,
          appliedFilters: filterParams,
          categories: processResults(result.categories),
          collections: processResults(result.collections),
          collection_handle: processResults(result.collection_handle),
          // NEW: Collection wise gender breakdown
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

      filterCache.set(cacheKey, response);
      console.log('Total response time:', Date.now() - startTime, 'ms');
      return res.json(response);
    

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