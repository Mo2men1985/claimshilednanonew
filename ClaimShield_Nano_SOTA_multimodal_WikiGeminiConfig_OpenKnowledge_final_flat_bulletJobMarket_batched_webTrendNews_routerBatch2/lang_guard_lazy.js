
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


// lang_guard_lazy.js — LangGuard NUCLEAR (lazy + non-blocking)
(function langGuardNuclear() {
  'use strict';

  const SEEN = new WeakSet();
  const OUT_LANG = () =>
    (typeof OUTPUT_LANG_MODEL === 'function' && OUTPUT_LANG_MODEL()) ||
    (typeof OUTPUT_LANG === 'function' && OUTPUT_LANG()) ||
    (globalThis?.CLAIMSHIELD_LANG) || 'en';

  function wrapCreate(obj, label) {
    if (!obj || typeof obj.create !== 'function' || SEEN.has(obj)) return false;
    try {
      const original = obj.create.bind(obj);
      obj.create = function patchedCreate(opts = {}) {
        if (!opts.outputLanguage) opts.outputLanguage = OUT_LANG();
        return original(opts);
      };
      Object.defineProperty(obj, '__outLangPatched', { value: true, configurable: true });
      SEEN.add(obj);
      console.log(`🛡️ [LangGuard] Wrapped ${label}.create()`);
      return true;
    } catch (e) {
      console.debug(`[LangGuard] Could not wrap ${label}:`, e);
      return false;
    }
  }

  function tryWrapNow() {
    let n = 0;
    if (typeof globalThis.LanguageModel !== 'undefined') n += wrapCreate(globalThis.LanguageModel, 'LanguageModel') ? 1 : 0;
    if (typeof globalThis.Prompt !== 'undefined')       n += wrapCreate(globalThis.Prompt, 'Prompt') ? 1 : 0;
    if (typeof globalThis.Summarizer !== 'undefined')   n += wrapCreate(globalThis.Summarizer, 'Summarizer') ? 1 : 0;

    if (globalThis.chrome?.ai) {
      const apis = ['languageModel','summarizer','writer','rewriter','proofreader','translator'];
      for (const k of apis) if (globalThis.chrome.ai[k]) n += wrapCreate(globalThis.chrome.ai[k], `chrome.ai.${k}`) ? 1 : 0;
    }
    if (globalThis.ai) {
      const apis = ['languageModel','summarizer','writer','rewriter','proofreader','translator'];
      for (const k of apis) if (globalThis.ai[k]) n += wrapCreate(globalThis.ai[k], `ai.${k}`) ? 1 : 0;
    }
    return n;
  }

  function intercept(obj, prop, onDefine) {
    const desc = Object.getOwnPropertyDescriptor(obj, prop);
    if (desc && !desc.configurable) return;
    let _value = obj[prop];
    Object.defineProperty(obj, prop, {
      configurable: true,
      enumerable: true,
      get() { return _value; },
      set(v) {
        _value = v;
        try { onDefine(v); } catch (e) { console.debug('[LangGuard] onDefine error:', e); }
      }
    });
    if (typeof _value !== 'undefined') {
      try { onDefine(_value); } catch {}
    }
  }

  intercept(globalThis, 'ai', (aiObj) => {
    if (!aiObj || typeof aiObj !== 'object') return;
    ['languageModel','summarizer','writer','rewriter','proofreader','translator']
      .forEach(k => intercept(aiObj, k, (svc) => wrapCreate(svc, `ai.${k}`)));
  });

  intercept(globalThis, 'chrome', (ch) => {
    const aiRoot = ch && ch.ai;
    if (!aiRoot || typeof aiRoot !== 'object') return;
    ['languageModel','summarizer','writer','rewriter','proofreader','translator']
      .forEach(k => intercept(aiRoot, k, (svc) => wrapCreate(svc, `chrome.ai.${k}`)));
  });

  const immediate = tryWrapNow();
  if (immediate) console.log(`🛡️ [LangGuard] Wrapped ${immediate} APIs immediately`);

  const RETRIES = [50, 150, 400, 1000, 2000];
  RETRIES.forEach(ms => setTimeout(tryWrapNow, ms));

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryWrapNow, { once: true });
  } else {
    setTimeout(tryWrapNow, 0);
  }
})();
