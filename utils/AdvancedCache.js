/**
 * Advanced caching system with memory management
 */
class AdvancedCache {
  constructor(options = {}) {
    this.data = new Map();
    this.timestamps = new Map();
    this.accessCount = new Map();
    this.maxSize = options.maxSize || 1000;
    this.timeout = options.timeout || 60 * 60 * 1000; // 1 hour default
    this.cleanupInterval = options.cleanupInterval || 5 * 60 * 1000; // 5 minutes
    this.startCleanupInterval();
  }

  startCleanupInterval() {
    setInterval(() => this.cleanup(), this.cleanupInterval);
  }

  cleanup() {
    const now = Date.now();
    for (const [key, timestamp] of this.timestamps) {
      if (now - timestamp > this.timeout) {
        this.delete(key);
      }
    }

    // If still over maxSize, remove least accessed items
    if (this.data.size > this.maxSize) {
      const sortedKeys = Array.from(this.accessCount.entries())
        .sort((a, b) => a[1] - b[1])
        .map(([key]) => key);
      
      const keysToRemove = sortedKeys.slice(0, this.data.size - this.maxSize);
      keysToRemove.forEach(key => this.delete(key));
    }
  }

  delete(key) {
    this.data.delete(key);
    this.timestamps.delete(key);
    this.accessCount.delete(key);
  }

  set(key, value) {
    if (this.data.size >= this.maxSize) {
      this.cleanup();
    }
    this.data.set(key, value);
    this.timestamps.set(key, Date.now());
    this.accessCount.set(key, (this.accessCount.get(key) || 0) + 1);
  }

  get(key) {
    const value = this.data.get(key);
    if (value) {
      this.accessCount.set(key, (this.accessCount.get(key) || 0) + 1);
    }
    return value;
  }

  isValid(key) {
    const timestamp = this.timestamps.get(key);
    if (!timestamp) return false;
    return (Date.now() - timestamp) < this.timeout;
  }

  clear() {
    this.data.clear();
    this.timestamps.clear();
    this.accessCount.clear();
  }

  // Hierarchical caching methods
  setHierarchical(baseKey, filters, value) {
    try {
      // Sort filters to ensure consistent key generation
      const sortedFilters = Object.entries(filters)
        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
      
      // Generate hierarchical keys
      let currentKey = baseKey;
      const keys = [currentKey];
      
      for (const [filterKey, filterValue] of sortedFilters) {
        currentKey += `:${filterKey}=${filterValue}`;
        keys.push(currentKey);
      }
      
      // Store value at each level
      for (const key of keys) {
        this.set(key, value);
      }
      
      return true;
    } catch (error) {
      console.error('Hierarchical SET Error:', error);
      return false;
    }
  }

  getHierarchical(baseKey, filters) {
    try {
      // Sort filters to ensure consistent key generation
      const sortedFilters = Object.entries(filters)
        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
      
      // Generate the full key
      let fullKey = baseKey;
      for (const [filterKey, filterValue] of sortedFilters) {
        fullKey += `:${filterKey}=${filterValue}`;
      }
      
      // Try to get the exact match first
      if (this.isValid(fullKey)) {
        const exactMatch = this.get(fullKey);
        if (exactMatch) return exactMatch;
      }
      
      // If no exact match, try parent keys
      let currentKey = fullKey;
      while (currentKey.includes(':')) {
        currentKey = currentKey.substring(0, currentKey.lastIndexOf(':'));
        if (this.isValid(currentKey)) {
          const parentValue = this.get(currentKey);
          if (parentValue) return parentValue;
        }
      }
      
      // Finally try the base key
      if (this.isValid(baseKey)) {
        return this.get(baseKey);
      }
      
      return null;
    } catch (error) {
      console.error('Hierarchical GET Error:', error);
      return null;
    }
  }
}

export default AdvancedCache; 