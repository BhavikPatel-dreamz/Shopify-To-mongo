import Product from '../models/Product.js';
import Order from '../models/Order.js';
import { queryPatternTracker } from '../models/Product.js';
import AdvancedCache from '../utils/AdvancedCache.js';
import { buildSharedQuery } from './productController.js';

/**
 * Cache Configuration
 * 
 * filterCache: Stores computed filter results
 * - Capacity: 5000 entries (increased for better hit rate)
 * - TTL: 8 hours (reduced for fresher data)
 * - Cleanup: Every 10 minutes
 */
const filterCache = new AdvancedCache({
  maxSize: 5000,
  timeout: 8 * 60 * 60 * 1000, // 8 hours
  cleanupInterval: 10 * 60 * 1000 // 10 minutes
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
  if (!items || items.length === 0) return [];

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

// Optimized aggregation pipelines with indexing hints
const createFacetPipeline = (field, isAttribute = false) => {
  const path = isAttribute ? `$attributes.${field}` : `$${field}`;
  return [
    { 
      $match: { 
        [isAttribute ? `attributes.${field}` : field]: { 
          $exists: true, 
          $ne: null 
        } 
      } 
    },
    { $unwind: { path, preserveNullAndEmptyArrays: false } },
    { 
      $group: { 
        _id: path, 
        count: { $sum: 1 },
        // Store first occurrence for original casing
        firstValue: { $first: path }
      } 
    },
    { $sort: { count: -1, _id: 1 } },
    { $limit: 500 }, // More conservative limit
    {
      $project: {
        _id: 1,
        count: 1,
        // Use the first occurrence's casing
        originalValue: "$firstValue"
      }
    }
  ];
};

const createSimpleFacetPipeline = (field) => [
  { 
    $match: { 
      [field]: { 
        $ne: null, 
        $exists: true,
        $not: { $size: 0 } // For array fields
      } 
    } 
  },
  { 
    $group: { 
      _id: `$${field}`, 
      count: { $sum: 1 },
      firstValue: { $first: `$${field}` }
    } 
  },
  { $sort: { count: -1, _id: 1 } },
  { $limit: 500 },
  {
    $project: {
      _id: 1,
      count: 1,
      originalValue: "$firstValue"
    }
  }
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
  ]).option({ 
    maxTimeMS: 30000, // Reduced timeout
    allowDiskUse: true,
    hint: { isAvailable: 1 } // Assuming you have an index on isAvailable
  });
}

// Utility functions
const getPriceRange = async (query) => {
  try {
    const stats = await Product.aggregate([
      { $match: query },
      { $group: { _id: null, minPrice: { $min: '$price' }, maxPrice: { $max: '$price' } } }
    ]).option({ maxTimeMS: 10000 });
    
    return stats[0] || { minPrice: 0, maxPrice: 1000 };
  } catch (error) {
    console.error('Error getting price range:', error);
    return { minPrice: 0, maxPrice: 1000 };
  }
};

