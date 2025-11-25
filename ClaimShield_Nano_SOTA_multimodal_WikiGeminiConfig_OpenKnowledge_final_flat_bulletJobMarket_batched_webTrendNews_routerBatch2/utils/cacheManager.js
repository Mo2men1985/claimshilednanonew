
// === Wiki helpers (Rev 2.9.3) ===
function __wikiSummaryUrl(q){
  const title = (q||'').trim().replace(/\s+/g,'_');
  return `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
}
function __wikiPageUrlFromSummary(js, fallbackQuery){
  const rest = js?.content_urls?.desktop?.page || js?.content_urls?.mobile?.page;
  if (rest) return rest;
  const title = (js?.titles?.normalized || js?.title || fallbackQuery || '').trim().replace(/\s+/g,'_');
  return title ? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}` : '';
}
async function __fetchJson(url, timeoutMs=5000){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), timeoutMs);
  try{
    const r = await fetch(url, { signal: ctrl.signal });
    if(!r.ok) throw new Error(`HTTP ${r.status} @ ${url}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

// utils/cacheManager.js - Intelligent caching for results

class CacheManager {
  constructor() {
    this.memoryCache = new Map();
    this.maxMemorySize = 50;
    this.maxAge = 3600000; // 1 hour
  }

  // Generate cache key from text (hash-like)
  generateKey(text) {
    let hash = 0;
    const str = text.toLowerCase().trim();
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `claim_${Math.abs(hash)}`;
  }

  // Check if text is similar enough to use cached result
  isSimilar(text1, text2, threshold = 0.9) {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size >= threshold;
  }

  async get(text) {
    const key = this.generateKey(text);
    
    // Check memory cache first
    if (this.memoryCache.has(key)) {
      const entry = this.memoryCache.get(key);
      if (Date.now() - entry.timestamp < this.maxAge) {
        console.log('✅ Cache hit (memory):', key);
        return { ...entry.data, cached: true, cacheSource: 'memory' };
      } else {
        this.memoryCache.delete(key);
      }
    }

    // Check persistent storage
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (data) => {
        if (data[key]) {
          const entry = data[key];
          if (Date.now() - entry.timestamp < this.maxAge) {
            // Promote to memory cache
            this.memoryCache.set(key, entry);
            console.log('✅ Cache hit (storage):', key);
            resolve({ ...entry.data, cached: true, cacheSource: 'storage' });
          } else {
            // Expired
            chrome.storage.local.remove(key);
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });
    });
  }

  async set(text, data) {
    const key = this.generateKey(text);
    const entry = {
      data,
      timestamp: Date.now(),
      text: text.slice(0, 200) // Store snippet for debugging
    };

    // Memory cache
    this.memoryCache.set(key, entry);
    if (this.memoryCache.size > this.maxMemorySize) {
      // Remove oldest entry
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }

    // Persistent storage
    try {
      await chrome.storage.local.set({ [key]: entry });
      console.log('💾 Cached result:', key);
    } catch (e) {
      console.warn('Cache storage failed:', e);
    }
  }

  async clear() {
    this.memoryCache.clear();
    
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (data) => {
        const keysToRemove = Object.keys(data).filter(k => k.startsWith('claim_'));
        chrome.storage.local.remove(keysToRemove, () => {
          console.log(`🧹 Cleared ${keysToRemove.length} cached results`);
          resolve();
        });
      });
    });
  }

  async getStats() {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (data) => {
        const cacheKeys = Object.keys(data).filter(k => k.startsWith('claim_'));
        const totalSize = JSON.stringify(data).length;
        
        resolve({
          memoryEntries: this.memoryCache.size,
          storageEntries: cacheKeys.length,
          totalSizeBytes: totalSize,
          totalSizeKB: (totalSize / 1024).toFixed(2)
        });
      });
    });
  }
}

// Singleton instance
const cacheManager = new CacheManager();

// Modified verify function with caching
async function verifyWithCache(text, forceRefresh = false) {
  if (!forceRefresh) {
    const cached = await cacheManager.get(text);
    if (cached) {
      return cached;
    }
  }

  // Perform actual verification (existing logic)
  const result = await performVerification(text);
  
  // Cache the result
  await cacheManager.set(text, result);
  
  return result;
}

// Export
if (typeof window !== 'undefined') {
  window.cacheManager = cacheManager;
  window.verifyWithCache = verifyWithCache;
}

// Example usage in popup.js:
// Instead of direct verification, use:
// const result = await verifyWithCache(text, false);
