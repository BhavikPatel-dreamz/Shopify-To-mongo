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


export { generateCacheKey };