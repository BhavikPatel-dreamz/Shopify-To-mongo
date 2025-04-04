import Product from '../models/Product.js';
import vectorService from '../services/vectorService.js';



// Create a simple in-memory cache
const filterCache = {
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

/**
 * Get products with filtering, sorting, and pagination
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getProducts = async (req, res) => {
  try {
    const cacheKey = generateCacheKey(req.query);
    
    // // Check if we have a valid cached response
    // if (isCacheValid(cacheKey)) {
    //   console.log('Returning cached filter results');
    //   return res.json(filterCache.data[cacheKey]);
    // }

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
      work
    } = req.query;

    // Build filter query
    const query = {};

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

    // Apply filters based on tags and attributes
    if (category) {
      query.categories = Array.isArray(category) ? { $in: category } : category;
    }

    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      query.tags = { $in: tagArray };
    }

    if (color) {
      query['attributes.color'] = Array.isArray(color) ? { $in: color } : color;
    }
    
    if (size) {
      query['attributes.size'] = Array.isArray(size) ? { $in: size } : size;
    }
    
    if (material) {
      query['attributes.material'] = Array.isArray(material) ? { $in: material } : material;
    }
    
    if (season) {
      query['attributes.season'] = Array.isArray(season) ? { $in: season } : season;
    }

    if (gender) {
      query['attributes.gender'] = Array.isArray(gender) ? { $in: gender } : gender;
    }

    if (productGroup) {
      query.productGroup = Array.isArray(productGroup) ? { $in: productGroup } : productGroup;
    }

    if (productType) {
      query.productType = Array.isArray(productType) ? { $in: productType } : productType;
    }

    if (brand) {
      query.brand = Array.isArray(brand) ? { $in: brand } : brand;
    }

    if (fabric) {
      query['attributes.fabric'] = Array.isArray(fabric) ? { $in: fabric } : fabric;
    }

    if (work) {
      query['attributes.work'] = Array.isArray(work) ? { $in: work } : work;
    }

    // Price range filter
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    // Stock filter
    if (inStock === 'true') {
      query.isAvailable = true;
    } else if (inStock === 'false') {
      query.isAvailable = false;
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

    // Get total count for pagination
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
          inStock,
          gender,
          productGroup,
          productType,
          brand,
          fabric,
          work
        }
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
    // Extract current filters from the request query
    const { tags, category, color, size, material, season, gender, productGroup, productType, brand, fabric, work } = req.query;

    // Build the query based on current filters
    const query = {};

    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      query.tags = { $in: tagArray };
    }

    if (category) {
      query.categories = Array.isArray(category) ? { $in: category } : category;
    }

    if (color) {
      query['attributes.color'] = Array.isArray(color) ? { $in: color } : color;
    }

    if (size) {
      query['attributes.size'] = Array.isArray(size) ? { $in: size } : size;
    }

    if (material) {
      query['attributes.material'] = Array.isArray(material) ? { $in: material } : material;
    }

    if (season) {
      query['attributes.season'] = Array.isArray(season) ? { $in: season } : season;
    }

    if (gender) {
      query['attributes.gender'] = Array.isArray(gender) ? { $in: gender } : gender;
    }

    if (productGroup) {
      query.productGroup = Array.isArray(productGroup) ? { $in: productGroup } : productGroup;
    }

    if (productType) {
      query.productType = Array.isArray(productType) ? { $in: productType } : productType;
    }

    if (brand) {
      query.brand = Array.isArray(brand) ? { $in: brand } : brand;
    }

    if (fabric) {
      query['attributes.fabric'] = Array.isArray(fabric) ? { $in: fabric } : fabric;
    }

    if (work) {
      query['attributes.work'] = Array.isArray(work) ? { $in: work } : work;
    }

    // Fetch distinct values for each filter based on the entire query
    const categories = await Product.distinct('categories', query);
    const colors = await Product.distinct('attributes.color', query);
    const sizes = await Product.distinct('attributes.size', query);
    const materials = await Product.distinct('attributes.material', query);
    const seasons = await Product.distinct('attributes.season', query);
    const genders = await Product.distinct('attributes.gender', query);
    const productGroups = await Product.distinct('productGroup', query);
    const productTypes = await Product.distinct('productType', query);
    const brands = await Product.distinct('brand', query);
    const fabrics = await Product.distinct('attributes.fabric', query);
    const works = await Product.distinct('attributes.work', query);

    // Calculate price range based on the entire query
    const priceData = await Product.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' }
        }
      }
    ]);

    const priceRange = priceData.length > 0 
      ? { min: priceData[0].minPrice, max: priceData[0].maxPrice }
      : { min: 0, max: 1000 };

    // Return the available filter options
    res.json({
      success: true,
      data: {
        categories: categories.filter(Boolean),
        tags: tags ? tags.split(',') : [],
        attributes: {
          colors: colors.filter(Boolean),
          sizes: sizes.filter(Boolean),
          materials: materials.filter(Boolean),
          seasons: seasons.filter(Boolean),
          genders: genders.filter(Boolean),
          fabrics: fabrics.filter(Boolean),
          works: works.filter(Boolean)
        },
        productGroups: productGroups.filter(Boolean),
        productTypes: productTypes.filter(Boolean),
        brands: brands.filter(Boolean),
        priceRange
      }
    });
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