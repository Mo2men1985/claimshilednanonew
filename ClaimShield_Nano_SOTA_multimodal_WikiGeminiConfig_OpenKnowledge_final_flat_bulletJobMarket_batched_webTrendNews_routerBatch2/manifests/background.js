
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

// MV3 service worker — store-safe (no contextMenus permission required)
async function getActiveTabIdSafe() {
  try {
    if (chrome?.tabs?.query) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab?.id || null;
    }
  } catch {}
  return null;
}
function initContextMenusSafely() {
  try {
    if (!chrome?.contextMenus) return;
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "claimshield_evidence_check",
        title: "ClaimShield: Evidence Check",
        contexts: ["selection", "page"]
      });
    });
    if (chrome.contextMenus.onClicked) {
      chrome.contextMenus.onClicked.addListener(async (info, tab) => {
        try {
          const tabId = tab?.id || await getActiveTabIdSafe();
          if (!tabId) return;
          await chrome.tabs.sendMessage(tabId, { type: "RUN_EVIDENCE_FROM_BG" }).catch(() => {});
        } catch {}
      });
    }
  } catch (e) { console.warn("ContextMenus init skipped:", e); }
}
chrome.commands?.onCommand.addListener(async (command) => {
  try {
    if (command === "quick-verify") {
      const tabId = await getActiveTabIdSafe();
      if (!tabId) return;
      await chrome.tabs.sendMessage(tabId, { type: "RUN_EVIDENCE_FROM_BG" }).catch(() => {});
    }
  } catch (e) { console.warn("Command handler error:", e); }
});
chrome.action?.onClicked?.addListener(async (tab) => {
  try {
    const tabId = tab?.id || await getActiveTabIdSafe();
    if (!tabId) return;
    await chrome.tabs.sendMessage(tabId, { type: "RUN_EVIDENCE_FROM_BG" }).catch(() => {});
  } catch (e) { console.warn("Action click error:", e); }
});
self.addEventListener("install", () => { initContextMenusSafely(); });
self.addEventListener("activate", () => { initContextMenusSafely(); });
self.addEventListener("unhandledrejection", (e) => { console.warn("Unhandled rejection in SW:", e?.reason); });

// === Hybrid guards & dispatcher (background.js) ===
async function hybridEnabled() {
  try {
    const { HYBRID_ON, GEMINI_API_KEY } = await chrome.storage.local.get(["HYBRID_ON", "GEMINI_API_KEY"]);
    return !!(HYBRID_ON && GEMINI_API_KEY);
  } catch { return false; }
}

async function callGemini(jsonBody) {
  if (!(await hybridEnabled())) throw new Error("Hybrid disabled or missing API key");
  const { GEMINI_API_KEY: KEY } = await chrome.storage.local.get("GEMINI_API_KEY");
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + encodeURIComponent(KEY);
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...jsonBody, generationConfig: { temperature: 0, ...(jsonBody?.generationConfig||{}) }}),
      signal: ctl.signal
    });
    if (!res.ok) {
      const txt = await res.text().catch(()=>res.statusText);
      throw new Error(`Gemini ${res.status} ${res.statusText}: ${txt}`);
    }
    return await res.json();
  } finally { clearTimeout(t); }
}

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (!msg || msg.type !== "HYBRID_REQUEST") return;
  (async () => {
    try { respond({ ok: true, data: await callGemini(msg.body || {}) }); }
    catch (e) { respond({ ok: false, error: String(e) }); }
  })();
  return true;
});
