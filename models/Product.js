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

export default mongoose.model("Product", ProductSchema, "products");
