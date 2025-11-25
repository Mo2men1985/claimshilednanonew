
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

// Auto-extracted inline handlers (CSP-safe)
(function(){
(function(){
      const b=document.getElementById('builtinBtn');
      if(b){ b.addEventListener('click', ()=>{
        const url = chrome.runtime.getURL('builtin_tldr.html');
        chrome.tabs.create({ url });
      });}
    })();
})();
;
(function(){
(function(){
      const d=document.getElementById('diagBtn');
      if(d){ d.addEventListener('click', ()=>{
        const url = chrome.runtime.getURL('diagnostics.html');
        chrome.tabs.create({ url });
      });}
    })();
})();
;
(function(){
(function(){
      const e=document.getElementById('exportBtn');
      if(e){
        e.addEventListener('click', ()=>{
          const url = chrome.runtime.getURL('export_markdown.html');
          chrome.tabs.create({ url });
        });
      }
    })();
})();
