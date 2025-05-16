import mongoose from 'mongoose';

const collectionSchema = new mongoose.Schema({
  shopifyId: {
    type: String,
    required: true,
    unique: true
  },
  title: {
    type: String,
    required: true
  },
  handle: {
    type: String,
    required: true
  },
  description: String,
  descriptionHtml: String,
  updatedAt: Date,
  publishedAt: Date,
  productCount: {
    type: Number,
    default: 0
  },
  products: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  image: {
    url: String,
    altText: String,
    width: Number,
    height: Number
  }
}, {
  timestamps: true
});

// Create indexes
collectionSchema.index({ shopifyId: 1 });
collectionSchema.index({ handle: 1 });
collectionSchema.index({ title: 'text' });
collectionSchema.index({ productCount: 1 });
collectionSchema.index({ products: 1 });

const Collection = mongoose.model('Collection', collectionSchema);

export default Collection; 