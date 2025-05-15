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

  // Helper function to apply pagination
  applyPagination(products, page, limit) {
    const start = (page - 1) * limit;
    const end = start + limit;
    return products.slice(start, end);
  }

  // Helper function to filter products based on filters
  filterProducts(products, filters) {
    // Remove pagination related filters
    const { page, limit, sort, order, ...actualFilters } = filters;

    return products.filter(product => {
      for (const [key, value] of Object.entries(actualFilters)) {
        // Handle different types of filters
        switch(key) {
          case 'category':
            if (!product.categories?.some(cat => 
              cat.toLowerCase() === value.toLowerCase())) return false;
            break;
          case 'collections':
            if (!product.collections?.some(col => 
              col.toLowerCase() === value.toLowerCase())) return false;
            break;
          case 'color':
            if (!product.attributes?.color?.some(c => 
              c.toLowerCase() === value.toLowerCase())) return false;
            break;
          case 'size':
            if (!product.attributes?.size?.some(s => 
              s.toLowerCase() === value.toLowerCase())) return false;
            break;
          case 'brand':
            if (product.brand?.toLowerCase() !== value.toLowerCase()) return false;
            break;
          case 'minPrice':
            if (product.price < parseFloat(value)) return false;
            break;
          case 'maxPrice':
            if (product.price > parseFloat(value)) return false;
            break;
          // Add more filter types as needed
        }
      }
      return true;
    });
  }

  // Helper function to sort products
  sortProducts(products, sort, order) {
    if (!sort || !products.length) return products;

    const sortedProducts = [...products];
    
    switch (sort) {
      case 'featured':
        sortedProducts.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
        break;
      case 'best_selling':
        sortedProducts.sort((a, b) => (b.sales || 0) - (a.sales || 0));
        break;
      case 'alphabetical_asc':
        sortedProducts.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        break;
      case 'alphabetical_desc':
        sortedProducts.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
        break;
      case 'price_asc':
        sortedProducts.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case 'price_desc':
        sortedProducts.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      case 'date_old_to_new':
        sortedProducts.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        break;
      case 'date_new_to_old':
        sortedProducts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        break;
      default:
        sortedProducts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    return sortedProducts;
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
      let currentFilters = {...filters};
      
      while (currentKey.includes(':')) {
        currentKey = currentKey.substring(0, currentKey.lastIndexOf(':'));
        const lastFilterKey = currentKey.substring(currentKey.lastIndexOf(':') + 1).split('=')[0];
        delete currentFilters[lastFilterKey];
        
        if (this.isValid(currentKey)) {
          const parentValue = this.get(currentKey);
          if (parentValue) {
            // Deep clone the parent value to avoid modifying cache
            const clonedValue = JSON.parse(JSON.stringify(parentValue));
            
            // Filter and sort the products based on remaining filters
            if (clonedValue.data && Array.isArray(clonedValue.data.products)) {
              let filteredProducts = this.filterProducts(clonedValue.data.products, filters);
              
              // Apply sorting
              filteredProducts = this.sortProducts(filteredProducts, filters.sort, filters.order);
              
              // Get total before pagination
              const total = filteredProducts.length;
              
              // Apply pagination
              const page = parseInt(filters.page) || 1;
              const limit = parseInt(filters.limit) || 20;
              clonedValue.data.products = this.applyPagination(filteredProducts, page, limit);
              
              // Update pagination info
              clonedValue.data.pagination = {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
              };
              clonedValue.data.totalAvailableProducts = total;
            }
            
            return clonedValue;
          }
        }
      }
      
      // Finally try the base key
      if (this.isValid(baseKey)) {
        const baseValue = this.get(baseKey);
        if (baseValue) {
          // Deep clone the base value
          const clonedValue = JSON.parse(JSON.stringify(baseValue));
          
          // Filter, sort and paginate the base results
          if (clonedValue.data && Array.isArray(clonedValue.data.products)) {
            let filteredProducts = this.filterProducts(clonedValue.data.products, filters);
            
            // Apply sorting
            filteredProducts = this.sortProducts(filteredProducts, filters.sort, filters.order);
            
            // Get total before pagination
            const total = filteredProducts.length;
            
            // Apply pagination
            const page = parseInt(filters.page) || 1;
            const limit = parseInt(filters.limit) || 20;
            clonedValue.data.products = this.applyPagination(filteredProducts, page, limit);
            
            // Update pagination info
            clonedValue.data.pagination = {
              total,
              page,
              limit,
              pages: Math.ceil(total / limit)
            };
            clonedValue.data.totalAvailableProducts = total;
          }
          
          return clonedValue;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Hierarchical GET Error:', error);
      return null;
    }
  }
}

export default AdvancedCache; 