/**
 * Generates a unique cache key from query parameters
 * @param {Object} queryParams - Request query parameters
 * @returns {string} JSON string to be used as cache key
 */
const generateCacheKey = (queryParams) => {
    const sortedParams = Object.keys(queryParams || {})
      .sort()
      .reduce((acc, key) => {
        acc[key] = queryParams[key];
        return acc;
      }, {});
    return JSON.stringify(sortedParams);
  };


export const getProductsCollectionsHanls = async (collections) => {
  try {
    // Query only the needed collections by title
    const matchedCollections = await Collection.find(
      { title: { $in: collections } },
      { title: 1, handle: 1 }
    ).lean();

    // Create a map for faster lookup: title -> handle
    const collectionTitleToHandle = new Map();
    matchedCollections.forEach(collection => {
      collectionTitleToHandle.set(collection.title, collection.handle);
    });

    return collectionTitleToHandle;
  } catch (error) {
    console.error('Error fetching collections:', error);
    throw error;
  }
}

export { generateCacheKey, getProductsCollectionsHanls };