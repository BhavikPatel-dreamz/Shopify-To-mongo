import Product from '../models/Product.js';
import Order from '../models/Order.js';
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

// Utility to run the facet aggregation
async function getFilterFacets(query) {
  return await Product.aggregate([
    { $match: query },
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
  ]).option({ maxTimeMS: 30000, allowDiskUse: true });
}

// Utility to get price stats only
async function getPriceRange(query) {
  const stats = await Product.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        minPrice: { $min: '$price' },
        maxPrice: { $max: '$price' }
      }
    }
  ]);
  return stats[0] || { minPrice: 0, maxPrice: 1000 };
}

// Utility to get brands with counts and selection
async function getBrandsWithSelection(baseQuery, bestSellerIds, selectedBrands) {
  const matchStage = { ...baseQuery, isAvailable: true };
  if (bestSellerIds) {
    matchStage.productId = { $in: bestSellerIds };
  }

  const brands = await Product.aggregate([
    { $match: matchStage },
    { $group: { _id: '$brand', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $match: { _id: { $ne: null } } }
  ]).option({ maxTimeMS: 15000, allowDiskUse: true });

  return brands.map(b => ({
    value: b._id,
    count: b.count,
    selected: selectedBrands.includes(b._id)
  }));
}

// Main controller
const getProductFilters = async (req, res) => {
  try {
    const { page, limit, sort, order, ...filterParams } = req.query;
    const cacheKey = generateFilterCacheKey({ ...filterParams, sort });

    // Try cache
    const cached = filterCache.get(cacheKey);
    if (cached && filterCache.isValid(cacheKey)) {
      return res.json(cached);
    }

    console.log('Cache miss - Building new response');
    const currentQuery = await buildSharedQuery(filterParams);
    queryPatternTracker.trackQuery(currentQuery);

    let currentResultCount;
    let filterResults;
    let bestSellerProductIds;

    if (sort === 'best_seller') {
      // Get all products matching the filters
      const matchingProducts = await Product.find(currentQuery).lean();
      
      if (matchingProducts.length === 0) {
        const emptyResponse = {
          success: true,
          data: {
            currentResultCount: 0,
            appliedFilters: filterParams,
            sortApplied: sort,
            categories: [],
            collections: [],
            tags: [],
            attributes: {
              colors: [],
              sizes: [],
              materials: [],
              seasons: [],
              genders: [],
              fabrics: [],
              works: []
            },
            productGroups: [],
            productTypes: [],
            brands: [],
            priceRange: { min: 0, max: 1000 }
          }
        };
        filterCache.set(cacheKey, emptyResponse);
        return res.json(emptyResponse);
      }

      // Get all product IDs from matching products
      const productIds = matchingProducts.map(p => p.productId);

      // Get sales data for all matching products 
      const salesData = await Order.aggregate([
        { $match: { product_id: { $in: productIds } } },
        { $group: { _id: '$product_id', totalSaleQty: { $sum: '$quantity' } } }
      ]);
      
      const salesDataMap = new Map(salesData.map(item => [item._id, item.totalSaleQty]));

      // Add sales data to products and sort by sales quantity 
      const productsWithSaleQty = matchingProducts.map(product => ({
        ...product,
        totalSaleQty: salesDataMap.get(product.productId) || 0
      }));

    // Sort by totalSaleQty in descending order
      productsWithSaleQty.sort((a, b) => b.totalSaleQty - a.totalSaleQty);

     
      bestSellerProductIds = productsWithSaleQty.map(p => p.productId);
      currentResultCount = bestSellerProductIds.length;

      // Now run aggregations on the sorted best seller products
      filterResults = await getFilterFacets({ productId: { $in: bestSellerProductIds } });
      const priceStats = await getPriceRange({ productId: { $in: bestSellerProductIds } });

      const baseQueryWithoutBrand = { ...currentQuery };
      delete baseQueryWithoutBrand.brand;
      const selectedBrands = filterParams.brand ? filterParams.brand.split(',').map(b => b.trim()) : [];
      const brandsWithSelection = await getBrandsWithSelection(baseQueryWithoutBrand, bestSellerProductIds, selectedBrands);

      const result = filterResults[0];

      const response = {
        success: true,
        data: {
          currentResultCount,
          appliedFilters: filterParams,
          sortApplied: sort,
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
            min: Math.floor(priceStats.minPrice),
            max: Math.ceil(priceStats.maxPrice),
            appliedMin: filterParams.minPrice ? parseFloat(filterParams.minPrice) : undefined,
            appliedMax: filterParams.maxPrice ? parseFloat(filterParams.maxPrice) : undefined
          }
        }
      };

      filterCache.set(cacheKey, response);
      return res.json(response);

    } else {
      // All other sorts (unchanged)
      currentResultCount = await Product.countDocuments(currentQuery);
      filterResults = await getFilterFacets(currentQuery);
      const priceStats = await getPriceRange(currentQuery);

      const baseQueryWithoutBrand = { ...currentQuery };
      delete baseQueryWithoutBrand.brand;
      const selectedBrands = filterParams.brand ? filterParams.brand.split(',').map(b => b.trim()) : [];
      const brandsWithSelection = await getBrandsWithSelection(baseQueryWithoutBrand, null, selectedBrands);

      const result = filterResults[0];

      const response = {
        success: true,
        data: {
          currentResultCount,
          appliedFilters: filterParams,
          sortApplied: sort,
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
            min: Math.floor(priceStats.minPrice),
            max: Math.ceil(priceStats.maxPrice),
            appliedMin: filterParams.minPrice ? parseFloat(filterParams.minPrice) : undefined,
            appliedMax: filterParams.maxPrice ? parseFloat(filterParams.maxPrice) : undefined
          }
        }
      };

      filterCache.set(cacheKey, response);
      return res.json(response);
    }

  } catch (error) {
    console.error('Error fetching product filters:', error);
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