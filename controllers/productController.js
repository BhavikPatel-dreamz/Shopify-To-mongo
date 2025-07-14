import Product from '../models/Product.js';
import vectorService from '../services/vectorService.js';
import { queryPatternTracker } from '../models/Product.js';
import AdvancedCache from '../utils/AdvancedCache.js';
import Order from '../models/Order.js';
  

/**
 * Cache Configuration for Products
 * 
 * productCache: Stores product query results
 * - Capacity: 2000 entries
 * - TTL: 5 days
 * - Cleanup: Every 10 minutes
 */
const productCache = new AdvancedCache({
  maxSize: 2000,
  timeout: 5 * 24 * 60 * 60 * 1000, // 5 days
  cleanupInterval: 10 * 60 * 1000 // 10 minutes
});

/**
 * Creates case-insensitive regex patterns for filtering
 * @param {string|Array} values - Filter values to convert to patterns
 * @returns {Array} Array of RegExp objects for MongoDB queries
 */
const createCaseInsensitivePatterns = (values) => {
  if (typeof values === 'string') {
    values = values.split(',').map(v => v.trim());
  }
  const valueArray = Array.isArray(values) ? values : [values];
  return valueArray.map(value => new RegExp(`^${value}$`, 'i'));
};

/**
 * Shared query builder for both products and filters
 * 
 * Features:
 * - Handles text search with vector search fallback
 * - Supports multiple filter types
 * - Case-insensitive matching
 * - Price range filtering
 * 
 * Supported Filters:
 * - Full-text search
 * - Categories and collections
 * - Product attributes (color, size, etc.)
 * - Price ranges
 * - Brand and type information
 * 
 * @param {Object} queryParams - Query parameters from request
 * @returns {Object} MongoDB query object
 */
export const buildSharedQuery = async (queryParams) => {
  const {
    search = '',
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
    collections,
    style,
    id,
    productId
  } = queryParams;

  // Base query - always include available products
  const query = {
    isAvailable: true
  };

  // Filter by id or productId if provided
  if (id) {
    query.productId = id;
    return query;
  }
  if (productId) {
    query.productId = productId;
    return query;
  }

  // Handle search
  if (search && search.length >= 3) {
    try {
      const queryEmbedding = await vectorService.generateQueryEmbedding(search);
      const similarProducts = await vectorService.searchSimilarProducts(queryEmbedding, {
        limit: parseInt(queryParams.limit || 20),
        minScore: 0.6
      });
      
      if (similarProducts.length > 0) {
        query._id = { $in: similarProducts.map(p => p.productId) };
      } else {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { 'tags': { $regex: search, $options: 'i' } }
        ];
      }
    } catch (error) {
      console.error('Vector search failed, falling back to text search:', error);
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'tags': { $regex: search, $options: 'i' } }
      ];
    }
  } else if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { 'tags': { $regex: search, $options: 'i' } }
    ];
  }

  // Apply common filters
  if (category) {
    query.categories = { $in: createCaseInsensitivePatterns(category) };
  }

  if (collections && collections.toLowerCase() !== 'products' && collections.toLowerCase() !== 'all') {
    const collectionArray = collections.replaceAll('-', ' ').split(',').map(c => c.trim());
    query.collections = {
      $in: createCaseInsensitivePatterns(collectionArray)
    };
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

  // Price range filter
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = parseFloat(minPrice);
    if (maxPrice) query.price.$lte = parseFloat(maxPrice);
  }

  return query;
};

// Helper function to generate a consistent cache key for products
const generateProductCacheKey = (filters) => {
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
  return `products:${JSON.stringify(sortedFilters)}`;
};

