import mongoose from "mongoose";

const ProductSchema = new mongoose.Schema({
  productId: {
    type: String,
    required: true,
    unique: true,
  },
  handle: {
    type: String,

    unique: true,
  },
  shopifyId: {
    type: String,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  compareAtPrice: {
    type: Number,
  },
  categories: [String],
  tags: [String],
  structuredTags: {
    type: Map,
    of: String,
  },
  brand: String,
  productGroup: String,
  vendor: String,
  productType: String,
  collections: [String],
  attributes: {
    color: String,
    size: String,
    material: String,
    season: String,
    gender: String,
    style: String,
    pattern: String,
    fit: String,
    fabric: String,
    work: String,
  },
  variants: [
    {
      variantId: String,
      title: String,
      price: Number,
      sku: String,
      inventory: Number,
      attributes: {
        color: String,
        size: String,
        material: String,
      },
    },
  ],
  images: [
    {
      url: String,
      alt: String,
    },
  ],
  imageUrl: String, // Main product image
  productUrl: String, // Add the product URL field
  isAvailable: {
    type: Boolean,
    default: true,
  },
  hasEmbedding: {
    type: Boolean,
    default: false,
  },
  vectorId: String, // Reference to the vector in Pinecone
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Add text indexes for search
ProductSchema.index({
  name: "text",
  description: "text",
  "attributes.color": "text",
  "attributes.material": "text",
  "attributes.size": "text",
  "attributes.season": "text",
  "attributes.gender": "text",
  "attributes.style": "text",
  "attributes.pattern": "text",
  "attributes.fabric": "text",
  "attributes.fit": "text",
  "attributes.work": "text",
  "attributes.group": "text",
  tags: "text",
  brand: "text",
  productGroup: "text",
});

// Add compound indexes for common query patterns
ProductSchema.index({ isAvailable: 1, createdAt: -1 }); // For default sorting
ProductSchema.index({ isAvailable: 1, price: 1 }); // For price sorting
ProductSchema.index({ isAvailable: 1, name: 1 }); // For name sorting
ProductSchema.index({ isAvailable: 1, brand: 1 }); // For brand filtering
ProductSchema.index({ isAvailable: 1, productGroup: 1 }); // For product group filtering
ProductSchema.index({ isAvailable: 1, "attributes.color": 1 }); // For color filtering
ProductSchema.index({ isAvailable: 1, "attributes.size": 1 }); // For size filtering
ProductSchema.index({ isAvailable: 1, "attributes.gender": 1 }); // For gender filtering
ProductSchema.index({ isAvailable: 1, "attributes.style": 1 }); // For style filtering
ProductSchema.index({ isAvailable: 1, collections: 1 }); // For collections filtering
ProductSchema.index({ isAvailable: 1, "attributes.group": 1 }); // For group filtering
ProductSchema.index({ isAvailable: 1, "attributes.material": 1 }); // For material filtering
ProductSchema.index({ isAvailable: 1, "attributes.season": 1 }); // For season filtering
ProductSchema.index({ isAvailable: 1, "attributes.fabric": 1 }); // For fabric filtering
ProductSchema.index({ isAvailable: 1, "attributes.fit": 1 }); // For fit filtering
ProductSchema.index({ isAvailable: 1, "attributes.work": 1 }); // For work filtering
ProductSchema.index({ isAvailable: 1, "attributes.pattern": 1 }); // For pattern filtering


// Add compound index for price range queries
ProductSchema.index({ isAvailable: 1, price: 1, createdAt: -1 });

// Add compound index for category and tag filtering
ProductSchema.index({ isAvailable: 1, categories: 1 });
ProductSchema.index({ isAvailable: 1, tags: 1 });

// Add compound index for multiple attribute filtering
ProductSchema.index({ 
  isAvailable: 1, 
  "attributes.color": 1, 
  "attributes.size": 1, 
  "attributes.gender": 1 
});

// Add index for productId and handle for quick lookups
ProductSchema.index({ productId: 1 }, { unique: true });
ProductSchema.index({ handle: 1 }, { unique: true });
ProductSchema.index({ shopifyId: 1 }, { unique: true });

// Add indexes for filter fields
ProductSchema.index({ isAvailable: 1 });
ProductSchema.index({ categories: 1 });
ProductSchema.index({ 'attributes.color': 1 });
ProductSchema.index({ 'attributes.size': 1 });
ProductSchema.index({ 'attributes.material': 1 });
ProductSchema.index({ 'attributes.season': 1 });
ProductSchema.index({ 'attributes.gender': 1 });
ProductSchema.index({ productGroup: 1 });
ProductSchema.index({ productType: 1 });
ProductSchema.index({ brand: 1 });
ProductSchema.index({ 'attributes.fabric': 1 });
ProductSchema.index({ 'attributes.work': 1 });
ProductSchema.index({ collections: 1 });
ProductSchema.index({ price: 1 });

// Add optimized compound indexes for filter aggregation
ProductSchema.index({ 
  isAvailable: 1,
  categories: 1,
  'attributes.color': 1,
  'attributes.size': 1,
  'attributes.material': 1,
  'attributes.season': 1,
  'attributes.gender': 1,
  productGroup: 1,
  productType: 1,
  brand: 1,
  'attributes.fabric': 1,
  'attributes.work': 1,
  collections: 1,
  price: 1
}, { name: 'filter_aggregation_index' });

// Add index for unwind operations
ProductSchema.index({ 
  isAvailable: 1,
  categories: 1,
  collections: 1,
  'attributes.color': 1,
  'attributes.size': 1,
  'attributes.material': 1,
  'attributes.season': 1,
  'attributes.gender': 1,
  'attributes.fabric': 1,
  'attributes.work': 1
}, { name: 'unwind_operations_index' });

// Add optimized indexes for filter operations
ProductSchema.index({ 
  isAvailable: 1,
  categories: 1,
  collections: 1,
  tags: 1
}, { name: 'category_collection_index' });

ProductSchema.index({ 
  isAvailable: 1,
  'attributes.color': 1,
  'attributes.size': 1,
  'attributes.material': 1,
  'attributes.season': 1,
  'attributes.gender': 1
}, { name: 'attributes_index' });

ProductSchema.index({ 
  isAvailable: 1,
  productGroup: 1,
  productType: 1,
  brand: 1
}, { name: 'product_metadata_index' });

ProductSchema.index({ 
  isAvailable: 1,
  'attributes.fabric': 1,
  'attributes.work': 1,
  'attributes.style': 1
}, { name: 'product_details_index' });

// Add index for price range queries
ProductSchema.index({ 
  isAvailable: 1,
  price: 1
}, { name: 'price_index' });

ProductSchema.pre('save', function (next) {
  if (this.collections && Array.isArray(this.collections)) {
    this.collections = this.collections.map(c =>
      slugify(c, { lower: true, strict: true })
    );
  }
  next();
});

// Enhanced function to create dynamic indexes based on query patterns
const createDynamicIndex = async (queryPattern) => {
  try {
    const indexFields = { isAvailable: 1 };
    const sortFields = new Set();
    
    // Add fields from query pattern to index
    Object.entries(queryPattern).forEach(([field, value]) => {
      // Handle special fields
      if (field === 'price') {
        indexFields[field] = 1;
        sortFields.add(field);
      } else if (field === 'createdAt') {
        indexFields[field] = -1;
        sortFields.add(field);
      } else if (field.startsWith('attributes.')) {
        indexFields[field] = 1;
      } else if (['categories', 'collections', 'tags'].includes(field)) {
        indexFields[field] = 1;
      } else if (['brand', 'productGroup', 'productType'].includes(field)) {
        indexFields[field] = 1;
      } else if (['featured', 'sales'].includes(field)) {
        indexFields[field] = -1;
        sortFields.add(field);
      } else if (field === 'name') {
        indexFields[field] = 1;
        sortFields.add(field);
      }
    });

    // Create index name based on fields and their order
    const indexName = `dynamic_${Object.keys(indexFields).join('_')}`;
    
    // Check if index already exists
    const existingIndexes = await mongoose.model('Product').collection.indexes();
    const indexExists = existingIndexes.some(index => 
      index.name === indexName || 
      JSON.stringify(index.key) === JSON.stringify(indexFields)
    );

    if (!indexExists) {
      await mongoose.model('Product').collection.createIndex(indexFields, {
        name: indexName,
        background: true // Create index in background
      });
      console.log(`Created new dynamic index: ${indexName}`);
      
      // Log index details for monitoring
      console.log('Index fields:', indexFields);
      console.log('Sort fields:', Array.from(sortFields));
    }

    return indexName;
  } catch (error) {
    console.error('Error creating dynamic index:', error);
    return null;
  }
};

// Enhanced query pattern tracker with more sophisticated pattern analysis
const queryPatternTracker = {
  patterns: new Map(),
  threshold: 50, // Reduced threshold to create indexes more quickly
  maxPatterns: 100, // Maximum number of patterns to track
  patternStats: new Map(), // Track pattern statistics
  
  trackQuery: function(query) {
    try {
      // Normalize query by removing pagination and sorting
      const normalizedQuery = this.normalizeQuery(query);
      const patternKey = JSON.stringify(normalizedQuery);
      
      // Update pattern count
      const count = (this.patterns.get(patternKey) || 0) + 1;
      this.patterns.set(patternKey, count);
      
      // Update pattern statistics
      const stats = this.patternStats.get(patternKey) || {
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        totalQueries: 0,
        avgResponseTime: 0
      };
      
      stats.lastSeen = Date.now();
      stats.totalQueries += 1;
      this.patternStats.set(patternKey, stats);
      
      // Clean up old patterns if we exceed maxPatterns
      if (this.patterns.size > this.maxPatterns) {
        this.cleanupOldPatterns();
      }
      
      // Create index if threshold is reached
      if (count === this.threshold) {
        console.log(`Pattern reached threshold (${count} queries):`, normalizedQuery);
        createDynamicIndex(normalizedQuery);
      }
      
      return {
        patternKey,
        count,
        stats: this.patternStats.get(patternKey)
      };
    } catch (error) {
      console.error('Error tracking query pattern:', error);
      return null;
    }
  },
  
  normalizeQuery: function(query) {
    const normalized = { ...query };
    
    // Remove pagination and sorting fields
    delete normalized.page;
    delete normalized.limit;
    delete normalized.sort;
    delete normalized.order;
    
    // Normalize array fields
    Object.keys(normalized).forEach(key => {
      if (Array.isArray(normalized[key])) {
        normalized[key] = normalized[key].sort().join(',');
      }
    });
    
    return normalized;
  },
  
  cleanupOldPatterns: function() {
    const now = Date.now();
    const oldPatterns = Array.from(this.patterns.entries())
      .filter(([_, count]) => count < this.threshold / 2)
      .map(([key]) => key);
    
    oldPatterns.forEach(key => {
      this.patterns.delete(key);
      this.patternStats.delete(key);
    });
    
    console.log(`Cleaned up ${oldPatterns.length} old patterns`);
  },
  
  getPatternStats: function() {
    return {
      totalPatterns: this.patterns.size,
      activePatterns: Array.from(this.patterns.entries())
        .filter(([_, count]) => count >= this.threshold)
        .length,
      topPatterns: Array.from(this.patterns.entries())
        .sort(([_, a], [__, b]) => b - a)
        .slice(0, 10)
        .map(([key, count]) => ({
          pattern: JSON.parse(key),
          count,
          stats: this.patternStats.get(key)
        }))
    };
  }
};

// Export the enhanced functions
export { createDynamicIndex, queryPatternTracker };

// Add optimized compound indexes for pagination and sorting
ProductSchema.index({ 
  isAvailable: 1,
  createdAt: -1,
  price: 1
}, { name: 'pagination_created_price' });

ProductSchema.index({ 
  isAvailable: 1,
  collections: 1,
  createdAt: -1,
  price: 1
}, { name: 'pagination_collection_created_price' });

ProductSchema.index({ 
  isAvailable: 1,
  collections: 1,
  'attributes.color': 1,
  createdAt: -1
}, { name: 'pagination_collection_color_created' });

ProductSchema.index({ 
  isAvailable: 1,
  collections: 1,
  'attributes.color': 1,
  price: 1,
  createdAt: -1
}, { name: 'pagination_collection_color_price_created' });

// Add indexes for common filter combinations with pagination
ProductSchema.index({ 
  isAvailable: 1,
  collections: 1,
  'attributes.color': 1,
  'attributes.size': 1,
  createdAt: -1
}, { name: 'pagination_collection_color_size' });

ProductSchema.index({ 
  isAvailable: 1,
  collections: 1,
  brand: 1,
  createdAt: -1
}, { name: 'pagination_collection_brand' });

ProductSchema.index({ 
  isAvailable: 1,
  collections: 1,
  'attributes.fabric': 1,
  createdAt: -1
}, { name: 'pagination_collection_fabric' });

ProductSchema.index({ 
  isAvailable: 1,
  collections: 1,
  'attributes.work': 1,
  createdAt: -1
}, { name: 'pagination_collection_work' });

// Add indexes for price range queries with pagination
ProductSchema.index({ 
  isAvailable: 1,
  collections: 1,
  price: 1,
  createdAt: -1
}, { name: 'pagination_collection_price' });

// Add indexes for search with pagination
ProductSchema.index({ 
  isAvailable: 1,
  name: 'text',
  createdAt: -1
}, { name: 'pagination_search_name' });

ProductSchema.index({ 
  isAvailable: 1,
  collections: 1,
  name: 'text',
  createdAt: -1
}, { name: 'pagination_search_collection_name' });

// Add indexes for sorting options
ProductSchema.index({ 
  isAvailable: 1,
  featured: -1,
  createdAt: -1
}, { name: 'sort_featured' });

ProductSchema.index({ 
  isAvailable: 1,
  sales: -1,
  createdAt: -1
}, { name: 'sort_best_selling' });

ProductSchema.index({ 
  isAvailable: 1,
  name: 1,
  createdAt: -1
}, { name: 'sort_alphabetical_asc' });

ProductSchema.index({ 
  isAvailable: 1,
  name: -1,
  createdAt: -1
}, { name: 'sort_alphabetical_desc' });

// Add indexes for collection-specific sorting
ProductSchema.index({ 
  isAvailable: 1,
  collections: 1,
  featured: -1,
  createdAt: -1
}, { name: 'collection_sort_featured' });

ProductSchema.index({ 
  isAvailable: 1,
  collections: 1,
  sales: -1,
  createdAt: -1
}, { name: 'collection_sort_best_selling' });

// Add indexes for filter combinations with sorting
ProductSchema.index({ 
  isAvailable: 1,
  collections: 1,
  'attributes.color': 1,
  price: 1,
  createdAt: -1
}, { name: 'filter_sort_price' });

ProductSchema.index({ 
  isAvailable: 1,
  collections: 1,
  brand: 1,
  price: 1,
  createdAt: -1
}, { name: 'filter_sort_brand_price' });

export default mongoose.model("Product", ProductSchema, "products");
