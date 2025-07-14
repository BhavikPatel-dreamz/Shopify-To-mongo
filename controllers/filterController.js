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

// Optimized aggregation pipelines
const createFacetPipeline = (field, isAttribute = false) => {
  const path = isAttribute ? `$attributes.${field}` : `$${field}`;
  return [
    { $unwind: { path, preserveNullAndEmptyArrays: false } },
    { $group: { _id: path, count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ];
};

const createSimpleFacetPipeline = (field) => [
  { $match: { [field]: { $ne: null } } },
  { $group: { _id: `$${field}`, count: { $sum: 1 } } },
  { $sort: { count: -1 } }
];

async function getFilterFacets(query) {
  const facetStage = {
    categories: createFacetPipeline('categories'),
    collections: createFacetPipeline('collections'),
    colors: createFacetPipeline('color', true),
    sizes: createFacetPipeline('size', true),
    materials: createFacetPipeline('material', true),
    seasons: createFacetPipeline('season', true),
    genders: createFacetPipeline('gender', true),
    fabrics: createFacetPipeline('fabric', true),
    works: createFacetPipeline('work', true),
    productGroups: createSimpleFacetPipeline('productGroup'),
    productTypes: createSimpleFacetPipeline('productType'),
    brands: createSimpleFacetPipeline('brand'),
    priceRange: [{
      $group: {
        _id: null,
        minPrice: { $min: '$price' },
        maxPrice: { $max: '$price' }
      }
    }]
  };

  return await Product.aggregate([
    { $match: query },
    { $facet: facetStage }
  ]).option({ maxTimeMS: 30000, allowDiskUse: true });
}

// Utility functions
const getPriceRange = async (query) => {
  const stats = await Product.aggregate([
    { $match: query },
    { $group: { _id: null, minPrice: { $min: '$price' }, maxPrice: { $max: '$price' } } }
  ]);
  return stats[0] || { minPrice: 0, maxPrice: 1000 };
};

const getBrandsWithSelection = async (baseQuery, bestSellerIds, selectedBrands) => {
  const matchStage = { ...baseQuery, isAvailable: true };
  if (bestSellerIds) matchStage.productId = { $in: bestSellerIds };

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
};

// Optimized best seller logic
const getBestSellerProducts = async (query) => {
  const products = await Product.find(query).lean();
  if (!products.length) return { products: [], productIds: [] };

  const productIds = products.map(p => p.productId);
  const salesData = await Order.aggregate([
    { $match: { product_id: { $in: productIds } } },
    { $group: { _id: '$product_id', totalSaleQty: { $sum: '$quantity' } } }
  ]);

  const salesMap = new Map(salesData.map(item => [item._id, item.totalSaleQty]));

  const sortedProducts = products
    .map(p => ({ ...p, totalSaleQty: salesMap.get(p.productId) || 0 }))
    .sort((a, b) => b.totalSaleQty - a.totalSaleQty);

  return {
    products: sortedProducts,
    productIds: sortedProducts.map(p => p.productId)
  };
};

// Build response data
const buildResponseData = (result, filterParams, sort, currentResultCount, brandsWithSelection, priceStats) => ({
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
});

// Main controller - optimized
const getProductFilters = async (req, res) => {
  try {
    const { page, limit, sort, order, ...filterParams } = req.query;
    const cacheKey = generateFilterCacheKey({ ...filterParams, sort });

    // Check cache
    const cached = filterCache.get(cacheKey);
    if (cached && filterCache.isValid(cacheKey)) {
      return res.json(cached);
    }

    console.log('Cache miss - Building new response');
    const currentQuery = await buildSharedQuery(filterParams);
    queryPatternTracker.trackQuery(currentQuery);

    const selectedBrands = filterParams.brand ? filterParams.brand.split(',').map(b => b.trim()) : [];
    const baseQueryWithoutBrand = { ...currentQuery };
    delete baseQueryWithoutBrand.brand;

    let response;

    if (sort === 'best_seller') {
      const { products, productIds } = await getBestSellerProducts(currentQuery);

      if (!products.length) {
        response = buildResponseData(
          { categories: [], collections: [], colors: [], sizes: [], materials: [], seasons: [], genders: [], fabrics: [], works: [], productGroups: [], productTypes: [], brands: [] },
          filterParams, sort, 0, [], { minPrice: 0, maxPrice: 1000 }
        );
      } else {
        const bestSellerQuery = { productId: { $in: productIds } };
        const [filterResults, priceStats, brandsWithSelection] = await Promise.all([
          getFilterFacets(bestSellerQuery),
          getPriceRange(bestSellerQuery),
          getBrandsWithSelection(baseQueryWithoutBrand, productIds, selectedBrands)
        ]);

        response = buildResponseData(
          filterResults[0], filterParams, sort, productIds.length, brandsWithSelection, priceStats
        );
      }
    } else {
      const [currentResultCount, filterResults, priceStats, brandsWithSelection] = await Promise.all([
        Product.countDocuments(currentQuery),
        getFilterFacets(currentQuery),
        getPriceRange(currentQuery),
        getBrandsWithSelection(baseQueryWithoutBrand, null, selectedBrands)
      ]);

      response = buildResponseData(
        filterResults[0], filterParams, sort, currentResultCount, brandsWithSelection, priceStats
      );
    }

    filterCache.set(cacheKey, response);
    return res.json(response);

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