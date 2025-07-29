import mongoose from 'mongoose';

const collectionStateSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  handle: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  body_html: {
    type: String,
    default: ''
  },
  published_at: {
    type: Date,
    default: null
  },
  updated_at: {
    type: Date,
  },
  sort_order: {
    type: String,
  },
  template_suffix: {
    type: String,
  },
  disjunctive: {
    type: Boolean,
    default: false
  },
  rules: [
    {
      column: {
        type: String,
      },
      relation: {
        type: String,
       
      },
      condition: {
        type: String,
      }
    }
  ],
  published_scope: {
    type: String,
  },
  admin_graphql_api_id: {
    type: String,
  },

});
// Create indexes
collectionStateSchema.index({ id: 1 });
collectionStateSchema.index({ handle: 1 });
collectionStateSchema.index({ title: 'text' });

const CollectionState = mongoose.model('CollectionState', collectionStateSchema);

export default CollectionState;
