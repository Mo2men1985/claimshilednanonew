
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


(function(){
  function has(k){ return typeof window[k] === "function"; }
  async function tryEnsureLM(){
    if (!('LanguageModel' in self)) return { ok:false, reason:"Prompt API not available" };
    try{
      if (typeof LanguageModel.availability !== 'function') {
        return { ok:false, reason:"LanguageModel.availability not supported" };
      }
      const avail = await LanguageModel.availability();
      if (avail === 'readily' || avail === 'ready') return { ok:true, state:avail };
      const s = await LanguageModel.create({ outputLanguage: OUTPUT_LANG() });
      await s?.destroy?.();
      return { ok:true, state:'downloaded' };
    }catch(e){ return { ok:false, reason:String(e&&e.message||e) }; }
  }
  window.runClaimShieldDiagnostics = async () => ({
    exports:{
      ensureLanguageModelReady: has("ensureLanguageModelReady"),
      createPromptSession: has("createPromptSession"),
      summarize: has("summarize"),
      classifyWithStructuredOutput: has("classifyWithStructuredOutput"),
      classifyWithGemini: has("classifyWithGemini"),
      proofread: has("proofread"),
      translate: has("translate"),
      writerDraft: has("writerDraft"),
      checkVisionSupport: has("checkVisionSupport"),
      analyzeImageInput: has("analyzeImageInput")
    },
    apis:{
      LanguageModel: ('LanguageModel' in self),
      Summarizer: ('Summarizer' in self),
      Translator: ('Translator' in self),
      Writer: ('Writer' in self),
      Rewriter: ('Rewriter' in self),
      Proofreader: ('Proofreader' in self)
    },
    tests:{ ensureLM: await tryEnsureLM() }
  });
})();


async function diagnoseVision(){
  const ok = await (window.checkVisionSupport?.() || Promise.resolve(false));
  const log = document.querySelector('#diagOut');
  if (log) {
    log.style.display = 'block';
    log.textContent += "\n[Vision] support: " + (ok ? "YES" : "NO");
  }
  return ok;
}

(() => {
  const btn = document.querySelector('#diagBtn');
  if (btn) {
    btn.addEventListener('click', () => { diagnoseVision(); });
  }
})();
