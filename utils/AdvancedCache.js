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
}

export default AdvancedCache; 