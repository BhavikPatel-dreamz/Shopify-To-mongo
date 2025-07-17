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
  
  // Handle special case for 'all-lehengas'
  // if (value === 'all-lehengas') {
  //   return "all lehenga's";
  // }
  
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

/**
 * Get available filter options based on current search results
 * Returns filter options with counts based on current query context
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */

// Optimized aggregation pipelines
const createFacetPipeline = (field, isAttribute = false) => {
  const path = isAttribute ? `attributes.${field}` : field;

  return [
    { $match: { [path]: { $exists: true, $ne: null, $not: { $size: 0 } } } },
    { $unwind: { path: `$${path}`, preserveNullAndEmptyArrays: false } },
    { $group: { _id: `$${path}`, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 300 }
  ];
};

const createSimpleFacetPipeline = (field) => [
  { $match: { [field]: { $ne: null, $exists: true } } },
  { $group: { _id: `$${field}`, count: { $sum: 1 } } },
  { $sort: { count: -1 } }
];

async function getFilterFacets(query) {
  try {
    const facetStage = {
      categories: createFacetPipeline('categories'),
      collections: createFacetPipeline('collections'),
      color: createFacetPipeline('color', true),
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

    const result = await Product.aggregate([
      { $match: query },
      { $facet: facetStage }
    ]).option({ maxTimeMS: 15000, allowDiskUse: true, hint: { isAvailable: 1 } })

    return result[0] || {};
  } catch (error) {
    console.error('Error in getFilterFacets:', error);
    throw error;
  }
}

// Utility functions

const getCollectionPriceRange = async (query, collectionName = null) => {
  try {
    let matchQuery = { ...query };
    
    // If specific collection is provided, add it to the query
    if (collectionName && collectionName !== 'all') {
      matchQuery.collections = collectionName;
    }
    
    const stats = await Product.aggregate([
      { $match: matchQuery },
      { 
        $group: { 
          _id: null, 
          minPrice: { $min: '$price' }, 
          maxPrice: { $max: '$price' },
          count: { $sum: 1 }
        } 
      }
    ]);
    
    return stats[0] || { minPrice: 0, maxPrice: 1000, count: 0 };
  } catch (error) {
    console.error('Error getting collection price range:', error);
    return { minPrice: 0, maxPrice: 1000, count: 0 };
  }
};



const getBrandsWithSelection = async (baseQuery, bestSellerIds, selectedBrands) => {
  try {
    const matchStage = { ...baseQuery, isAvailable: true };
    if (bestSellerIds) {
      matchStage.productId = { $in: bestSellerIds };
    }

    // બધા available brands get કરો (selected brands filter કર્યા વિના)
    const allBrands = await Product.aggregate([
      { $match: matchStage },
      { $group: { _id: '$brand', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $match: { _id: { $ne: null, $exists: true } } }
    ]).option({ maxTimeMS: 15000, allowDiskUse: true });

    return allBrands.map(b => ({
      value: b._id,
      count: b.count,
      selected: selectedBrands.includes(b._id)
    }));

  } catch (error) {
    console.error('Error getting brands with selection:', error);
    return [];
  }
};
// Optimized best seller logic
const getBestSellerProducts = async (query) => {
  try {
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
  } catch (error) {
    console.error('Error getting best seller products:', error);
    return { products: [], productIds: [] };
  }
};

// Build response data
const buildResponseData = (result, filterParams, sort, currentResultCount, brandsWithSelection, priceStats) => ({
  success: true,
  data: {
    currentResultCount,
    appliedFilters: filterParams,
    sortApplied: sort,
    categories: processResults(result.categories || []),
    collections: processResults(result.collections || []),
    tags: filterParams.tags ? filterParams.tags.split(',').map(tag => ({
      value: tag.trim(),
      count: currentResultCount
    })) : [],
    attributes: {
      colors: processResults(result.colors || []),
      sizes: processResults(result.sizes || []),
      materials: processResults(result.materials || []),
      seasons: processResults(result.seasons || []),
      genders: processResults(result.genders || []),
      fabrics: processResults(result.fabrics || []),
      works: processResults(result.works || [])
    },
    productGroups: processResults(result.productGroups || []),
    productTypes: processResults(result.productTypes || []),
    brands: brandsWithSelection || [],
    priceRange: {
      min: Math.floor(priceStats.minPrice || 0),
      max: Math.ceil(priceStats.maxPrice || 1000),
      appliedMin: filterParams.minPrice ? parseFloat(filterParams.minPrice) : undefined,
      appliedMax: filterParams.maxPrice ? parseFloat(filterParams.maxPrice) : undefined
    }
  }
});


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

    const getAvailableGendersForCollection = async (collections) => {
      const collectionsArray = collections.split(',').map(c => c.trim());

      const pipeline = [
        { $match: { collections: { $in: collectionsArray }, isAvailable: true } },
        { $group: { _id: '$attributes.gender', count: { $sum: 1 } } },
        { $match: { _id: { $ne: null } } },
        { $sort: { count: -1 } }
      ];

      const result = await Product.aggregate(pipeline);
      return result.map(item => item._id);
    };

    const createFacetQueryFor = async (excludeFilter) => {
      const facetQuery = { ...currentQuery };

      switch (excludeFilter) {
        case 'brand': delete facetQuery.brand; break;
        case 'color': delete facetQuery['attributes.color']; break;
        case 'size': delete facetQuery['attributes.size']; break;
        case 'material': delete facetQuery['attributes.material']; break;
        case 'season': delete facetQuery['attributes.season']; break;
        case 'gender':
          delete facetQuery['attributes.gender'];
          if (filterParams.collections) {
            try {
              const allowedGenders = await getAvailableGendersForCollection(filterParams.collections);
              if (allowedGenders.length > 0) {
                facetQuery['attributes.gender'] = { $in: allowedGenders };
              }
            } catch (error) {
              console.error('Error getting collection genders:', error);
            }
          }
          break;
        case 'fabric': delete facetQuery['attributes.fabric']; break;
        case 'work': delete facetQuery['attributes.work']; break;
        case 'productGroup': delete facetQuery.productGroup; break;
        case 'productType': delete facetQuery.productType; break;
        case 'categories': delete facetQuery.categories; break;
        case 'collections': delete facetQuery.collections; break;
      }

      return facetQuery;
    };

    queryPatternTracker.trackQuery(currentQuery);

    const selectedBrands = filterParams.brand ? filterParams.brand.split(',').map(b => b.trim()) : [];

    let response;

    if (sort === 'best_seller') {
      const { products, productIds, bestSellerQuery } = await getBestSellerProducts(currentQuery);

      if (!products.length) {
        response = buildResponseData(
          {},
          filterParams,
          sort,
          0,
          [],
          { minPrice: 0, maxPrice: 1000 }
        );
      } else {
        const createBestSellerFacetQueryFor = async (excludeFilter) => {
          const fullQuery = { ...currentQuery };

          if (excludeFilter === 'gender') {
            delete fullQuery['attributes.gender'];
            if (filterParams.collections) {
              try {
                const allowedGenders = await getAvailableGendersForCollection(filterParams.collections);
                if (allowedGenders.length > 0) {
                  fullQuery['attributes.gender'] = { $in: allowedGenders };
                }
              } catch (error) {
                console.error('Error getting collection genders for best seller:', error);
              }
            }
          } else {
            switch (excludeFilter) {
              case 'brand': delete fullQuery.brand; break;
              case 'color': delete fullQuery['attributes.color']; break;
              case 'size': delete fullQuery['attributes.size']; break;
              case 'material': delete fullQuery['attributes.material']; break;
              case 'season': delete fullQuery['attributes.season']; break;
              case 'fabric': delete fullQuery['attributes.fabric']; break;
              case 'work': delete fullQuery['attributes.work']; break;
              case 'productGroup': delete fullQuery.productGroup; break;
              case 'productType': delete fullQuery.productType; break;
              case 'categories': delete fullQuery.categories; break;
              case 'collections': delete fullQuery.collections; break;
            }
          }

          const matchedProducts = await Product.find(fullQuery).select('productId').lean();
          return { productId: { $in: matchedProducts.map(p => p.productId) }, isAvailable: true };
        };

        const [
          brandQuery,
          colorQuery,
          sizeQuery,
          materialQuery,
          seasonQuery,
          genderQuery, 
          fabricQuery,
          workQuery,
          productGroupQuery,
          productTypeQuery,
          categoriesQuery,
          collectionsQuery
        ] = await Promise.all([
          createBestSellerFacetQueryFor('brand'),
          createBestSellerFacetQueryFor('color'),
          createBestSellerFacetQueryFor('size'),
          createBestSellerFacetQueryFor('material'),
          createBestSellerFacetQueryFor('season'),
          createBestSellerFacetQueryFor('gender'),
          createBestSellerFacetQueryFor('fabric'),
          createBestSellerFacetQueryFor('work'),
          createBestSellerFacetQueryFor('productGroup'),
          createBestSellerFacetQueryFor('productType'),
          createBestSellerFacetQueryFor('categories'),
          createBestSellerFacetQueryFor('collections')
        ]);

        const [
          brands,
          colors,
          sizes,
          materials,
          seasons,
          genders, 
          fabrics,
          works,
          productGroups,
          productTypes,
          categories,
          collections,
          priceStats
        ] = await Promise.all([
          getBrandsWithSelection(brandQuery, null, selectedBrands),
          Product.aggregate([{ $match: colorQuery }, ...createFacetPipeline('color', true)]),
          Product.aggregate([{ $match: sizeQuery }, ...createFacetPipeline('size', true)]),
          Product.aggregate([{ $match: materialQuery }, ...createFacetPipeline('material', true)]),
          Product.aggregate([{ $match: seasonQuery }, ...createFacetPipeline('season', true)]),
          Product.aggregate([{ $match: genderQuery }, ...createFacetPipeline('gender', true)]),
          Product.aggregate([{ $match: fabricQuery }, ...createFacetPipeline('fabric', true)]),
          Product.aggregate([{ $match: workQuery }, ...createFacetPipeline('work', true)]),
          Product.aggregate([{ $match: productGroupQuery }, ...createSimpleFacetPipeline('productGroup')]),
          Product.aggregate([{ $match: productTypeQuery }, ...createSimpleFacetPipeline('productType')]),
          Product.aggregate([{ $match: categoriesQuery }, ...createFacetPipeline('categories')]),
          Product.aggregate([{ $match: collectionsQuery }, ...createFacetPipeline('collections')]),
          getCollectionPriceRange(bestSellerQuery, filterParams.collections)
        ]);

        const filterResults = {
          categories,
          collections,
          colors,
          sizes,
          materials,
          seasons,
          genders,
          fabrics,
          works,
          productGroups,
          productTypes
        };

        response = buildResponseData(
          filterResults,
          filterParams,
          sort,
          productIds.length,
          brands,
          priceStats
        );
      }

    } else {
      const [
        currentResultCount,
        brands,
        colors,
        sizes,
        materials,
        seasons,
        genders, 
        fabrics,
        works,
        productGroups,
        productTypes,
        categories,
        collections,
        priceStats
      ] = await Promise.all([
        Product.countDocuments(currentQuery),
        getBrandsWithSelection(await createFacetQueryFor('brand'), null, selectedBrands),
        Product.aggregate([{ $match: await createFacetQueryFor('color') }, ...createFacetPipeline('color', true)]),
        Product.aggregate([{ $match: await createFacetQueryFor('size') }, ...createFacetPipeline('size', true)]),
        Product.aggregate([{ $match: await createFacetQueryFor('material') }, ...createFacetPipeline('material', true)]),
        Product.aggregate([{ $match: await createFacetQueryFor('season') }, ...createFacetPipeline('season', true)]),
        Product.aggregate([{ $match: await createFacetQueryFor('gender') }, ...createFacetPipeline('gender', true)]),
        Product.aggregate([{ $match: await createFacetQueryFor('fabric') }, ...createFacetPipeline('fabric', true)]),
        Product.aggregate([{ $match: await createFacetQueryFor('work') }, ...createFacetPipeline('work', true)]),
        Product.aggregate([{ $match: await createFacetQueryFor('productGroup') }, ...createSimpleFacetPipeline('productGroup')]),
        Product.aggregate([{ $match: await createFacetQueryFor('productType') }, ...createSimpleFacetPipeline('productType')]),
        Product.aggregate([{ $match: await createFacetQueryFor('categories') }, ...createFacetPipeline('categories')]),
        Product.aggregate([{ $match: await createFacetQueryFor('collections') }, ...createFacetPipeline('collections')]),
        getCollectionPriceRange(await createFacetQueryFor('price'), filterParams.collections)
      ]);

      const filterResults = {
        categories,
        collections,
        colors,
        sizes,
        materials,
        seasons,
        genders, 
        fabrics,
        works,
        productGroups,
        productTypes
      };

      response = buildResponseData(
        filterResults,
        filterParams,
        sort,
        currentResultCount,
        brands,
        priceStats
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