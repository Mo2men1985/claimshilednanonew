
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

// lang_guard_trace.js — clamps + traces missing outputLanguage callers
(function(){
  'use strict';
  const SUP = ['en','es','ja'];
  function OUT_MODEL(){
    try { const v = (globalThis && globalThis.CLAIMSHIELD_LANG) || 'en'; return SUP.includes(v) ? v : 'en'; }
    catch { return 'en'; }
  }
  function wrap(label, obj) {
    if (!obj || typeof obj.create !== 'function' || obj.__traceWrapped) return;
    const orig = obj.create.bind(obj);
    obj.create = function(opts){
  const ok = opts && typeof opts === 'object' && 'outputLanguage' in opts;
  try {
    if (!ok && typeof __fillEvidenceFromWikiOnly === 'function') {
      queueMicrotask(() => {
        const q = (window.__CS_QUERY || '').toString();
        const L = (window.__CS_LAST  || {});
        Promise.resolve(__fillEvidenceFromWikiOnly(q, L)).catch(()=>{});
      });
    }
  } catch {}
const final = ok ? opts : { outputLanguage: OUT_MODEL() };
      return orig(final);
    };
    Object.defineProperty(obj, '__traceWrapped', { value: true });
    console.log(`✅ [LangGuard TRACE] Wrapped ${label}.create()`);
  }
  function hook(root, path, label){
    const chain = path.split('.');
    let parent = root;
    for (let i=0;i<chain.length-1;i++){
      const k = chain[i];
      if (!parent[k]) return;
      parent = parent[k];
    }
    const leaf = chain[chain.length-1];
    if (!parent) return;
    if (parent[leaf]) wrap(label, parent[leaf]);
    let val = parent[leaf];
    try {
      Object.defineProperty(parent, leaf, {
        configurable: true,
        get(){ return val; },
        set(v){ val = v; wrap(label, val); }
      });
      parent[leaf] = val;
    } catch {
      if (parent[leaf]) wrap(label, parent[leaf]);
    }
  }
  hook(globalThis, 'LanguageModel', 'LanguageModel');
  hook(globalThis, 'ai.languageModel', 'ai.languageModel');
  if (globalThis.chrome?.ai) hook(globalThis.chrome, 'ai.languageModel', 'chrome.ai.languageModel');
  [25, 60, 120, 240, 500, 800].forEach(ms => setTimeout(() => {
    hook(globalThis, 'LanguageModel', 'LanguageModel');
    hook(globalThis, 'ai.languageModel', 'ai.languageModel');
    if (globalThis.chrome?.ai) hook(globalThis.chrome, 'ai.languageModel', 'chrome.ai.languageModel');
  }, ms));
  if (typeof globalThis !== 'undefined' && !('CLAIMSHIELD_LANG' in globalThis)) {
    globalThis.CLAIMSHIELD_LANG = 'en';
  }
})();