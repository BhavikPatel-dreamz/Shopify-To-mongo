import Product from '../models/Product.js';
import vectorService from '../services/vectorService.js';
import { queryPatternTracker } from '../models/Product.js';

// Advanced caching system with memory management
class AdvancedCache {
  constructor(options = {}) {
    this.data = new Map();
    this.timestamps = new Map();
    this.accessCount = new Map();
    this.maxSize = options.maxSize || 1000;
    this.timeout = options.timeout || 60 * 60 * 1000; // 1 hour default
    this.cleanupInterval = options.cleanupInterval || 5 * 60 * 1000; // 5 minutes
    this.startCleanupInterval();
  }

  startCleanupInterval() {
    setInterval(() => this.cleanup(), this.cleanupInterval);
  }

  cleanup() {
    const now = Date.now();
    for (const [key, timestamp] of this.timestamps) {
      if (now - timestamp > this.timeout) {
        this.delete(key);
      }
    }

    // If still over maxSize, remove least accessed items
    if (this.data.size > this.maxSize) {
      const sortedKeys = Array.from(this.accessCount.entries())
        .sort((a, b) => a[1] - b[1])
        .map(([key]) => key);
      
      const keysToRemove = sortedKeys.slice(0, this.data.size - this.maxSize);
      keysToRemove.forEach(key => this.delete(key));
    }
  }

  delete(key) {
    this.data.delete(key);
    this.timestamps.delete(key);
    this.accessCount.delete(key);
  }

  set(key, value) {
    if (this.data.size >= this.maxSize) {
      this.cleanup();
    }
    this.data.set(key, value);
    this.timestamps.set(key, Date.now());
    this.accessCount.set(key, (this.accessCount.get(key) || 0) + 1);
  }

  get(key) {
    const value = this.data.get(key);
    if (value) {
      this.accessCount.set(key, (this.accessCount.get(key) || 0) + 1);
    }
    return value;
  }

  isValid(key) {
    const timestamp = this.timestamps.get(key);
    if (!timestamp) return false;
    return (Date.now() - timestamp) < this.timeout;
  }

  clear() {
    this.data.clear();
    this.timestamps.clear();
    this.accessCount.clear();
  }
}

// Create cache instances
const filterCache = new AdvancedCache({
  maxSize: 2000,
  timeout: 30 * 60 * 1000, // 30 minutes
  cleanupInterval: 5 * 60 * 1000 // 5 minutes
});

// Cache for total count
const countCache = new AdvancedCache({
  maxSize: 100,
  timeout: 5 * 60 * 1000, // 5 minutes
  cleanupInterval: 60 * 1000 // 1 minute
});

// Helper function to generate cache key
const generateCacheKey = (queryParams) => {
  const sortedParams = Object.keys(queryParams || {})
    .sort()
    .reduce((acc, key) => {
      acc[key] = queryParams[key];
      return acc;
    }, {});
  return JSON.stringify(sortedParams);
};

// Helper function to create case-insensitive patterns
const createCaseInsensitivePatterns = (values) => {
  if (typeof values === 'string') {
    values = values.split(',').map(v => v.trim());
  }
  const valueArray = Array.isArray(values) ? values : [values];
  return valueArray.map(value => new RegExp(`^${value}$`, 'i'));
};

// Helper function to build optimized query
const buildFilterQuery = (filters) => {
  const query = { isAvailable: true };
  
  const filterMappings = {
    tags: 'tags',
    category: 'categories',
    color: 'attributes.color',
    size: 'attributes.size',
    material: 'attributes.material',
    season: 'attributes.season',
    gender: 'attributes.gender',
    productGroup: 'productGroup',
    productType: 'productType',
    brand: 'brand',
    fabric: 'attributes.fabric',
    work: 'attributes.work',
    style: 'attributes.style'
  };

  Object.entries(filters).forEach(([key, value]) => {
    if (value && filterMappings[key]) {
      if (key === 'collections') {
        const collectionArray = value.replaceAll('-', ' ').split(',');
        query[filterMappings[key]] = { $in: createCaseInsensitivePatterns(collectionArray) };
      } else {
        query[filterMappings[key]] = { $in: createCaseInsensitivePatterns(value) };
      }
    }
  });

  return query;
};

