
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

// background.js — Rev 2.9.3 clean
self.addEventListener('install', () => { try { self.skipWaiting && self.skipWaiting(); } catch {} });
self.addEventListener('activate', (evt) => {
  evt.waitUntil((async () => { try { self.clients && self.clients.claim && await self.clients.claim(); } catch {} })());
});
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  try {
    if (msg && msg.ping === 'cs') { sendResponse({ ok:true, ts: Date.now() }); return true; }
    if (msg && msg.cmd === 'OPEN_URLS') {
      (msg.urls||[]).forEach(u => chrome.tabs.create({ url: u }));
      sendResponse({ ok:true }); return true;
    }
  } catch {}
});
