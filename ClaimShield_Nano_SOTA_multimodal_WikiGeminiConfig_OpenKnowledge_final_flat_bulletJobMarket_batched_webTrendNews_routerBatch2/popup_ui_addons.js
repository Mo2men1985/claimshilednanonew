
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

(function () {
  if (window.__CS_UI_ADDONS__) return;
  window.__CS_UI_ADDONS__ = true;
  const $=(s,r=document)=>r.querySelector(s);
  const el=(t,a={},...k)=>{const n=document.createElement(t);for(const [kk,v] of Object.entries(a||{})){if(kk==="class")n.className=v;else if(kk==="text")n.textContent=v;else n.setAttribute(kk,v);}for(const x of k.flat().filter(Boolean))n.appendChild(typeof x==="string"?document.createTextNode(x):x);return n;};
  const uniqBy=(arr,key)=>{const seen=new Set(),out=[];for(const x of arr||[]){const k=key(x);if(!k||seen.has(k))continue;seen.add(k);out.push(x);}return out;};
  const domainOf=(u)=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch{return""}};
  const faviconFor=(u)=>{const d=domainOf(u);return d?`https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=64`:""};
  const verdictClass=(v)=>{const s=String(v||"").toUpperCase();if(s==="OK")return"ok";if(s==="LIKELY_OK")return"likely";return"nr"};
  function collectCitations(p){const o=[];if(Array.isArray(p?.citations))o.push(...p.citations);if(Array.isArray(p?.results)){for(const r of p.results){if(Array.isArray(r?.citations))o.push(...r.citations);if(Array.isArray(r?.proof?.spans)){for(const s of r.proof.spans)o.push({title:s.title||s.snippet||"",url:s.url||s.link||"",domain:s.domain||""});}}}if(Array.isArray(p?.proof?.spans)){for(const s of p.proof.spans)o.push({title:s.title||s.snippet||"",url:s.url||s.link||"",domain:s.domain||""});}const n=o.map(c=>({title:c.title||c.snippet||c.url||"",url:c.url||c.link||"",domain:c.domain||domainOf(c.url||"")})).filter(c=>c.title||c.url);return uniqBy(n,x=>x.url||x.title)}
  function renderSourcesBlock(p,m){const b=el("div",{class:"cs-section"});b.appendChild(el("div",{class:"cs-title",text:"Sources"}));const list=collectCitations(p);if(!list.length){b.appendChild(el("div",{class:"cs-empty",text:"No sources found for this claim."}));}else{const ul=el("div",{class:"cs-sources",role:"list"});for(const c of list.slice(0,8)){const fav=el("img",{class:"cs-favicon",src:faviconFor(c.url),alt:""});const title=el("a",{href:c.url||"#",target:"_blank",rel:"noreferrer",text:c.title||(c.url||"").slice(0,60)});const domain=el("div",{class:"cs-source-domain",text:c.domain||domainOf(c.url)||""});const row=el("div",{class:"cs-source",role:"listitem"},fav,el("div",{},title,domain),el("div",{},el("span",{class:"cs-dim"})));ul.appendChild(row);}b.appendChild(ul);}m.appendChild(b);return b}
  function pickClaimsAndResults(p){let c=[],r=[];if(Array.isArray(p?.claims)&&Array.isArray(p?.results)){c=p.claims;r=p.results;}else if(Array.isArray(p?.structured?.claims)){c=p.structured.claims.map(x=>x.text||String(x||""));r=c.map(_=>p);}else if(typeof p?.summary==="string"){c=String(p.summary).split(/[.!?]\s+/).map(s=>s.trim()).filter(Boolean).slice(0,3);r=c.map(_=>p);}else if(typeof p?.input==="string"){c=String(p.input).split(/[.!?]\s+/).map(s=>s.trim()).filter(Boolean).slice(0,3);r=c.map(_=>p);}return{claims:c,results:r}}
  function renderClaimChips(p,m,on){const {claims,results}=pickClaimsAndResults(p);const b=el("div",{class:"cs-section"});b.appendChild(el("div",{class:"cs-title",text:"Claims"}));if(!claims.length){b.appendChild(el("div",{class:"cs-empty",text:"No claims detected."}));m.appendChild(b);return b;}const w=el("div",{class:"cs-chip-wrap",role:"list"});claims.forEach((text,i)=>{const r=results[i]||{};const v=(r.verdict||r.status||"NEEDS_REVIEW").toUpperCase();const conf=Number(r.confidence||r.tau||0);const chip=el("button",{class:`cs-chip ${verdictClass(v)}`,type:"button",role:"listitem","aria-label":`Claim ${i+1}: ${v} (${Math.round(conf*100)}%)`},el("span",{class:"cs-chip-label",text:(v==="OK"?"OK":v==="LIKELY_OK"?"Likely OK":"Needs review")}),el("span",{class:"cs-chip-claim",text}));chip.addEventListener("click",()=>on?.({index:i,claim:text,result:r}));w.appendChild(chip)});b.appendChild(w);m.appendChild(b);return b}
  function asNum(x,d=0){const n=Number(x);return Number.isFinite(n)?n:d}
  function summarizePayload(p){const engine=p?.provenance?.engine||p?.mode||"";const conf=asNum(p?.confidence??p?.proof?.confidence??p?.tau??0);const cites=collectCitations(p).map(c=>c.url).filter(Boolean);return{engine,confidence:conf,citations:new Set(cites)}}
  function renderHybridDeltaCard(p,prevLocal,m){const now=summarizePayload(p);const prev=(prevLocal&&(prevLocal.provenance?.engine==="local"||prevLocal.mode==="local"))?summarizePayload(prevLocal):null;if((now.engine!=="hybrid")||!prev)return null;const deltaConf=Math.round((now.confidence-prev.confidence)*100);const newCites=[...now.citations].filter(u=>!prev.citations.has(u));const card=el("div",{class:"cs-section"});card.appendChild(el("div",{class:"cs-title",text:"What Hybrid added"}));const badge=el("div",{class:"cs-delta-badge",text:`Confidence Δ: ${deltaConf>=0?"+":""}${deltaConf}%`});card.appendChild(badge);const grid=el("div",{class:"cs-delta-grid"});grid.appendChild(el("div",{class:"cs-kv"},el("div",{class:"k",text:"Engine"}),el("div",{class:"v",text:"Hybrid (Gemini)"})));grid.appendChild(el("div",{class:"cs-kv"},el("div",{class:"k",text:"Prev run"}),el("div",{class:"v",text:"Local"})));card.appendChild(grid);card.appendChild(el("hr",{class:"cs-hr"}));card.appendChild(el("div",{class:"cs-title",text:"New sources"}));if(newCites.length===0){card.appendChild(el("div",{class:"cs-empty",text:"No new sources beyond Local."}));}else{const list=el("div",{class:"cs-sources",role:"list"});newCites.slice(0,6).forEach(u=>{const row=el("div",{class:"cs-source",role:"listitem"},el("img",{class:"cs-favicon",src:faviconFor(u),alt:""}),el("div",{},el("a",{href:u,target:"_blank",rel:"noreferrer",text:u}),el("div",{class:"cs-source-domain",text:domainOf(u)})),el("div",{},el("span",{class:"cs-dim"})));list.appendChild(row)});card.appendChild(list)}m.appendChild(card);return card}
  function decorateEvidenceUI(p,m=$("#results")){if(!m)return;for(const sel of [".cs-section"])m.querySelectorAll(sel).forEach(n=>n.remove());renderClaimChips(p,m,({index})=>{const section=m.querySelector(".cs-title")||m.firstElementChild;section?.scrollIntoView({behavior:"smooth",block:"nearest"});});renderSourcesBlock(p,m);const lastLocal=window.__LAST_LOCAL_RESULT__;renderHybridDeltaCard(p,lastLocal,m);try{window.__LAST_EVIDENCE_RESULT__=p;const engine=p?.provenance?.engine||p?.mode;if(engine==="local")window.__LAST_LOCAL_RESULT__=p;}catch{}}
  try{if(typeof window.renderEvidenceResults==="function"&&!window.renderEvidenceResults.__CS_WRAPPED__){const __orig=window.renderEvidenceResults;window.renderEvidenceResults=function(payload){const ret=__orig.apply(this,arguments);try{decorateEvidenceUI(payload,document.querySelector("#results")||document.body)}catch(e){console.warn("decorateEvidenceUI error",e)}window.renderEvidenceResults.__CS_WRAPPED__=true;return ret;};}}catch(e){console.warn("CS UI wrap failed",e)}
  Object.assign(window,{cs_decorateEvidenceUI:decorateEvidenceUI});
})();
// ===== Popup create() auto-lang wrapper (idempotent) =====
(() => {
  try {
    const withLang = (opts={}) => ({ outputLanguage: OUTPUT_LANG(), ...opts });
    if (globalThis.LanguageModel && typeof globalThis.LanguageModel.create === 'function' && !globalThis.LanguageModel.__outLangPatched) {
      const _orig = globalThis.LanguageModel.create.bind(globalThis.LanguageModel);
      globalThis.LanguageModel.create = (opts={}) => _orig(withLang(opts));
      globalThis.LanguageModel.__outLangPatched = true;
    }
    if (globalThis.Prompt && typeof globalThis.Prompt.create === 'function' && !globalThis.Prompt.__outLangPatched) {
      const _orig = globalThis.Prompt.create.bind(globalThis.Prompt);
      globalThis.Prompt.create = (opts={}) => _orig(withLang(opts));
      globalThis.Prompt.__outLangPatched = true;
    }
    if (globalThis.ai && typeof globalThis.ai === 'object') {
      const targets = ['summarizer','writer','rewriter','proofreader','translator','languageModel'];
      for (const k of targets) {
        const obj = globalThis.ai[k];
        if (obj && typeof obj.create === 'function' && !obj.__outLangPatched) {
          const _orig = obj.create.bind(obj);
          obj.create = (opts={}) => _orig(withLang(opts));
          obj.__outLangPatched = true;
        }
      }
    }
  } catch(e){}
})();

