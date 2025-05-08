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

ProductSchema.pre('save', function (next) {
  if (this.collections && Array.isArray(this.collections)) {
    this.collections = this.collections.map(c =>
      slugify(c, { lower: true, strict: true })
    );
  }
  next();
});

// Function to create dynamic indexes based on query patterns
const createDynamicIndex = async (queryPattern) => {
  try {
    const indexFields = { isAvailable: 1 };
    
    // Add fields from query pattern to index
    Object.keys(queryPattern).forEach(field => {
      if (field.startsWith('attributes.')) {
        indexFields[field] = 1;
      } else if (field === 'categories' || field === 'collections' || field === 'tags') {
        indexFields[field] = 1;
      } else if (field === 'price') {
        indexFields[field] = 1;
      } else if (field === 'brand' || field === 'productGroup' || field === 'productType') {
        indexFields[field] = 1;
      }
    });

    // Create index name based on fields
    const indexName = Object.keys(indexFields).join('_');
    
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
      console.log(`Created new index: ${indexName}`);
    }

    return indexName;
  } catch (error) {
    console.error('Error creating dynamic index:', error);
    return null;
  }
};

// Function to track query patterns
const queryPatternTracker = {
  patterns: new Map(),
  threshold: 100, // Number of times a pattern must be seen before creating an index
  
  trackQuery: function(query) {
    const patternKey = JSON.stringify(query);
    const count = (this.patterns.get(patternKey) || 0) + 1;
    this.patterns.set(patternKey, count);
    
    if (count === this.threshold) {
      createDynamicIndex(JSON.parse(patternKey));
    }
  }
};

// Export the functions
export { createDynamicIndex, queryPatternTracker };

export default mongoose.model("Product", ProductSchema, "products");