const getBrandsWithSelection = async (baseQuery, bestSellerIds, selectedBrands) => {
  try {
    const matchStage = { ...baseQuery, isAvailable: true };
    if (bestSellerIds) matchStage.productId = { $in: bestSellerIds };

    const brands = await Product.aggregate([
      { $match: matchStage },
      { $group: { _id: '$brand', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $match: { _id: { $ne: null, $exists: true } } },
      { $limit: 500 } // Limit brands to prevent memory issues
    ]).option({ 
      maxTimeMS: 15000, 
      allowDiskUse: true,
      hint: { brand: 1, isAvailable: 1 } // Assuming you have a compound index
    });

    return brands.map(b => ({
      value: b._id,
      count: b.count,
      selected: selectedBrands.includes(b._id)
    }));
  } catch (error) {
    console.error('Error getting brands:', error);
    return [];
  }
};

// Optimized best seller logic with batching
const getBestSellerProducts = async (query) => {
  try {
    // First get product IDs that match the query
    const productIds = await Product.find(query)
      .select('productId -_id')
      .lean()
      .limit(20000) // Increased but still limited
      .hint({ isAvailable: 1 })
      .then(products => products.map(p => p.productId));

    if (!productIds.length) return { products: [], productIds: [] };

    // Process sales data in optimized batches
    const batchSize = 10000;
    const salesMap = new Map();
    
    for (let i = 0; i < productIds.length; i += batchSize) {
      const batch = productIds.slice(i, i + batchSize);
      const batchSales = await Order.aggregate([
        { 
          $match: { 
            product_id: { $in: batch },
            // Only look at recent orders for better performance
            createdAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
          } 
        },
        { 
          $group: { 
            _id: '$product_id', 
            totalSaleQty: { $sum: '$quantity' } 
          } 
        }
      ])
      .option({ maxTimeMS: 20000, allowDiskUse: true });
      
      batchSales.forEach(item => salesMap.set(item._id, item.totalSaleQty));
    }

    // Now get the full product data only for products with sales
    const productsWithSales = await Product.find({
      productId: { $in: Array.from(salesMap.keys()) },
      isAvailable: true
    })
    .lean()
    .hint({ productId: 1, isAvailable: 1 });

    // Merge sales data and sort
    const sortedProducts = productsWithSales
      .map(p => ({
        ...p,
        totalSaleQty: salesMap.get(p.productId) || 0
      }))
      .sort((a, b) => b.totalSaleQty - a.totalSaleQty);

    return {
      products: sortedProducts,
      productIds: sortedProducts.map(p => p.productId)
    };
  } catch (error) {
    console.error('Error getting best seller products:', error);
    return { products: [], productIds: [] };
  }
};

// Build empty response for no results
const buildEmptyResponse = (filterParams, sort) => ({
  success: true,
  data: {
    currentResultCount: 0,
    appliedFilters: filterParams,
    sortApplied: sort,
    message: 'No products found matching your criteria',
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
    priceRange: {
      min: 0,
      max: 1000,
      appliedMin: filterParams.minPrice ? parseFloat(filterParams.minPrice) : undefined,
      appliedMax: filterParams.maxPrice ? parseFloat(filterParams.maxPrice) : undefined
    }
  }
});

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

    // Check cache first
    const cached = filterCache.get(cacheKey);
    if (cached && filterCache.isValid(cacheKey)) {
      console.log('Cache hit for:', cacheKey);
      return res.json(cached);
    }

    console.log('Cache miss - Building new response for:', filterParams);
    
    // Build query with timeout protection
    const currentQuery = await buildSharedQuery(filterParams);
    queryPatternTracker.trackQuery(currentQuery);

    // Quick count check to see if we have any results
    const quickCount = await Product.countDocuments(currentQuery)
      .maxTimeMS(5000)
      .hint({ isAvailable: 1 });

    // If no products found, return empty response immediately
    if (quickCount === 0) {
      console.log('No products found for query:', currentQuery);
      const emptyResponse = buildEmptyResponse(filterParams, sort);
      filterCache.set(cacheKey, emptyResponse);
      return res.json(emptyResponse);
    }

    const selectedBrands = filterParams.brand ? filterParams.brand.split(',').map(b => b.trim()) : [];
    const baseQueryWithoutBrand = { ...currentQuery };
    delete baseQueryWithoutBrand.brand;

    let response;

    if (sort === 'best_seller') {
      console.log('Processing best seller sort...');
      const { products, productIds } = await getBestSellerProducts(currentQuery);

      if (!products.length) {
        response = buildEmptyResponse(filterParams, sort);
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
      console.log('Processing regular sort...');
      const [currentResultCount, filterResults, priceStats, brandsWithSelection] = await Promise.all([
        Product.countDocuments(currentQuery).maxTimeMS(10000),
        getFilterFacets(currentQuery),
        getPriceRange(currentQuery),
        getBrandsWithSelection(baseQueryWithoutBrand, null, selectedBrands)
      ]);

      response = buildResponseData(
        filterResults[0], filterParams, sort, currentResultCount, brandsWithSelection, priceStats
      );
    }

    // Cache the response
    filterCache.set(cacheKey, response);
    console.log('Response cached for:', cacheKey);
    
    return res.json(response);

  } catch (error) {
    console.error('Error fetching product filters:', error);
    
    // Return a proper error response
    const errorResponse = {
      success: false,
      error: 'Failed to fetch product filters',
      message: error.message,
      data: {
        currentResultCount: 0,
        appliedFilters: req.query,
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

    res.status(500).json(errorResponse);
  }
};

export default {
  getProductFilters
};