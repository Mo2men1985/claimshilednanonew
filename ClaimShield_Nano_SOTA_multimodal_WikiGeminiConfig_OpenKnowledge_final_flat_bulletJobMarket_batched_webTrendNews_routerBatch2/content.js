
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

// ClaimShield Content Script — Fixed Memory Leaks

// Prevent double-injection
if (window.__CLAIMSHIELD_INJECTED__) {
  console.log("ClaimShield already loaded, skipping duplicate injection");
} else {
  window.__CLAIMSHIELD_INJECTED__ = true;

  let highlightedElements = [];
  let lastSelectionText = "";

  // Use single event listener with AbortController for cleanup
  const controller = new AbortController();
  const { signal } = controller;

  // Keep a cached selection up-to-date
  document.addEventListener("selectionchange", () => {
    try {
      const sel = window.getSelection();
      const t = sel?.toString()?.trim() || "";
      if (t) lastSelectionText = t;
    } catch (_) {}
  }, { signal });

  // Handle messages from the extension
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const type = msg?.type || msg?.cmd;

    // Primary selection endpoint
    if (type === "GET_SELECTION") {
      let text = "";

      // 1) Page selection
      try {
        const sel = window.getSelection();
        text = sel?.toString()?.trim() || "";
      } catch (_) {}

      // 2) Selection inside input/textarea/contentEditable
      try {
        const ae = document.activeElement;
        if (!text && ae) {
          if (typeof ae.selectionStart === "number" &&
              typeof ae.selectionEnd === "number" &&
              typeof ae.value === "string") {
            const t = ae.value.slice(ae.selectionStart, ae.selectionEnd).trim();
            if (t) text = t;
          } else if (ae.isContentEditable) {
            const s2 = window.getSelection()?.toString();
            if (s2?.trim()) text = s2.trim();
          }
        }
      } catch (_) {}

      // 3) Fallback to cached (survives popup focus)
      if (!text) text = lastSelectionText || "";

      sendResponse({ text });
      return true;
    }

    if (type === "GET_SELECTION_CACHED") {
      sendResponse({ text: lastSelectionText || "" });
      return true;
    }

    if (type === "HIGHLIGHT") {
      clearHighlights();
      highlightSpans(msg.spans || []);
      sendResponse({ success: true });
      return true;
    }

    if (type === "CLEAR_HIGHLIGHTS") {
      clearHighlights();
      sendResponse({ success: true });
      return true;
    }

    if (type === "QUICK_VERIFY") {
      quickVerify();
      return true;
    }
  });

  // Cleanup on page unload
  window.addEventListener("beforeunload", () => {
    controller.abort();
    clearHighlights();
  }, { once: true });

  // ----- Highlight helpers -----

  function highlightSpans(spans) {
    if (!spans?.length) return;
    showNotification("🔍 Highlighting suspicious content...", 2000);

    const sel = window.getSelection();
    const selectedText = sel?.toString() || lastSelectionText || "";

    if (!selectedText) {
      showNotification("⚠️ No text selected to highlight", 3000);
      return;
    }

    const walker = document.createTreeWalker(
      document.body, 
      NodeFilter.SHOW_TEXT, 
      null, 
      false
    );

    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent;
      const searchTerm = selectedText.substring(0, Math.min(50, selectedText.length));
      if (selectedText && text.includes(searchTerm)) {
        highlightTextNode(node, spans, selectedText);
      }
    }

    showNotification(`✅ Highlighted ${spans.length} suspicious area(s)`, 3000);
  }

  function highlightTextNode(node, spans) {
    spans.forEach((span) => {
      const snippet = span.snippet || "";
      const startIdx = node.textContent.indexOf(snippet);
      if (startIdx === -1) return;

      const range = document.createRange();
      try {
        range.setStart(node, startIdx);
        range.setEnd(node, startIdx + snippet.length);

        const wrapper = document.createElement("span");
        wrapper.className = "claimshield-highlight";
        wrapper.style.cssText = `
          background: linear-gradient(120deg, rgba(255,50,50,0.3), rgba(255,100,50,0.2));
          border-bottom: 2px wavy red;
          cursor: help;
          padding: 2px 0;
          transition: all 0.3s ease;
        `;
        wrapper.dataset.confidence = span.confidence || "unknown";
        wrapper.dataset.spanId = span.span_id || "";

        range.surroundContents(wrapper);
        highlightedElements.push(wrapper);
      } catch (e) {
        console.warn("Could not highlight range:", e);
      }
    });
  }

  function clearHighlights() {
    highlightedElements.forEach((el) => {
      try {
        const parent = el.parentNode;
        if (parent) {
          const textNode = document.createTextNode(el.textContent);
          parent.replaceChild(textNode, el);
          parent.normalize();
        }
      } catch (e) {
        console.warn("Could not remove highlight:", e);
      }
    });
    highlightedElements = [];
    showNotification("🧹 Highlights cleared", 2000);
  }

  function showNotification(text, duration = 3000) {
    const existing = document.getElementById("claimshield-notification");
    if (existing) existing.remove();

    const div = document.createElement("div");
    div.id = "claimshield-notification";
    div.textContent = text;
    div.style.cssText = `
      position: fixed; top: 20px; right: 20px;
      background: linear-gradient(135deg, #667eea, #764ba2);
      color: #fff; padding: 16px 24px; border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3); z-index: 2147483647;
      font: 500 14px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      animation: slideIn 0.3s ease-out;
    `;
    document.body.appendChild(div);
    
    setTimeout(() => {
      div.style.animation = "slideOut 0.3s ease-in";
      setTimeout(() => div.remove(), 300);
    }, duration);
  }

  async function quickVerify() {
    const sel = window.getSelection();
    const text = sel?.toString()?.trim() || lastSelectionText || "";
    
    if (!text) {
      showNotification("⚠️ Please select some text first", 3000);
      return;
    }
    
    showNotification("🔍 Verifying claim...", 2000);
    chrome.runtime.sendMessage({ type: "QUICK_VERIFY", text }, () => {});
  }

  console.log("✅ ClaimShield content script loaded (memory-safe)");
}

