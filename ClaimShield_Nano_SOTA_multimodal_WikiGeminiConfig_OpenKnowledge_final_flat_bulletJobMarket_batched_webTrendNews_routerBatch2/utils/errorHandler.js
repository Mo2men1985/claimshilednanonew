
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

// utils/errorHandler.js - Centralized error management

class ClaimShieldError extends Error {
  constructor(message, code, recoverable = true) {
    super(message);
    this.name = 'ClaimShieldError';
    this.code = code;
    this.recoverable = recoverable;
    this.timestamp = new Date().toISOString();
  }
}

const ERROR_CODES = {
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  API_RATE_LIMIT: 'API_RATE_LIMIT',
  INVALID_INPUT: 'INVALID_INPUT',
  PARSING_ERROR: 'PARSING_ERROR',
  TIMEOUT: 'TIMEOUT'
};

class ErrorHandler {
  constructor() {
    this.errorLog = [];
    this.maxLogSize = 50;
  }

  handle(error, context = {}) {
    const errorEntry = {
      message: error.message || String(error),
      code: error.code || 'UNKNOWN',
      recoverable: error.recoverable ?? true,
      context,
      timestamp: new Date().toISOString(),
      stack: error.stack
    };

    this.errorLog.push(errorEntry);
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }

    // Log to console in development
    if (chrome.runtime?.getManifest()?.version?.includes('dev')) {
      console.error('[ClaimShield Error]', errorEntry);
    }

    // Send to analytics (if enabled)
    this.reportError(errorEntry);

    return this.getUserMessage(errorEntry);
  }

  getUserMessage(errorEntry) {
    const messages = {
      MODEL_UNAVAILABLE: '🤖 AI model not available. Please enable Chrome Built-in AI in chrome://flags',
      NETWORK_ERROR: '🌐 Network error. Check your connection and try again.',
      API_RATE_LIMIT: '⏱️ Rate limit reached. Please wait a moment and try again.',
      INVALID_INPUT: '❌ Invalid input. Please check your text and try again.',
      PARSING_ERROR: '🔧 Unable to parse response. The AI model may need updating.',
      TIMEOUT: '⏰ Request timed out. The model may be downloading. Try preloading first.',
      UNKNOWN: '⚠️ An unexpected error occurred. Please try again.'
    };

    return messages[errorEntry.code] || messages.UNKNOWN;
  }

  async reportError(errorEntry) {
    // Store locally for diagnostics
    try {
      await chrome.storage.local.get(['errorLog'], (data) => {
        const log = data.errorLog || [];
        log.push(errorEntry);
        chrome.storage.local.set({ 
          errorLog: log.slice(-100) // Keep last 100 errors
        });
      });
    } catch (e) {
      console.warn('Could not store error log:', e);
    }
  }

  getRecentErrors(limit = 10) {
    return this.errorLog.slice(-limit);
  }

  clearLog() {
    this.errorLog = [];
    chrome.storage.local.remove('errorLog');
  }
}

// Singleton instance
const errorHandler = new ErrorHandler();

// Wrapper for async functions with automatic error handling
function withErrorHandling(fn, context = '') {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      const claimShieldError = error instanceof ClaimShieldError 
        ? error 
        : new ClaimShieldError(error.message, ERROR_CODES.UNKNOWN);
      
      const userMessage = errorHandler.handle(claimShieldError, { 
        function: fn.name, 
        context 
      });
      
      throw new Error(userMessage);
    }
  };
}

// Export
if (typeof window !== 'undefined') {
  window.ClaimShieldError = ClaimShieldError;
  window.ERROR_CODES = ERROR_CODES;
  window.errorHandler = errorHandler;
  window.withErrorHandling = withErrorHandling;
}