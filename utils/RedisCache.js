import Redis from 'ioredis';
import 'dotenv/config';

class RedisCache {
  constructor(options = {}) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      keyPrefix: options.prefix || '',
    });

    this.defaultTTL = options.timeout || 30 * 60; // 30 minutes in seconds
  }

  async set(key, value, ttl = this.defaultTTL) {
    try {
      const serializedValue = JSON.stringify(value);
      await this.redis.setex(key, ttl, serializedValue);
      return true;
    } catch (error) {
      console.error('Redis SET Error:', error);
      return false;
    }
  }

  async get(key) {
    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis GET Error:', error);
      return null;
    }
  }

  async isValid(key) {
    try {
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch (error) {
      console.error('Redis EXISTS Error:', error);
      return false;
    }
  }

  async delete(key) {
    try {
      await this.redis.del(key);
      return true;
    } catch (error) {
      console.error('Redis DEL Error:', error);
      return false;
    }
  }

  async clear(pattern = '*') {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(keys);
      }
      return true;
    } catch (error) {
      console.error('Redis CLEAR Error:', error);
      return false;
    }
  }

  // Hierarchical caching methods
  async setHierarchical(baseKey, filters, value, ttl = this.defaultTTL) {
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
        await this.set(key, value, ttl);
      }
      
      return true;
    } catch (error) {
      console.error('Redis Hierarchical SET Error:', error);
      return false;
    }
  }

  async getHierarchical(baseKey, filters) {
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
      const exactMatch = await this.get(fullKey);
      if (exactMatch) return exactMatch;
      
      // If no exact match, try parent keys
      let currentKey = fullKey;
      while (currentKey.includes(':')) {
        currentKey = currentKey.substring(0, currentKey.lastIndexOf(':'));
        const parentValue = await this.get(currentKey);
        if (parentValue) return parentValue;
      }
      
      // Finally try the base key
      return await this.get(baseKey);
    } catch (error) {
      console.error('Redis Hierarchical GET Error:', error);
      return null;
    }
  }
}

export default RedisCache; 