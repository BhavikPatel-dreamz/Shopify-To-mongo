import Product from '../models/Product.js';
import vectorService from '../services/vectorService.js';
import { queryPatternTracker } from '../models/Product.js';



// Create a simple in-memory cache
const filterCache = {
  data: {},
  timeout: 60 * 60 * 1000, // 100 minutes cache timeout
  timestamps: {}
};

// Create a more efficient cache with size limits
const filterCacheObject = {
  data: new Map(),
  timeout: 60 * 60 * 1000, // 1 hour cache timeout
  maxSize: 1000, // Maximum number of cached items
  timestamps: new Map(),
  
  set: function(key, value) {
    // Remove oldest items if cache is full
    if (this.data.size >= this.maxSize) {
      const oldestKey = Array.from(this.timestamps.entries())
        .sort((a, b) => a[1] - b[1])[0][0];
      this.data.delete(oldestKey);
      this.timestamps.delete(oldestKey);
    }
    
    this.data.set(key, value);
    this.timestamps.set(key, Date.now());
  },
  
  get: function(key) {
    return this.data.get(key);
  },
  
  isValid: function(key) {
    const timestamp = this.timestamps.get(key);
    if (!timestamp) return false;
    return (Date.now() - timestamp) < this.timeout;
  },
  
  clear: function() {
    this.data.clear();
    this.timestamps.clear();
  }
};



// Helper function to generate cache key from query parameters
const generateCacheKey = (queryParams) => {
  return JSON.stringify(queryParams || {});
};

// Helper function to check if cache is valid
const isCacheValid = (key) => {
  if (!filterCache.data[key]) return false;
  
  const timestamp = filterCache.timestamps[key] || 0;
  const now = Date.now();
  return (now - timestamp) < filterCache.timeout;
};

const isCacheValidObject = (key) => {
  if (!filterCacheObject.data.get(key)) return false;
  
  const timestamp = filterCacheObject.timestamps.get(key);
  const now = Date.now();
  return (now - timestamp) < filterCacheObject.timeout;
};

// Update the helper function to handle comma-separated values
const createCaseInsensitivePatterns = (values) => {
  if (typeof values === 'string') {
    // Split comma-separated values
    values = values.split(',').map(v => v.trim());
  }
  const valueArray = Array.isArray(values) ? values : [values];
  return valueArray.map(value => new RegExp(`^${value}$`, 'i'));
};

// Helper function to optimize query building
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
    if (isCacheValid(cacheKey)) {
      console.log('Returning cached filter results');
      return res.json(filterCache.data[cacheKey]);
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
    filterCache.data[cacheKey] = response;
    filterCache.timestamps[cacheKey] = Date.now();
     
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
    if (filterCacheObject.isValid(cacheKey)) {
      console.log('Cache hit - Response time:', Date.now() - startTime, 'ms');
      return res.json(filterCacheObject.get(cacheKey));
    }

    console.log('Cache miss - Building new response');
    
    // Build optimized query
    const query = buildFilterQuery(req.query);
    
    // Track query pattern
    queryPatternTracker.trackQuery(query);

    // Get total count of available products (cached separately)
    const countStart = Date.now();
    const totalAvailableProducts = await Product.countDocuments({ isAvailable: true });
    console.log('Count query time:', Date.now() - countStart, 'ms');

    // Optimized aggregation pipeline
    const aggStart = Date.now();
    const filterResults = await Product.aggregate([
      { 
        $match: query 
      },
      {
        $facet: {
          categories: [
            { $unwind: { path: '$categories', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$categories' } }
          ],
          colors: [
            { $unwind: { path: '$attributes.color', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$attributes.color' } }
          ],
          sizes: [
            { $unwind: { path: '$attributes.size', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$attributes.size' } }
          ],
          materials: [
            { $unwind: { path: '$attributes.material', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$attributes.material' } }
          ],
          seasons: [
            { $unwind: { path: '$attributes.season', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$attributes.season' } }
          ],
          genders: [
            { $unwind: { path: '$attributes.gender', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$attributes.gender' } }
          ],
          productGroups: [
            { $match: { productGroup: { $ne: null } } },
            { $group: { _id: '$productGroup' } }
          ],
          productTypes: [
            { $match: { productType: { $ne: null } } },
            { $group: { _id: '$productType' } }
          ],
          brands: [
            { $match: { brand: { $ne: null } } },
            { $group: { _id: '$brand' } }
          ],
          fabrics: [
            { $unwind: { path: '$attributes.fabric', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$attributes.fabric' } }
          ],
          works: [
            { $unwind: { path: '$attributes.work', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$attributes.work' } }
          ],
          collections: [
            { $unwind: { path: '$collections', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$collections' } }
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
      hint: 'filter_aggregation_index'
    });
    console.log('Aggregation time:', Date.now() - aggStart, 'ms');

    const result = filterResults[0];
    const priceRange = result.priceRange[0] || { minPrice: 0, maxPrice: 1000 };

    const response = {
      success: true,
      data: {
        totalAvailableProducts,
        categories: result.categories.map(c => c._id).filter(Boolean),
        collections: result.collections.map(c => c._id).filter(Boolean),
        tags: req.query.tags ? req.query.tags.split(',') : [],
        attributes: {
          colors: result.colors.map(c => c._id).filter(Boolean),
          sizes: result.sizes.map(s => s._id).filter(Boolean),
          materials: result.materials.map(m => m._id).filter(Boolean),
          seasons: result.seasons.map(s => s._id).filter(Boolean),
          genders: result.genders.map(g => g._id).filter(Boolean),
          fabrics: result.fabrics.map(f => f._id).filter(Boolean),
          works: result.works.map(w => w._id).filter(Boolean)
        },
        productGroups: result.productGroups.map(pg => pg._id).filter(Boolean),
        productTypes: result.productTypes.map(pt => pt._id).filter(Boolean),
        brands: result.brands.map(b => b._id).filter(Boolean),
        priceRange: {
          min: priceRange.minPrice,
          max: priceRange.maxPrice
        }
      }
    };

    // Store in optimized cache
    filterCacheObject.set(cacheKey, response);

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