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
  timeout: 5 * 60 * 1000, // 5 days
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

// // Optimized aggregation pipelines
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

// Utility functions

const getCollectionPriceRange = async (query, collectionName = null) => {
  try {
    let matchQuery = { ...query };
    // If specific collection is provided, add it to the query
    if (collectionName && collectionName !== 'all') {
      matchQuery.collection_handle = collectionName;
    }

    // const stats = await Product.aggregate([
    //   { $match: matchQuery },
    //   {
    //     $group: {
    //       _id: null,
    //       minPrice: { $min: '$price' },
    //       maxPrice: { $max: '$price' },
    //       count: { $sum: 1 }
    //     }
    //   }
    // ]);
     const data = await Product.aggregate([
      { $match: matchQuery.collection_handle ? { collection_handle: matchQuery.collection_handle, isAvailable: true } : {} },
      {
        $group: {
          _id: null,
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' },
          count: { $sum: 1 }
        }
      }
    ]);

    return data[0] || { minPrice: data[0]?.minPrice || 0, maxPrice: data[0]?.maxPrice || 1000, count: 0 };
  } catch (error) {
    console.error('Error getting collection price range:', error);
    return { minPrice: 0, maxPrice: 1000, count: 0 };
  }
};

const getBrandsWithSelection = async (baseQuery, selectedBrands) => {
  try {
    const matchStage = { ...baseQuery, isAvailable: true };

    const allBrands = await Product.aggregate([
      { $match: matchStage },
      { $group: { _id: '$brand', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
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

// Build response data
const buildResponseData = (result, filterParams, currentResultCount, brandsWithSelection, priceStats) => ({
  success: true,
  data: {
    currentResultCount,
    appliedFilters: filterParams,
    categories: processResults(result.categories || []),
    collections: processResults(result.collections || []),
    collection_handle: processResults(result.collection_handle || []),
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
      appliedMin: Math.floor(filterParams.minPrice || 0),
      appliedMax: Math.ceil(filterParams.maxPrice || 1000)
    }
  }
});

/**
 * Get available filter options based on current search results
 * Returns filter options with counts based on current query context
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getProductFilters = async (req, res) => {
  try {
    const { bypassCache = false, ...filterParams } = req.query;

      const cacheFilters = {
      ...filterParams
    };

    const cacheKey = generateFilterCacheKey(cacheFilters);

   // if (!bypassCache) {
      const cached = filterCache.get(cacheKey);
      if (cached && filterCache.isValid(cacheKey)){
        console.log('Cache hit for product filters');
        return res.json(cached);
      }
     // }

    const currentQuery = await buildSharedQuery(filterParams);
    const selectedBrands = filterParams.brand?.split(',').map(b => b.trim()) || [];

    const attributeMap = {
      brand: 'brand',
      color: 'attributes.color',
      size: 'attributes.size',
      material: 'attributes.material',
      season: 'attributes.season',
      gender: 'attributes.gender',
      fabric: 'attributes.fabric',
      work: 'attributes.work',
      productGroup: 'productGroup',
      productType: 'productType',
      categories: 'categories',
      collections: 'collections',
      collection_handle: 'collection_handle'
    };

    const getAvailableGendersForCollection = async (collection_handle) => {
      const collectionsArray = collection_handle.split(',').map(c => c.trim());

      const pipeline = [
        {
          $match: {
            $and: [
              { isAvailable: true },
              {
                collections: collectionsArray
              }
            ]
          }
        },
        {
          $group: {
            _id: '$attributes.gender',
            count: { $sum: 1 }
          }
        },
        {
          $match: {
            _id: { $ne: null }
          }
        },
        {
          $sort: { count: -1 }
        }
      ];

      const result = await Product.aggregate(pipeline);
      return result.map(item => item._id);
    };

    const buildFacetQuery = async (exclude) => {
      const query = { ...currentQuery };
      delete query[attributeMap[exclude]];
      if (exclude === 'gender' && filterParams.collections) {
        try {
          const genders = await getAvailableGendersForCollection(filterParams.collections);
          if (genders.length) query['attributes.gender'] = { $in: genders };
        } catch (e) {
          console.error('Gender collection fetch error:', e);
        }
      }
      return query;
    };

    const buildFacet = async (query, field, isMulti = true) => {
      const pipeline = isMulti ? createFacetPipeline(field, true) : createSimpleFacetPipeline(field);
      return Product.aggregate([{ $match: query }, ...pipeline]);
    };

    const getCommonFacets = async () => {
      const filters = Object.keys(attributeMap);
      const facetQueries = await Promise.all(filters.map(f => buildFacetQuery(f)));

      const [
        brands,
        ...facets
        ] = await Promise.all([
        getBrandsWithSelection(facetQueries[0], selectedBrands),
        ...filters.slice(1).map((f, i) =>
          buildFacet(facetQueries[i + 1], f, !['productGroup', 'productType'].includes(f))
        ),
        
      ]);

      const priceStats = await getCollectionPriceRange(currentQuery, filterParams.collection_handle);

      const [
        colors, sizes, materials, seasons, genders, fabrics,
        works, productGroups, productTypes, categories, collections
      ] = facets;

      

      return {
        brands, priceStats, filterResults: {
          categories, collections, colors, sizes, materials, seasons,
          genders, fabrics, works, productGroups, productTypes
        }
      };
    };

    queryPatternTracker.trackQuery(currentQuery);

    // Get current result count and filter options
    const currentResultCount = await Product.countDocuments(currentQuery);
    const { brands, priceStats, filterResults } = await getCommonFacets();

 

    const response = buildResponseData(
      filterResults,
      filterParams,
      currentResultCount,
      brands,
      priceStats
    );

    // Store in cache only if not bypassing
    if (!bypassCache) {
      filterCache.set(cacheKey, response);
    }
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