
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

// lm_proxy_guard.js — enforce outputLanguage on all LanguageModel.create()
(function(){
  'use strict';
  const SUP = ['en','es','ja'];
  function OUT_MODEL(){
    try{
      const v = (globalThis && globalThis.CLAIMSHIELD_LANG) || 'en';
      return SUP.includes(v) ? v : 'en';
    }catch{ return 'en'; }
  }
  function patchLM(lm){
    if (!lm || typeof lm.create !== 'function' || lm.__outPatched) return lm;
    const orig = lm.create.bind(lm);
    function wrapped(opts){
      opts = opts && typeof opts==='object' ? opts : {};
      if (!('outputLanguage' in opts)) opts.outputLanguage = OUT_MODEL();
      return orig(opts);
    }
    Object.defineProperty(lm, 'create', { value: wrapped, configurable: true, writable: false });
    Object.defineProperty(lm, '__outPatched', { value: true, configurable: false, writable: false });
    console.log('[LM Proxy Guard] LanguageModel.create() patched with outputLanguage');
    return lm;
  }
  function tryPatch(){
    try{
      if (typeof globalThis !== 'undefined' && globalThis.LanguageModel) patchLM(globalThis.LanguageModel);
      if (globalThis.ai && globalThis.ai.languageModel) patchLM(globalThis.ai.languageModel);
      if (globalThis.chrome && globalThis.chrome.ai && globalThis.chrome.ai.languageModel) patchLM(globalThis.chrome.ai.languageModel);
    }catch(e){}
  }
  tryPatch();
  [10,25,50,100,200,400,800].forEach(ms=>setTimeout(tryPatch, ms));
  if (typeof window!=='undefined') window.__lmProxyTry = tryPatch;
})();