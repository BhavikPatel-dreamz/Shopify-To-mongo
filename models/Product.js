import mongoose from "mongoose";
import slugify from "slugify";

const ProductSchema = new mongoose.Schema({
  productId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  handle: {
    type: String,
    unique: true,
    sparse: true, // Allow null values but enforce uniqueness when present
    index: true
  },
  shopifyId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    index: true
  },
  description: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
    index: true
  },
  compareAtPrice: {
    type: Number,
    min: 0
  },
  categories: {
    type: [String],
    index: true
  },
  tags: {
    type: [String],
    index: true
  },
  structuredTags: {
    type: Map,
    of: String,
  },
  brand: {
    type: String,
    index: true
  },
  productGroup: {
    type: String,
    index: true
  },
  vendor: String,
  productType: {
    type: String,
    index: true
  },
  collections: {
    type: [String],
    index: true
  },
  attributes: {
    color: {
      type: String,
      index: true
    },
    size: {
      type: String,
      index: true
    },
    material: {
      type: String,
      index: true
    },
    season: {
      type: String,
      index: true
    },
    gender: {
      type: String,
      index: true
    },
    style: {
      type: String,
      index: true
    },
    pattern: {
      type: String,
      index: true
    },
    fit: {
      type: String,
      index: true
    },
    fabric: {
      type: String,
      index: true
    },
    work: {
      type: String,
      index: true
    },
  },
  variants: [
    {
      variantId: {
        type: String,
        required: true
      },
      title: String,
      price: {
        type: Number,
        min: 0
      },
      sku: String,
      inventory: {
        type: Number,
        min: 0,
        default: 0
      },
      attributes: {
        color: String,
        size: String,
        material: String,
      },
    },
  ],
  images: [
    {
      url: {
        type: String,
        required: true
      },
      alt: String,
    },
  ],
  imageUrl: String, // Main product image
  productUrl: String, // Add the product URL field
  isAvailable: {
    type: Boolean,
    default: true,
    index: true
  },
  hasEmbedding: {
    type: Boolean,
    default: false,
    index: true
  },
  vectorId: String, // Reference to the vector in Pinecone
  
  // Performance fields
  featured: {
    type: Number,
    default: 0,
    index: true
  },
  sales: {
    type: Number,
    default: 0,
    index: true
  },
  viewCount: {
    type: Number,
    default: 0
  },
  lastViewedAt: {
    type: Date,
    default: Date.now
  },
  
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
}, {
  // Schema options for better performance
  minimize: false, // Don't remove empty objects
  versionKey: false, // Remove __v field
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ESSENTIAL INDEXES - Keep only the most important ones
// 1. Primary lookup indexes
ProductSchema.index({ productId: 1 }, { unique: true, background: true });
ProductSchema.index({ handle: 1 }, { unique: true, sparse: true, background: true });
ProductSchema.index({ shopifyId: 1 }, { unique: true, sparse: true, background: true });

// 2. Core filtering indexes
ProductSchema.index({ isAvailable: 1 }, { background: true });
ProductSchema.index({ isAvailable: 1, createdAt: -1 }, { background: true });
ProductSchema.index({ isAvailable: 1, price: 1 }, { background: true });

// 3. Collection-based queries (most common)
ProductSchema.index({ 
  isAvailable: 1, 
  collections: 1 
}, { name: 'collection_filter', background: true });

ProductSchema.index({ 
  isAvailable: 1, 
  collections: 1, 
  createdAt: -1 
}, { name: 'collection_sort', background: true });

ProductSchema.index({ 
  isAvailable: 1, 
  collections: 1, 
  price: 1 
}, { name: 'collection_price', background: true });

// 4. Attribute filtering (for faceted search)
ProductSchema.index({ 
  isAvailable: 1,
  'attributes.color': 1,
  'attributes.size': 1,
  'attributes.gender': 1
}, { name: 'attributes_filter', background: true });

// 5. Brand and category filtering
ProductSchema.index({ 
  isAvailable: 1,
  brand: 1,
  categories: 1
}, { name: 'brand_category_filter', background: true });

// 6. Price range queries
ProductSchema.index({ 
  isAvailable: 1,
  price: 1,
  createdAt: -1
}, { name: 'price_range', background: true });

// 7. Best seller and featured products
ProductSchema.index({ 
  isAvailable: 1,
  sales: -1,
  createdAt: -1
}, { name: 'best_seller', background: true });

ProductSchema.index({ 
  isAvailable: 1,
  featured: -1,
  createdAt: -1
}, { name: 'featured_products', background: true });

// 8. Text search index (simplified)
ProductSchema.index({
  name: "text",
  description: "text",
  brand: "text",
  tags: "text"
}, { 
  name: 'text_search',
  background: true,
  weights: {
    name: 10,
    brand: 5,
    description: 1,
    tags: 3
  }
});

// 9. Complex filter combinations (for your filter API)
ProductSchema.index({
  isAvailable: 1,
  collections: 1,
  'attributes.color': 1,
  'attributes.size': 1,
  'attributes.material': 1,
  brand: 1,
  price: 1,
  createdAt: -1
}, { name: 'filter_facets', background: true });


ProductSchema.index({
  isAvailable: 1,
  collections: 1,
  categories: 1,
  brand: 1,
  price: 1,
  createdAt: -1
}, { name: 'filter_facets_comprehensive', background: true });

ProductSchema.index({
  isAvailable: 1,
  'attributes.color': 1,
  'attributes.size': 1,
  'attributes.material': 1,
  price: 1
}, { name: 'attribute_filter_comprehensive', background: true });

ProductSchema.index({
  isAvailable: 1,
  productType: 1,
  productGroup: 1,
  createdAt: -1
}, { name: 'product_type_group_filter', background: true });

// Pre-save middleware
ProductSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  
  // Normalize collections
  if (this.collections && Array.isArray(this.collections)) {
    this.collections = this.collections.map(c =>
      slugify(c, { lower: true, strict: true })
    );
  }
  
  // Normalize attributes
  if (this.attributes) {
    Object.keys(this.attributes).forEach(key => {
      if (this.attributes[key] && typeof this.attributes[key] === 'string') {
        this.attributes[key] = this.attributes[key].toLowerCase().trim();
      }
    });
  }
  
  next();
});