// === Hybrid autorun bridge (idempotent) ===
(() => {
  try {
    if (globalThis.__claimshieldHybridAutoBound) return;
    globalThis.__claimshieldHybridAutoBound = true;
    async function tryHybridAuto(lastText, lastLocalResult){
      try {
        const fn = (globalThis.classifyWithGemini || (globalThis.ai_local && globalThis.ai_local.classifyWithGemini));
        if (!fn) return;
        if (!globalThis.__lastHybridInput) globalThis.__lastHybridInput = "";
        if (String(lastText||"") === globalThis.__lastHybridInput) return;
        globalThis.__lastHybridInput = String(lastText||"");
        try{ setEngineChip('hybrid'); }catch(e){}
        const out = await fn(lastText, { localResult: lastLocalResult });
        try{ window.dispatchEvent(new CustomEvent('claimshield:hybridComplete', { detail: { out } })); }catch(e){}
      } catch(e){}
    }
    window.addEventListener('claimshield:localComplete', (ev)=>{
      const d = (ev && ev.detail) || {};
      tryHybridAuto(d.text, d.result);
    });
    if (!window.__claimshieldLocalPatched && typeof window.renderLocalResult === 'function') {
      const _r = window.renderLocalResult;
      window.renderLocalResult = function(text, result){
        try{ _r(text, result); }catch(e){}
        try{ window.dispatchEvent(new CustomEvent('claimshield:localComplete',{detail:{text, result}})); }catch(e){}
      };
      window.__claimshieldLocalPatched = true;
    }
  } catch(e){}
})();
