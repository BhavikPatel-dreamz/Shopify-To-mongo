import Product from '../models/Product.js';
import vectorService from '../services/vectorService.js';
import { queryPatternTracker } from '../models/Product.js';



// Create a simple in-memory cache
const filterCache = {
  data: {},
  timeout: 60 * 60 * 1000, // 100 minutes cache timeout
  timestamps: {}
};

const filterCacheObject = {
  data: {},
  timeout: 60 * 60 * 1000, // 100 minutes cache timeout
  timestamps: {}
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
  if (!filterCacheObject.data[key]) return false;
  
  const timestamp = filterCacheObject.timestamps[key] || 0;
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
  try {
    const cacheKey = generateCacheKey(req.query);
    
    // Check if we have a valid cached response
    if (isCacheValidObject(cacheKey)) {
      console.log('Returning cached Product Filter results');
      return res.json(filterCacheObject.data[cacheKey]);
    }

    // Extract current filters from the request query
    const { collections, tags, category, color, size, material, season, gender, productGroup, productType, brand, fabric, work, style } = req.query;

    // Build the query - Always include isAvailable: true
    const query = {
      isAvailable: true
    };

    // Add other filters
    if (tags) {
      query.tags = { $in: createCaseInsensitivePatterns(tags) };
    }

    if (category) {
      query.categories = { $in: createCaseInsensitivePatterns(category) };
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

    if (collections) {
      const collectionArray = collections.replaceAll('-', ' ').split(',');
      query.collections = { $in: createCaseInsensitivePatterns(collectionArray) };
    }

    if (style) {
      query['attributes.style'] = { $in: createCaseInsensitivePatterns(style) };
    }

    // Track this query pattern for dynamic indexing
    queryPatternTracker.trackQuery(query);

    // Get total count of available products
    const totalAvailableProducts = await Product.countDocuments({ isAvailable: true });

    // Combined aggregation pipeline for all filters
    const filterResults = await Product.aggregate([
      { $match: query },
      {
        $facet: {
          categories: [{ $unwind: '$categories' }, { $group: { _id: '$categories' } }],
          colors: [{ $unwind: '$attributes.color' }, { $group: { _id: '$attributes.color' } }],
          sizes: [{ $unwind: '$attributes.size' }, { $group: { _id: '$attributes.size' } }],
          materials: [{ $unwind: '$attributes.material' }, { $group: { _id: '$attributes.material' } }],
          seasons: [{ $unwind: '$attributes.season' }, { $group: { _id: '$attributes.season' } }],
          genders: [{ $unwind: '$attributes.gender' }, { $group: { _id: '$attributes.gender' } }],
          productGroups: [{ $group: { _id: '$productGroup' } }],
          productTypes: [{ $group: { _id: '$productType' } }],
          brands: [{ $group: { _id: '$brand' } }],
          fabrics: [{ $unwind: '$attributes.fabric' }, { $group: { _id: '$attributes.fabric' } }],
          works: [{ $unwind: '$attributes.work' }, { $group: { _id: '$attributes.work' } }],
          collections: [{ $unwind: '$collections' }, { $group: { _id: '$collections' } }],
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
    ]).option({ maxTimeMS: 30000 }); // Add timeout of 30 seconds

    const result = filterResults[0];
    const priceRange = result.priceRange[0] || { minPrice: 0, maxPrice: 1000 };

    const response = {
      success: true,
      data: {
        totalAvailableProducts,
        categories: result.categories.map(c => c._id).filter(Boolean),
        collections: result.collections.map(c => c._id).filter(Boolean),
        tags: tags ? tags.split(',') : [],
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

    // Store in cache
    filterCacheObject.data[cacheKey] = response;
    filterCacheObject.timestamps[cacheKey] = Date.now();

    res.json(response);
  } catch (error) {
    console.error('Error fetching product filters:', error);
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