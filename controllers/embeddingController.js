import vectorService from '../services/vectorService.js';

/**
 * Sync products to vector database
 */
async function syncEmbeddings(req, res) {
  try {
    // This could be a long-running process, so you might want to handle it differently in production
    await vectorService.syncProductsToVectorDB();
    res.json({ success: true, message: 'Product embeddings synced successfully' });
  } catch (error) {
    console.error('Error syncing embeddings:', error);
    res.status(500).json({ error: 'Failed to sync embeddings' });
  }
}

export default {
  syncEmbeddings
};