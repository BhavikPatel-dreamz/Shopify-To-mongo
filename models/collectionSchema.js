import mongoose from 'mongoose';

const collectionSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  title: {
    type: String,
    required: true
  },
  handle: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  description: {
    type: String,
    default: ''
  },
  descriptionHtml: {
    type: String,
    default: ''
  },
  updatedAt: {
    type: Date,
    required: true
  },
  image: {
    url: String,
    altText: String,
    width: Number,
    height: Number
  },
  productsCount: {
    count: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true,
  strict: true
});

const Collection = mongoose.model('Collection', collectionSchema);

export default Collection;