
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

// preload.js - Robust language guard + summarize shim (fixed header, clamped model lang)
(function() {
  'use strict';

  // Prefer navigator.language when available, constrained to supported list
  try {
    const guess = (navigator.language || 'en').slice(0,2).toLowerCase();
    if (!('CLAIMSHIELD_LANG' in globalThis)) {
      globalThis.CLAIMSHIELD_LANG = ['en','es','ja'].includes(guess) ? guess : 'en';
    }
  } catch(_) {}

  // Default language (global)
  if (typeof globalThis !== 'undefined' && !('CLAIMSHIELD_LANG' in globalThis)) {
    globalThis.CLAIMSHIELD_LANG = 'en';
  }
  function OUTPUT_LANG() {
    try { return (globalThis && globalThis.CLAIMSHIELD_LANG) || 'en'; }
    catch (_) { return 'en'; }
  }
  if (typeof window !== 'undefined') window.OUTPUT_LANG = OUTPUT_LANG;

  // Model-only output language (clamped to supported list)
  function OUTPUT_LANG_MODEL() {
    try {
      const v = (globalThis && globalThis.CLAIMSHIELD_LANG) || 'en';
      return (v==='en' || v==='es' || v==='ja') ? v : 'en';
    } catch (_) {
      return 'en';
    }
  }
  if (typeof window !== 'undefined') window.OUTPUT_LANG_MODEL = OUTPUT_LANG_MODEL;

  // Wrapper that forces outputLanguage for create() calls (model-safe clamp)
  function wrapWithLanguage(apiName, apiObject) {
    if (!apiObject || typeof apiObject.create !== 'function') return false;
    if (apiObject.__outLangPatched) return true;
    try {
      const originalCreate = apiObject.create.bind(apiObject);
      const wrapper = function(opts = {}) {
        if (!opts.outputLanguage) {
          opts.outputLanguage = (typeof OUTPUT_LANG_MODEL === 'function' ? OUTPUT_LANG_MODEL() : 'en');
        }
        return originalCreate(opts);
      };
      // Try normal assignment, then defineProperty, then getter fallback
      let applied = false;
      try {
        apiObject.create = wrapper; // normal assignment
        applied = true;
      } catch (e1) {
        try {
          Object.defineProperty(apiObject, 'create', { configurable: true, writable: true, value: wrapper });
          applied = true;
        } catch (e2) {
          try {
            Object.defineProperty(apiObject, 'create', {
              configurable: true,
              get() { return wrapper; }
            });
            applied = true;
          } catch (e3) {
            console.warn('wrapWithLanguage: all strategies failed for', apiName, e1 || e2 || e3);
            applied = false;
          }
        }
      }
      if (!applied) return false;
      apiObject.__outLangPatched = true;
      console.log(`✅ Wrapped ${apiName}.create() with outputLanguage`);
      return true;
    } catch (e) {
      console.warn(`Failed to wrap ${apiName}:`, e);
      return false;
    }
  }

  // ✅ FIXED HEADER
  function wrapAllAPIs() {
    let n = 0;

    // Model surfaces (recommended)
    if (typeof LanguageModel !== 'undefined') {
      n += wrapWithLanguage('LanguageModel', LanguageModel) ? 1 : 0;
    }
    if (globalThis.chrome?.ai?.languageModel) {
      n += wrapWithLanguage('chrome.ai.languageModel', chrome.ai.languageModel) ? 1 : 0;
    }
    if (globalThis.ai?.languageModel) {
      n += wrapWithLanguage('ai.languageModel', globalThis.ai.languageModel) ? 1 : 0;
    }

    // Optional: wrap other APIs only if you need them to emit specific languages
    // for (const k of ['summarizer','writer','rewriter','proofreader','translator']) {
    //   if (globalThis.ai?.[k]) n += wrapWithLanguage(`ai.${k}`, globalThis.ai[k]) ? 1 : 0;
    // }

    return n;
  }

  const immediate = wrapAllAPIs();
  console.log(`🔧 Preload: Wrapped ${immediate} APIs immediately`);
  setTimeout(()=>{
    const d = wrapAllAPIs();
    if (d>immediate) console.log(`🔧 Preload: Wrapped ${d-immediate} more after delay`);
  }, 120);
  document.addEventListener('DOMContentLoaded', ()=>{
    console.log(`🔧 Preload: Verified ${wrapAllAPIs()} APIs on DOMContentLoaded`);
  });

  // Summarizer shim to avoid missing function errors
  function attachShimSummarize() {
    if (typeof window !== 'undefined' && typeof window.summarize === 'function') return;
    if (!('Summarizer' in self)) return;
    window.summarize = async function(text) {
      try {
        const s = await Summarizer.create({
          type: 'key-points',
          format: 'plain-text',
          length: 'short',
          outputLanguage: OUTPUT_LANG()
        });
        const out = await s.summarize(String(text || '').slice(0, 4000));
        await s.destroy?.();
        const summary = (out && (out.summary ?? out)) ? String(out.summary ?? out) : '';
        return { ok: true, summary };
      } catch (e) {
        return { ok: false, error: String(e?.message || e) };
      }
    };
  }
  attachShimSummarize();
  setTimeout(attachShimSummarize, 150);

  console.log('✅ preload.js initialization complete');
})();