/**
 * Get products with filtering, sorting, and pagination
 * 
 * Features:
 * - Advanced filtering with shared query builder
 * - Smart caching system
 * - Flexible sorting options
 * - Pagination support
 * 
 * Sorting Options:
 * - featured: By featured status
 * - best_selling: By sales count
 * - alphabetical: By name (asc/desc)
 * - price: By price (asc/desc)
 * - date: By creation date (old/new)
 * 
 * Response includes:
 * - Filtered products array
 * - Pagination details
 * - Total count
 * - Applied filters
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getProducts = async (req, res) => {
  try {
    const { page = 1, limit = 20, sort = 'createdAt', order = 'desc', bypassCache = false, ...filters } = req.query;
    
    
    // Include pagination and sorting in cache key
    const cacheFilters = {
      ...filters,
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      order
    };

    // Generate a specific cache key for products
    const baseKey = generateProductCacheKey(cacheFilters);

    // Try to get from cache only if not bypassing
    if (!bypassCache) {
      const cachedResult = productCache.get(baseKey);
      if (cachedResult && productCache.isValid(baseKey)) {
        console.log('Cache hit for products');
        return res.json(cachedResult);
      }
    }

    const query = await buildSharedQuery(filters);

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Determine sort order
    let sortOptions = {};
    switch (sort) {
      case 'featured':
        sortOptions = { featured: -1 };
        break;
      case 'best_seller': {
        // Build product query with filters
        const productQuery = await buildSharedQuery(filters);

       // Get all products matching the filters with pagination
        const [products, total] = await Promise.all([
          Product.find(productQuery)
            .skip(skip)
            .limit(limitNum)
            .lean(),
          Product.countDocuments(productQuery)
        ]);
        const productIds = products.map(p => p.productId);


        const salesData = await Order.aggregate([
          { $match: { product_id: { $in: productIds } } },
          { $group: { _id: '$product_id', totalSaleQty: { $sum: '$quantity' } } }
        ]);
        const salesDataMap = new Map(salesData.map(item => [item._id, item.totalSaleQty]));
        const productsWithSaleQty = products.map(product => ({
          ...product,
          totalSaleQty: salesDataMap.get(product.productId) || 0,
          productUrl: product.productUrl
        }));
        productsWithSaleQty.sort((a, b) => b.totalSaleQty - a.totalSaleQty);

        const response = {
          success: true,
          data: {
            products: productsWithSaleQty,
            pagination: {
              total,
              page: pageNum,
              limit: limitNum,
              pages: Math.ceil(total / limitNum)
            },
            filters: req.query,
            totalAvailableProducts: total
          }
        };

        if (!bypassCache) {
          productCache.set(baseKey, response);
        }

        return res.json(response);
      }
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
        sortOptions = { createdAt: -1 };
    }

    // Execute query with pagination
    const [products, total] = await Promise.all([
      Product.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Product.countDocuments(query)
    ]);

    // Fetch sales data for products in this page
    const productIds = products.map(p => p.productId);
    const salesData = await Order.aggregate([
      { $match: { product_id: { $in: productIds } } },
      { $group: { _id: '$product_id', totalSaleQty: { $sum: '$quantity' } } }
    ]);
    const salesDataMap = new Map(salesData.map(item => [item._id, item.totalSaleQty]));

    const productsWithSaleQty = products.map(product => ({
      ...product,
      totalSaleQty: salesDataMap.get(product.productId) || 0,
      productUrl: product.productUrl
    }));

    const response = {
      success: true,
      data: {
        products: productsWithSaleQty,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum)
        },
        filters: req.query,
        totalAvailableProducts: total
      }
    };

    // Store in cache only if not bypassing
    if (!bypassCache) {
      productCache.set(baseKey, response);
    }
    
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

export const getProductSalesStats = async (req, res) => {
    try {
        const { limit = 20, page = 1 } = req.query;
        const skip = (page - 1) * limit;

        // Aggregate orders to get sales statistics
        const salesStats = await Order.aggregate([
            {
                $group: {
                    _id: '$product_id',
                    totalSale: { $sum: '$quantity' }
                }
            },
            {
                $sort: { totalSale: -1 }
            },
            {
                $skip: skip
            },
            {
                $limit: parseInt(limit)
            },
            {
                $project: {
                    _id: 0,
                    productId: '$_id',
                    totalSale: 1
                }
            }
        ]);

        // Get total count for pagination
        const totalProducts = await Order.aggregate([
            {
                $group: {
                    _id: '$product_id'
                }
            },
            {
                $count: 'total'
            }
        ]);

        const total = totalProducts[0]?.total || 0;

        res.json({
            success: true,
            data: {
                salesStats,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        console.error('Error fetching product sales stats:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch product sales statistics',
            message: error.message
        });
    }
};

async function getBestSellingProducts(limit = 10, matchParams = {}) {
  const bestSellers = await Order.aggregate([
    // Optional: Filter by extra conditions (like date range)
    { $match: matchParams },

    // Group by product_id and sum the quantity
    {
      $group: {
        _id: '$product_id',
        totalSold: { $sum: '$quantity' },
      },
    },

    // Sort by total quantity sold, descending
    { $sort: { totalSold: -1 } },

    // Limit results
    { $limit: limit },

    // Lookup product details from Product collection
    {
      $lookup: {
        from: 'products',               // must match actual collection name
        localField: '_id',              // product_id in order collection
        foreignField: 'productId',      // productId in product collection
        as: 'product',
      },
    },

    // Unwind product array to object
    { $unwind: '$product' },

    // Project the final output
    {
      $project: {
        _id: 0,
        productId: '$_id',
        totalSold: 1,
        product: 1,
      },
    },
  ]);

  return bestSellers;
}

export default {
  getProducts,
  getProductSalesStats
};