
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

// lang_guard_nuclear.js — absolute-first stub that *owns* LanguageModel + nested wrappers
(function(){
  'use strict';
  const SUP = ['en','es','ja'];
  function OUT_MODEL(){
    try { const v = (globalThis && globalThis.CLAIMSHIELD_LANG) || 'en'; return SUP.includes(v) ? v : 'en'; }
    catch { return 'en'; }
  }
  let __realLM = null;
  const StubLM = {
    async create(opts = {}){
      if (!('outputLanguage' in opts)) opts.outputLanguage = OUT_MODEL();
      if (!__realLM || typeof __realLM.create !== 'function') {
        const t0 = Date.now();
        while ((!__realLM || typeof __realLM.create !== 'function') && Date.now() - t0 < 2000) {
          await new Promise(r => setTimeout(r, 20));
        }
      }
      const target = (__realLM && typeof __realLM.create === 'function') ? __realLM : (globalThis.__LanguageModel_real || null);
      // Soft‑veto: if no real language model exists, route to Evidence mode without crashing.
      if (!target || typeof target.create !== 'function') {
        console.info('[LangGuard VETO] Built‑in LM unavailable — routing to Evidence.');
        // Invoke fallback helpers if they exist. These functions are defined elsewhere in the extension.
        window.__cs_routeNoBuiltInLM?.();
        window.__cs_setBanner?.('Not Grounded: Built‑in AI unavailable — using Evidence mode.');
        return null;
      }
      return target.create(opts);
    }
  };
  try {
    Object.defineProperty(globalThis, 'LanguageModel', {
      configurable: true,
      get(){ return StubLM; },
      set(v){ __realLM = v; globalThis.__LanguageModel_real = v; }
    });
  } catch (e) { globalThis.LanguageModel = StubLM; }
  function guardNested(root, chain){
    const parts = chain.split('.');
    let obj = root;
    for (let i=0;i<parts.length-1;i++){
      const k = parts[i];
      if (!obj[k]) { try { obj[k] = {}; } catch {} }
      obj = obj[k];
    }
    const leaf = parts[parts.length-1];
    let realVal = null;
    const wrapper = {
      async create(opts = {}){
        if (!('outputLanguage' in opts)) opts.outputLanguage = OUT_MODEL();
        const t0 = Date.now();
        while ((!realVal || typeof realVal.create !== 'function') && Date.now() - t0 < 2000) {
          await new Promise(r => setTimeout(r, 20));
        }
        const tgt = (realVal && typeof realVal.create === 'function') ? realVal : null;
        // Soft‑veto: if no nested language model exists, route to Evidence mode without crashing.
        if (!tgt) {
          console.info('[LangGuard VETO] Built‑in LM unavailable — routing to Evidence.');
          window.__cs_routeNoBuiltInLM?.();
          window.__cs_setBanner?.('Not Grounded: Built‑in AI unavailable — using Evidence mode.');
          return null;
        }
        return tgt.create(opts);
      }
    };
    try {
      Object.defineProperty(obj, leaf, {
        configurable: true,
        get(){ return wrapper; },
        set(v){ realVal = v; }
      });
    } catch (_){ obj[leaf] = wrapper; }
  }
  guardNested(globalThis, 'ai.languageModel');
  if (globalThis.chrome) guardNested(globalThis, 'chrome.ai.languageModel');
  console.log('✅ [LangGuard NUCLEAR] Installed stub for LanguageModel + nested guards');
})();