// Add CSS animations
if (!document.getElementById('claimshield-animations')) {
  const style = document.createElement('style');
  style.id = 'claimshield-animations';
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(400px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(400px); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

/* Note: content scripts must not call Gemini directly; proxy via background:
   */


// --- Compatibility shim: map background triggers to GET_SELECTION path
try {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const t = msg && (msg.type || msg.cmd);
    if (t === "RUN_EVIDENCE_FROM_BG" || t === "CLAIMSHIELD_CONTEXT_VERIFY") {
      try {
        const sel = window.getSelection();
        let text = sel?.toString()?.trim() || "";
        const ae = document.activeElement;
        if (!text && ae && typeof ae.value === "string") {
          if (typeof ae.selectionStart === "number" && typeof ae.selectionEnd === "number") {
            const t2 = ae.value.slice(ae.selectionStart, ae.selectionEnd).trim();
            if (t2) text = t2;
          } else {
            text = ae.value.trim();
          }
        }
        if (!text) text = (window.__CLAIMSHIELD_LAST_SEL || "");
        window.__CLAIMSHIELD_LAST_SEL = text;
        sendResponse({ text });
      } catch (e) { sendResponse({ text: "" }); }
      return true;
    }
  });
} catch (e) {}

/* Hybrid note:
   Content scripts must NOT call Gemini directly.
   Always proxy through the background (or popup) context.

   // Example:
   // chrome.runtime.sendMessage(
   //   { type: "HYBRID_REQUEST", body: { prompt: "your prompt text here" } },
   //   (res) => console.log("HYBRID_RESPONSE", res)
   // );
*/


// === Page context for multimodal pipeline ===
function csFindFirstVisibleImage() {
  const candidates = Array.from(document.images || []);
  const viewportHeight = window.innerHeight || 800;
  const viewportWidth = window.innerWidth || 1280;

  for (const img of candidates) {
    if (!img.src) continue;
    const rect = img.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > viewportHeight) continue;
    if (rect.right < 0 || rect.left > viewportWidth) continue;

    const width = Math.round(rect.width || img.width || 0);
    const height = Math.round(rect.height || img.height || 0);
    if (width < 32 || height < 32) continue;

    return {
      src: img.src,
      alt: img.alt || '',
      width,
      height
    };
  }
  return null;
}

function csGetPageContextPayload() {
  const selection = window.getSelection && window.getSelection().toString();
  const text = (selection || document.body.innerText || '').trim().slice(0, 4000);
  const pageUrl = location.href;
  const imageInfo = csFindFirstVisibleImage();
  return { text, pageUrl, imageInfo };
}

try {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== 'CS_GET_PAGE_CONTEXT') return;

    try {
      const payload = csGetPageContextPayload();
      sendResponse({ ok: true, context: payload });
    } catch (e) {
      console.warn('[ClaimShield] Failed to build page context:', e);
      sendResponse({ ok: false, error: String(e) });
    }

    return true;
  });
} catch (_) {}
