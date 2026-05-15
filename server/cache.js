let apiResponseCache = new Map();
let cacheMaxSize = 500;
let cacheHits = 0;
let cacheMisses = 0;

function setCacheMaxSize(size) {
  cacheMaxSize = size || 500;
}

function getCachedResponse(cacheKey, ttlMs) {
  const cached = apiResponseCache.get(cacheKey);
  if (!cached) {
    return null;
  }
  if (Date.now() - cached.timestamp > ttlMs) {
    apiResponseCache.delete(cacheKey);
    return null;
  }
  return cached.data;
}

function setCachedResponse(cacheKey, data) {
  if (apiResponseCache.size >= cacheMaxSize) {
    const firstKey = apiResponseCache.keys().next().value;
    apiResponseCache.delete(firstKey);
  }
  apiResponseCache.set(cacheKey, {
    data,
    timestamp: Date.now()
  });
}

function incrementCacheHits() {
  cacheHits++;
}

function incrementCacheMisses() {
  cacheMisses++;
}

function clearCache() {
  const previousSize = apiResponseCache.size;
  apiResponseCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
  return previousSize;
}

function getCacheStats() {
  return {
    size: apiResponseCache.size,
    maxSize: cacheMaxSize,
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: cacheHits + cacheMisses > 0 ? (cacheHits / (cacheHits + cacheMisses) * 100).toFixed(2) + '%' : '0%'
  };
}

module.exports = {
  setCacheMaxSize,
  getCachedResponse,
  setCachedResponse,
  incrementCacheHits,
  incrementCacheMisses,
  clearCache,
  getCacheStats
};
