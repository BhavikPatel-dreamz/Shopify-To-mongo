import Product from '../models/Product.js';
import  UserInteraction  from '../models/UserInteraction.js';
import  UserPreference  from '../models/UserPreference.js';
import  vectorService  from '../services/vectorService.js';
import  {embeddingService}  from '../services/embeddingService.js';



/**
 * Get AI-based product recommendations for a user
 */
async function getRecommendations(req, res) {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    // Get user preference vector
    const userPreference = await UserPreference.findOne({ userId });
    
    if (!userPreference) {
      // If no preference vector exists, return popular products
      return getPopularProducts(req, res);
    }
    
    // Find similar products using the user's preference vector
    const similarProducts = await vectorService.searchSimilarProducts(
      userPreference.preferenceVector,
      { limit: 10 }
    );
    
    res.json({
      success: true,
      recommendations: similarProducts,
      source: 'user_preference'
    });
  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
}

/**
 * Get similar products based on a product ID
 */
async function getSimilarProducts(req, res) {
  try {
    const { productId } = req.params;
    
    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }
    
    // Find similar products
    const similarProducts = await vectorService.findSimilarProducts(productId, 10);
    
    res.json({
      success: true,
      similarProducts
    });
  } catch (error) {
    console.error('Error getting similar products:', error);
    res.status(500).json({ error: 'Failed to get similar products' });
  }
}

/**
 * Get popular products as fallback
 */
async function getPopularProducts(req, res) {
  try {
    // Get products with most views/likes
    const popularInteractions = await UserInteraction.aggregate([
      { $match: { interactionType: { $in: ['view', 'like', 'purchase'] } } },
      { $group: { _id: '$productId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    const productIds = popularInteractions.map(item => item._id);
    const products = await Product.find({ _id: { $in: productIds } });
    
    res.json({
      success: true,
      recommendations: products,
      source: 'popular'
    });
  } catch (error) {
    console.error('Error getting popular products:', error);
    res.status(500).json({ error: 'Failed to get popular products' });
  }
}

/**
 * Search products with AI
 */
async function searchProducts(req, res) {
  try {
    const { query, limit = 20 } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    // Use vector search for natural language understanding
    const searchResults = await vectorService.searchProductsByQuery(query, { 
      limit: parseInt(limit),
      minScore: 0.5
    });
    
    res.json({
      success: true,
      results: searchResults,
      count: searchResults.length
    });
  } catch (error) {
    console.error('Error searching products:', error);
    res.status(500).json({ error: 'Failed to search products' });
  }
}

/**
 * Filter products by attributes with AI enhancement
 */
async function filterProducts(req, res) {
  try {
    const { 
      color, size, material, season, gender, style, pattern, fit,
      minPrice, maxPrice, category, vendor, brand, productGroup, query, 
      sort, page = 1, limit = 20 
    } = req.query;
    
    // Build filter object
    const filter = { isAvailable: true };
    
    // Add all the attribute filters
    if (color) filter['attributes.color'] = { $regex: new RegExp(color, 'i') };
    if (size) filter['attributes.size'] = { $regex: new RegExp(size, 'i') };
    if (material) filter['attributes.material'] = { $regex: new RegExp(material, 'i') };
    if (season) filter['attributes.season'] = { $regex: new RegExp(season, 'i') };
    if (gender) filter['attributes.gender'] = { $regex: new RegExp(gender, 'i') };
    if (style) filter['attributes.style'] = { $regex: new RegExp(style, 'i') };
    if (pattern) filter['attributes.pattern'] = { $regex: new RegExp(pattern, 'i') };
    if (fit) filter['attributes.fit'] = { $regex: new RegExp(fit, 'i') };
    
    // Add brand and product group filters
    if (brand) filter.brand = { $regex: new RegExp(brand, 'i') };
    if (productGroup) filter.productGroup = { $regex: new RegExp(productGroup, 'i') };
    
    // Add price range filter
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }
    
    // Add category filter
    if (category) {
      filter.categories = { $in: [new RegExp(category, 'i')] };
    }
    
    // Add vendor filter
    if (vendor) {
      filter.vendor = { $regex: new RegExp(vendor, 'i') };
    }
    
    let products = [];
    let total = 0;
    
    // If natural language query is provided, use vector search
    if (query) {
      // Use vector search for natural language understanding
      products = await vectorService.searchProductsByQuery(query, { 
        limit: parseInt(limit) * 3, // Get more results to apply filters
        filter: filter // Apply filters in vector search
      });
      
      total = products.length;
      
      // Apply pagination manually
      const startIndex = (parseInt(page) - 1) * parseInt(limit);
      products = products.slice(startIndex, startIndex + parseInt(limit));
    } else {
      // Standard MongoDB filtering
      // Sorting
      let sortOption = { createdAt: -1 }; // Default sort by newest
      if (sort) {
        switch (sort) {
          case 'price_asc': sortOption = { price: 1 }; break;
          case 'price_desc': sortOption = { price: -1 }; break;
          case 'name_asc': sortOption = { name: 1 }; break;
          case 'name_desc': sortOption = { name: -1 }; break;
          case 'newest': sortOption = { createdAt: -1 }; break;
          case 'oldest': sortOption = { createdAt: 1 }; break;
        }
      }
      
      // Pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      // Execute query
      products = await Product.find(filter)
        .sort(sortOption)
        .skip(skip)
        .limit(parseInt(limit));
      
      // Get total count for pagination
      total = await Product.countDocuments(filter);
    }
    
    res.json({
      success: true,
      products,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error filtering products:', error);
    res.status(500).json({ error: 'Failed to filter products' });
  }
}

/**
 * Get available filter options
 */
async function getFilterOptions(req, res) {
  try {
    // Get distinct values for each filter attribute
    const colors = await Product.distinct('attributes.color');
    const sizes = await Product.distinct('attributes.size');
    const materials = await Product.distinct('attributes.material');
    const seasons = await Product.distinct('attributes.season');
    const genders = await Product.distinct('attributes.gender');
    const styles = await Product.distinct('attributes.style');
    const patterns = await Product.distinct('attributes.pattern');
    const fits = await Product.distinct('attributes.fit');
    const categories = await Product.distinct('categories');
    const vendors = await Product.distinct('vendor');
    const brands = await Product.distinct('brand');
    const productGroups = await Product.distinct('productGroup');
    
    // Get price range
    const priceStats = await Product.aggregate([
      {
        $group: {
          _id: null,
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' }
        }
      }
    ]);
    
    const priceRange = priceStats.length > 0 
      ? { min: priceStats[0].minPrice, max: priceStats[0].maxPrice }
      : { min: 0, max: 1000 };
    
    res.json({
      colors: colors.filter(Boolean),
      sizes: sizes.filter(Boolean),
      materials: materials.filter(Boolean),
      seasons: seasons.filter(Boolean),
      genders: genders.filter(Boolean),
      styles: styles.filter(Boolean),
      patterns: patterns.filter(Boolean),
      fits: fits.filter(Boolean),
      categories: categories.filter(Boolean),
      vendors: vendors.filter(Boolean),
      brands: brands.filter(Boolean),
      productGroups: productGroups.filter(Boolean),
      priceRange
    });
  } catch (error) {
    console.error('Error getting filter options:', error);
    res.status(500).json({ error: 'Failed to get filter options' });
  }
}

export default {
  getRecommendations,
  getSimilarProducts,
  getPopularProducts,
  searchProducts,
  filterProducts,
  getFilterOptions
}; 