/**
 * Get products with filtering, sorting, and pagination
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getProducts = async (req, res) => {
  try {
    const cacheKey = generateCacheKey(req.query);
    
    // Check if we have a valid cached response
    if (filterCache.isValid(cacheKey)) {
      console.log('Returning cached filter results');
      return res.json(filterCache.get(cacheKey));
    }

    // Extract query parameters
    const {
      page = 1,
      limit = 20,
      sort = 'createdAt',
      order = 'desc',
      search = '',
      category,
      tags,
      color,
      size,
      material,
      season,
      minPrice,
      maxPrice,
      inStock,
      gender,
      productGroup,
      productType,
      brand,
      fabric,
      work,
      collections,
      style
    } = req.query;

    // Build filter query - Always include isAvailable: true
    const query = {
      isAvailable: true  // This ensures we only get available products
    };

    // Use vector search for longer search terms
    if (search && search.length >= 3) {
      try {
        const queryEmbedding = await vectorService.generateQueryEmbedding(search);
        const similarProducts = await vectorService.searchSimilarProducts(queryEmbedding, {
          limit: parseInt(limit),
          minScore: 0.6
        });
        
        if (similarProducts.length > 0) {
          // Get IDs of similar products
          const productIds = similarProducts.map(p => p.productId);
          query._id = { $in: productIds };
        } else {
          // Fallback to text search
          query.$or = [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { 'tags': { $regex: search, $options: 'i' } }
          ];
        }
      } catch (error) {
        console.error('Vector search failed, falling back to text search:', error);
        // Fallback to text search
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { 'tags': { $regex: search, $options: 'i' } }
        ];
      }
    } else if (search) {
      // For short search terms, use text search
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'tags': { $regex: search, $options: 'i' } }
      ];
    }

    // Apply filters with case-insensitive matching
    if (category) {
      query.categories = { $in: createCaseInsensitivePatterns(category) };
    }

    if (collections) {
      const collectionArray = collections.replaceAll('-', ' ').split(',');
      query.collections = { $in: createCaseInsensitivePatterns(collectionArray) };
    }

    if (tags) {
      query.tags = { $in: createCaseInsensitivePatterns(tags) };
    }

    if (color) {
      query['attributes.color'] = { $in: createCaseInsensitivePatterns(color) };
    }
    
    if (size) {
      query['attributes.size'] = { $in: createCaseInsensitivePatterns(size) };
    }
    
    if (material) {
      query['attributes.material'] = { $in: createCaseInsensitivePatterns(material) };
    }
    
    if (season) {
      query['attributes.season'] = { $in: createCaseInsensitivePatterns(season) };
    }

    if (gender) {
      query['attributes.gender'] = { $in: createCaseInsensitivePatterns(gender) };
    }

    if (productGroup) {
      query.productGroup = { $in: createCaseInsensitivePatterns(productGroup) };
    }

    if (productType) {
      query.productType = { $in: createCaseInsensitivePatterns(productType) };
    }

    if (brand) {
      query.brand = { $in: createCaseInsensitivePatterns(brand) };
    }

    if (fabric) {
      query['attributes.fabric'] = { $in: createCaseInsensitivePatterns(fabric) };
    }

    if (work) {
      query['attributes.work'] = { $in: createCaseInsensitivePatterns(work) };
    }


    if (style) {
      query['attributes.style'] = { $in: createCaseInsensitivePatterns(style) };
    }


    

    console.log('Query:', query);

    // Price range filter
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Determine sort order
    let sortOptions = {};
    switch (sort) {
      case 'featured':
        sortOptions = { featured: -1 }; // Assuming you have a 'featured' field
        break;
      case 'best_selling':
        sortOptions = { sales: -1 }; // Assuming you have a 'sales' field
        break;
      case 'alphabetical_asc':
        sortOptions = { name: 1 };
        break;
      case 'alphabetical_desc':
        sortOptions = { name: -1 };
        break;
      case 'price_asc':
        sortOptions = { price: 1 };
        break;
      case 'price_desc':
        sortOptions = { price: -1 };
        break;
      case 'date_old_to_new':
        sortOptions = { createdAt: 1 };
        break;
      case 'date_new_to_old':
        sortOptions = { createdAt: -1 };
        break;
      default:
        sortOptions = { createdAt: -1 }; // Default to newest
    }

    // Execute query with pagination
    const products = await Product.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean(); // Use lean() to get plain JavaScript objects

    // Get total count of available products only
    const total = await Product.countDocuments(query);

    // Include productUrl in the response
    const response = {
      success: true,
      data: {
        products: products.map(product => ({
          ...product,
          productUrl: product.productUrl // Ensure productUrl is included
        })),
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum)
        },
        filters: {
          search,
          category,
          tags,
          color,
          size,
          material,
          season,
          minPrice, 
          maxPrice,
          gender,
          productGroup,
          productType,
          brand,
          fabric,
          work,
          style
        },
        totalAvailableProducts: total // Add total count of available products
      }
    };

    // Store in cache
    filterCache.set(cacheKey, response);

    // Return response
    res.json(response);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products',
      message: error.message
    });
  }
};

/**
 * Get available filter options based on product data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getProductFilters = async (req, res) => {
  const startTime = Date.now();
  try {
    const cacheKey = generateCacheKey(req.query);
    
    // Check cache
    if (filterCache.isValid(cacheKey)) {
      console.log('Cache hit - Response time:', Date.now() - startTime, 'ms');
      return res.json(filterCache.get(cacheKey));
    }

    console.log('Cache miss - Building new response');
    
    // Build optimized query
    const query = buildFilterQuery(req.query);
    
    // Track query pattern
    queryPatternTracker.trackQuery(query);

    // Get total count with caching
    const countKey = 'total_count';
    let totalAvailableProducts;
    
    if (countCache.isValid(countKey)) {
      totalAvailableProducts = countCache.get(countKey);
    } else {
      const countStart = Date.now();
      totalAvailableProducts = await Product.countDocuments({ isAvailable: true });
      countCache.set(countKey, totalAvailableProducts);
      console.log('Count query time:', Date.now() - countStart, 'ms');
    }

    // Optimized aggregation pipeline with better performance
    const aggStart = Date.now();
    const filterResults = await Product.aggregate([
      { 
        $match: query 
      },
      {
        $facet: {
          // Category and Collection filters
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
          // Attribute filters
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
          // Product metadata filters
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
          // Additional attribute filters
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
          // Price range
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
      hint: 'filter_aggregation_index',
      allowDiskUse: true
    });
    console.log('Aggregation time:', Date.now() - aggStart, 'ms');

    const result = filterResults[0];
    const priceRange = result.priceRange[0] || { minPrice: 0, maxPrice: 1000 };

    // Process and sort results
    const processResults = (items) => {
      return items
        .map(item => item._id)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    };

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

    // Store in optimized cache
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


const productController = {
  getProducts,
  getProductFilters
};

export default productController;