// Enhanced query pattern tracker with performance monitoring
const queryPatternTracker = {
  patterns: new Map(),
  threshold: 25, // Reduced threshold for faster index creation
  maxPatterns: 50, // Reduced to prevent memory issues
  patternStats: new Map(),
  performanceMetrics: new Map(),
  
  trackQuery: function(query, executionTime = 0) {
    try {
      const normalizedQuery = this.normalizeQuery(query);
      const patternKey = JSON.stringify(normalizedQuery);
      
      // Update pattern count
      const count = (this.patterns.get(patternKey) || 0) + 1;
      this.patterns.set(patternKey, count);
      
      // Update performance metrics
      const perfMetrics = this.performanceMetrics.get(patternKey) || {
        totalTime: 0,
        queryCount: 0,
        avgTime: 0,
        maxTime: 0,
        minTime: Infinity
      };
      
      perfMetrics.totalTime += executionTime;
      perfMetrics.queryCount += 1;
      perfMetrics.avgTime = perfMetrics.totalTime / perfMetrics.queryCount;
      perfMetrics.maxTime = Math.max(perfMetrics.maxTime, executionTime);
      perfMetrics.minTime = Math.min(perfMetrics.minTime, executionTime);
      
      this.performanceMetrics.set(patternKey, perfMetrics);
      
      // Update pattern statistics
      const stats = this.patternStats.get(patternKey) || {
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        totalQueries: 0,
        needsOptimization: false
      };
      
      stats.lastSeen = Date.now();
      stats.totalQueries += 1;
      
      // Flag for optimization if average time is > 1000ms
      stats.needsOptimization = perfMetrics.avgTime > 1000;
      
      this.patternStats.set(patternKey, stats);
      
      // Clean up old patterns
      if (this.patterns.size > this.maxPatterns) {
        this.cleanupOldPatterns();
      }
      
      // Create index if threshold is reached and query is slow
      if (count === this.threshold || (count > 5 && perfMetrics.avgTime > 2000)) {
        console.log(`Pattern needs optimization (${count} queries, avg: ${perfMetrics.avgTime}ms):`, normalizedQuery);
        createDynamicIndex(normalizedQuery);
      }
      
      return {
        patternKey,
        count,
        avgTime: perfMetrics.avgTime,
        needsOptimization: stats.needsOptimization
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
    delete normalized.skip;
    
    // Normalize array fields
    Object.keys(normalized).forEach(key => {
      if (Array.isArray(normalized[key])) {
        normalized[key] = normalized[key].sort().join(',');
      }
    });
    
    return normalized;
  },
  
  cleanupOldPatterns: function() {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    
    const oldPatterns = Array.from(this.patternStats.entries())
      .filter(([_, stats]) => stats.lastSeen < cutoffTime)
      .map(([key]) => key);
    
    oldPatterns.forEach(key => {
      this.patterns.delete(key);
      this.patternStats.delete(key);
      this.performanceMetrics.delete(key);
    });
    
    if (oldPatterns.length > 0) {
      console.log(`Cleaned up ${oldPatterns.length} old patterns`);
    }
  },
  
  getSlowQueries: function() {
    return Array.from(this.performanceMetrics.entries())
      .filter(([_, metrics]) => metrics.avgTime > 1000)
      .sort(([_, a], [__, b]) => b.avgTime - a.avgTime)
      .slice(0, 10)
      .map(([key, metrics]) => ({
        pattern: JSON.parse(key),
        metrics,
        stats: this.patternStats.get(key)
      }));
  },
  
  getOptimizationSuggestions: function() {
    const slowQueries = this.getSlowQueries();
    const suggestions = [];
    
    slowQueries.forEach(({ pattern, metrics }) => {
      const fields = Object.keys(pattern);
      const suggestion = {
        pattern,
        avgTime: metrics.avgTime,
        suggestedIndex: { isAvailable: 1 }
      };
      
      // Add fields to suggested index
      fields.forEach(field => {
        if (field.startsWith('attributes.')) {
          suggestion.suggestedIndex[field] = 1;
        } else if (['collections', 'categories', 'brand', 'productGroup', 'productType'].includes(field)) {
          suggestion.suggestedIndex[field] = 1;
        } else if (field === 'price') {
          suggestion.suggestedIndex[field] = 1;
        }
      });
      
      // Add sort field
      suggestion.suggestedIndex.createdAt = -1;
      
      suggestions.push(suggestion);
    });
    
    return suggestions;
  }
};

// Enhanced function to create dynamic indexes
const createDynamicIndex = async (queryPattern) => {
  try {
    const indexFields = { isAvailable: 1 };
    const Model = mongoose.model('Product');
    
    // Build index fields based on query pattern
    Object.entries(queryPattern).forEach(([field, value]) => {
      if (field === 'price') {
        indexFields[field] = 1;
      } else if (field.startsWith('attributes.')) {
        indexFields[field] = 1;
      } else if (['categories', 'collections', 'tags', 'brand', 'productGroup', 'productType'].includes(field)) {
        indexFields[field] = 1;
      }
    });
    
    // Add createdAt for sorting
    indexFields.createdAt = -1;
    
    // Create index name
    const indexName = `dynamic_${Date.now()}_${Object.keys(indexFields).join('_')}`;
    
    // Check if similar index exists
    const existingIndexes = await Model.collection.indexes();
    const similarIndex = existingIndexes.find(index => {
      const indexKeys = Object.keys(index.key);
      const newKeys = Object.keys(indexFields);
      return indexKeys.length === newKeys.length && 
             indexKeys.every(key => newKeys.includes(key));
    });
    
    if (!similarIndex) {
      await Model.collection.createIndex(indexFields, {
        name: indexName,
        background: true,
        partialFilterExpression: { isAvailable: true } // Only index available products
      });
      
      console.log(`✅ Created dynamic index: ${indexName}`);
      console.log(`📊 Index fields:`, indexFields);
      
      return indexName;
    } else {
      console.log(`⏭️  Similar index exists: ${similarIndex.name}`);
      return similarIndex.name;
    }
  } catch (error) {
    console.error('❌ Error creating dynamic index:', error);
    return null;
  }
};

// Virtual for total inventory
ProductSchema.virtual('totalInventory').get(function() {
  return this.variants.reduce((total, variant) => total + (variant.inventory || 0), 0);
});

// Virtual for has variants
ProductSchema.virtual('hasVariants').get(function() {
  return this.variants && this.variants.length > 0;
});

// Static methods for common queries
ProductSchema.statics.findAvailable = function(conditions = {}) {
  return this.find({ isAvailable: true, ...conditions });
};

ProductSchema.statics.findByCollection = function(collection, conditions = {}) {
  return this.find({ 
    isAvailable: true, 
    collections: collection,
    ...conditions 
  });
};

ProductSchema.statics.findInPriceRange = function(min, max, conditions = {}) {
  return this.find({ 
    isAvailable: true, 
    price: { $gte: min, $lte: max },
    ...conditions 
  });
};

// Export the enhanced functions
export { createDynamicIndex, queryPatternTracker };

export default mongoose.model("Product", ProductSchema, "products");