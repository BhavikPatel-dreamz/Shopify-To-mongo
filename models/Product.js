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

export default mongoose.model("Product", ProductSchema, "products");
