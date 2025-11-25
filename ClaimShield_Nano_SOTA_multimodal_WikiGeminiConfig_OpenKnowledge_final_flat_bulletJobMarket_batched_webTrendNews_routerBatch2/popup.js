
// === ClaimShield Settings (popup) ===
let CS_SETTINGS = (typeof window !== 'undefined' && window.CS_SETTINGS_DEFAULTS)
  ? window.CS_SETTINGS_DEFAULTS
  : {
      enableImageOCR: true,
      enableWebSearch: false,
      strictRiskMode: false,
      showDebugPanel: false
    };

try {
  if (typeof window !== 'undefined') {
    window.__CS_SETTINGS__ = CS_SETTINGS;
  }
} catch (_) {}

(function initSettingsPopup() {
  try {
    if (typeof csLoadSettings === 'function') {
      csLoadSettings().then((s) => {
        CS_SETTINGS = s;
        try { window.__CS_SETTINGS__ = s; } catch (_) {}
      });
    }
  } catch (_) {}
})();


// === Wiki helpers (Rev 2.9.2) ===
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

// --- Safe active-tab utilities (no hard dependency on "tabs" permission) ---
async function getActiveTabIdSafe() {
  try {
    if (chrome?.tabs?.query) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab?.id || null;
    }
  } catch {}
  return null;
}

async function getSelectionSafe() {
  try {
    const tabId = await getActiveTabIdSafe();
    if (!tabId || !chrome?.tabs?.sendMessage) return "";
    const res = await chrome.tabs.sendMessage(tabId, { type: "GET_SELECTION" }).catch(() => null);
    return res?.text || "";
  } catch {
    return "";
  }
}

if (typeof globalThis !== 'undefined' && !('CLAIMSHIELD_LANG' in globalThis)) { globalThis.CLAIMSHIELD_LANG = 'en'; }
// Safety shim: make sure these exist even if ai_local.js didn't export them
if (typeof window.ensureLanguageModelReady !== "function") {
  window.ensureLanguageModelReady = async (onProgress) => {
    if (!('LanguageModel' in self)) throw new Error("Prompt API not available");
    if (typeof LanguageModel.availability !== 'function') {
      console.warn('[ClaimShield] LanguageModel.availability not supported in this Chrome build');
      return { ready: false };
    }
    const avail = await LanguageModel.availability();
    if (avail === "readily") return { ready: true };
    const s = await LanguageModel.create({ outputLanguage: (typeof OUTPUT_LANG_MODEL==="function"?OUTPUT_LANG_MODEL():"en"), 
      monitor(m){ m.addEventListener?.('downloadprogress', e => onProgress?.(e)); }
    });
    await s.destroy?.();
    return { ready: true };
  };
}
if (typeof window.createPromptSession !== "function") {
  window.createPromptSession = async () => {
    if (!('LanguageModel' in self)) throw new Error("Prompt API not available");
    await window.ensureLanguageModelReady();
    const TIMEOUT_MS = 60000;
    return await Promise.race([
      LanguageModel.create({ outputLanguage: OUTPUT_LANG() }),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error("Model download timeout")), TIMEOUT_MS))
    ]);
  };
}

let LAST = null;
let HYBRID_ON = false;
let HYBRID_KEY = "";
let HISTORY = [];
let USED_WRITER_RECENT = false;

// Load saved settings
chrome.storage.local.get(["hybridOn", "hybridKey", "history"], (data) => {
  const hybridCheckbox = document.getElementById("hybridOn");

  if (typeof data.hybridOn === "boolean") {
    HYBRID_ON = data.hybridOn;
    if (hybridCheckbox) hybridCheckbox.checked = HYBRID_ON;
  } else {
    // Default: Hybrid ON for first-time users
    HYBRID_ON = true;
    if (hybridCheckbox) hybridCheckbox.checked = true;
    try {
      chrome.storage.local.set({ hybridOn: true });
    } catch (_) {
      // storage may be unavailable in some environments; non-fatal
    }
  }

  if (data.hybridKey) {
    HYBRID_KEY = data.hybridKey;
    const keyInput = document.getElementById("hybridKey");
    if (keyInput) keyInput.value = HYBRID_KEY;
  }
  if (data.history) {
    HISTORY = data.history;
    renderHistory();
  }

  // Best-effort auto-preload of local model when popup opens
  if (HYBRID_ON && typeof window.ensureLanguageModelReady === "function") {
    window.ensureLanguageModelReady().catch((err) => {
      console.warn("[ClaimShield] Auto preload failed (non-fatal)", err);
    });
  }
});

// Save settings on change
document.getElementById("hybridOn").addEventListener("change", (e) => {
  HYBRID_ON = e.target.checked;
  chrome.storage.local.set({ hybridOn: HYBRID_ON });
});

document.getElementById("hybridKey").addEventListener("input", (e) => {
  HYBRID_KEY = e.target.value.trim();
  chrome.storage.local.set({ hybridKey: HYBRID_KEY });
});

// Character counter
document.getElementById("selected").addEventListener("input", (e) => {
  const len = e.target.value.length;
  document.getElementById("charCount").textContent = len;
  const warning = document.getElementById("charWarning");
  if (len > 5000) {
    warning.classList.remove("hidden");
  } else {
    warning.classList.add("hidden");
  }
});

// Tab switching
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

// Judge mode examples - CRITICAL FOR DEMO
const JUDGE_EXAMPLES = [
  { 
    label: "Short (URLs + citations)", 
    text: "Researchers at MIT discovered that https://example.com proves climate change is accelerating (Smith et al., 2023, doi:10.1234/example)." 
  },
  { 
    label: "Multilingual (Arabic)", 
    text: "هذا نص باللغة العربية للاختبار. This is a test of mixed language detection capabilities." 
  },
  { 
    label: "No evidence", 
    text: "I think the moon is made of cheese because it looks yellow." 
  },
  { 
    label: "Strong claim", 
    text: "According to peer-reviewed research published in Nature (doi:10.1038/nature12345), the vaccine efficacy is 95%." 
  },
  { 
    label: "Suspicious", 
    text: "Everyone knows that this miracle cure works 100% of the time! No side effects!" 
  },
  { 
    label: "Chinese characters", 
    text: "这是中文测试。根据最新研究，人工智能正在快速发展。AI is developing rapidly." 
  },
  { 
    label: "Long article (10k chars)", 
    text: "The impact of artificial intelligence on modern society cannot be overstated. ".repeat(200) + "Multiple studies from Harvard, MIT, and Stanford (arxiv:2301.12345) have documented this trend." 
  }
];

const judgeContainer = document.getElementById("judgeExamples");
JUDGE_EXAMPLES.forEach((ex) => {
  const btn = document.createElement("button");
  btn.className = "judge-example-btn";
  btn.textContent = ex.label;
  btn.addEventListener("click", () => {
    document.getElementById("selected").value = ex.text;
    document.getElementById("selected").dispatchEvent(new Event("input"));
    document.querySelector('.tab-btn[data-tab="json"]').click();
    setStatus(`Loaded: ${ex.label}`);
  });
  judgeContainer.appendChild(btn);
});

function setStatus(msg) {
  document.getElementById("status").textContent = msg;
  document.getElementById("status").style.display = "block";
}

function setBadge(data) {
  const verdict = data?.structured?.proof?.verdict || "?";
  const color = verdict === "OK" ? "#10b981" : verdict === "NEEDS_REVIEW" ? "#f59e0b" : "#94a3b8";
  chrome.action.setBadgeText({ text: verdict.slice(0, 2) });
  chrome.action.setBadgeBackgroundColor({ color });
}





async function enrichProofWithNewsSummary(proof) {
  try {
    if (!proof) return proof;

    const text =
      (typeof window !== "undefined" && window.__csNewsHeadlinesText) || "";

    if (!text || !text.trim()) return proof;

    if (!Array.isArray(proof.reasons)) {
      proof.reasons = proof.reasons ? [String(proof.reasons)] : [];
    }

    // Avoid duplicating the news context reason
    if (proof.reasons.some(r => typeof r === "string" && r.includes("Live news context (Google News)"))) {
      return proof;
    }

    const SummarizerNS =
      (self.Summarizer && { create: self.Summarizer.create }) ||
      (self.ai && self.ai.summarizer) ||
      (chrome.ai && chrome.ai.summarizer);

    if (!SummarizerNS || typeof SummarizerNS.create !== "function") {
      console.log("[ClaimShield] Summarizer API not available; skipping news enrichment");
      return proof;
    }

    const summarizer = await SummarizerNS.create();
    const result = await summarizer.summarize({
      text,
      format: "bullets",
      maxOutputTokens: 64
    });

    const summaryText = result?.summaries?.[0]?.text?.trim();
    if (!summaryText) return proof;

    proof.reasons.push(`📰 Live news context (Google News): ${summaryText}`);

    // Optionally clear to avoid leaking across sessions
    try {
      if (typeof window !== "undefined") {
        window.__csNewsHeadlinesText = "";
      }
    } catch (_e) {}

    return proof;
  } catch (err) {
    console.warn("[ClaimShield] Failed to summarize news headlines:", err);
    return proof;
  }
}


function patchOutdatedReasons(structured) {
  if (!structured || !structured.proof) return structured;

  const proof   = structured.proof;
  const reasons = Array.isArray(proof.reasons) ? proof.reasons : [];
  const nowYear = new Date().getFullYear();

  let outdated = false;

  for (const reason of reasons) {
    if (typeof reason !== 'string') continue;

    const yearMatch = reason.match(/20\d{2}/);
    if (!yearMatch) continue;

    const year = parseInt(yearMatch[0], 10);
    if (!Number.isFinite(year) || year >= nowYear) continue;

    const futurePhrases = [
      'has not yet occurred',
      'has not yet happened',
      "hasn't happened yet",
      'will take place',
      'is scheduled to take place',
      'is expected to occur',
      'upcoming election'
    ];

    const lower = reason.toLowerCase();
    if (futurePhrases.some(p => lower.includes(p))) {
      outdated = true;
      break;
    }
  }

  if (outdated) {
    proof.abstain        = true;
    proof.verdict        = 'NEEDS_REVIEW';
    proof.abstain_reason = 'outdated_model_knowledge';

    proof.flags = proof.flags || {};
    proof.flags.outdated_model = true;

    const warning =
      '⏳ Time-window notice: This explanation appears to rely on outdated model knowledge ' +
      '(for example, treating a past election as if it is still in the future). ' +
      'The model’s training data likely stops before this event. Treat this as: ' +
      '“The model cannot reliably verify this claim with its current training window.”';

    proof.reasons = [warning, ...reasons];
  }

  structured.proof = proof;
  return structured;
}

function formatResults(data) {
  const formatted = document.getElementById("resultsFormatted");
  const verdict = data?.structured?.proof?.verdict || "UNKNOWN";
  const confidence = (data?.structured?.proof?.confidence || 0) * 100;
  const reasons = data?.structured?.proof?.reasons || [];
  const mode = data?.mode || "local";
  const flags = data?.structured?.proof?.flags || {};
  const outdated = !!flags.outdated_model;

  let modeBadge = `<span class="mode-badge ${mode === "hybrid" ? "hybrid" : "local"}">${mode === "hybrid" ? "Hybrid" : "Local"}</span>`;
  let extraBadge = outdated ? `<span class="verdict-badge verdict-badge-outdated">⏳ Model Outdated</span>` : "";
  let html = `
    <div class="result-verdict verdict-${verdict.toLowerCase()}">
      <strong>Verdict:</strong> ${verdict} ${modeBadge}${extraBadge}
      <div class="confidence-bar">
        <div class="confidence-fill" style="width: ${confidence}%"></div>
      </div>
      <small>${confidence.toFixed(0)}% confidence • ${mode} mode</small>
    </div>
  `;

  if (reasons.length > 0) {
    html += `<div class="result-reasons"><strong>Reasons:</strong><ul>`;
    reasons.forEach((r) => {
      html += `<li>${r}</li>`;
    });
    html += `</ul></div>`;
  }

  if (data.improved) {
    html += `<div class="result-improved"><strong>Proofread:</strong> ${data.improved}</div>`;
  }

  if (data.translation) {
    html += `<div class="result-translation"><strong>Translation (${data.translation.lang}):</strong> ${data.translation.text || data.translation.error}</div>`;
  }

  formatted.innerHTML = html;
  document.getElementById("results").classList.remove("hidden");
}

function addToHistory(data) {
  const entry = {
    timestamp: new Date().toISOString(),
    summary: data?.structured?.summary?.slice(0, 100) || "No summary",
    verdict: data?.structured?.proof?.verdict || "?",
    confidence: data?.structured?.proof?.confidence || 0
  };
  HISTORY.unshift(entry);
  if (HISTORY.length > 20) HISTORY.pop();
  chrome.storage.local.set({ history: HISTORY });
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById("historyList");
  if (HISTORY.length === 0) {
    list.innerHTML = "<p>No history yet. Verify some claims to see them here.</p>";
    return;
  }
  list.innerHTML = "";
  HISTORY.forEach((entry) => {
    const div = document.createElement("div");
    div.className = "history-item";
    div.innerHTML = `
      <strong>${new Date(entry.timestamp).toLocaleString()}</strong>
      <p>${entry.summary}</p>
      <span class="verdict-badge verdict-${entry.verdict.toLowerCase()}">${entry.verdict} (${(entry.confidence * 100).toFixed(0)}%)</span>
    `;
    list.appendChild(div);
  });
}

// FIXED: Clean getSelection function
async function getSelection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return "";
    const res = await chrome.tabs.sendMessage(tab.id, { type: "GET_SELECTION" }).catch(() => null);
    return res?.text || "";
  } catch (e) {
    console.error("getSelection error:", e);
    return "";
  }
}

document.getElementById("btnUseSelection").addEventListener("click", async () => {
  setStatus("Getting selection from page...");
  const txt = await getSelection();
  if (txt) {
    document.getElementById("selected").value = txt;
    document.getElementById("selected").dispatchEvent(new Event("input"));
    setStatus(`✓ Loaded ${txt.length} characters`);
  } else {
    setStatus("No text selected. Please select text on the page first.");
  }
});

// PATCHED: Preload handler uses ensureLanguageModelReady with progress
document.getElementById("btnPreload").addEventListener("click", async () => {
  const btn = document.getElementById("btnPreload");
  btn.disabled = true; btn.classList.add("loading");
  setStatus("Preparing local model…");
  try {
    const onProgress = (ev) => { const p = (ev?.progress ?? ev?.loaded ?? 0); setStatus(`Downloading model… ${(p * 100) | 0}%`); };
    await window.ensureLanguageModelReady(onProgress);
    setStatus("✓ Local model ready");
  } catch (e) {
    setStatus(`Preload error: ${e?.message || e}`);
  } finally {
    btn.disabled = false; btn.classList.remove("loading");
  }
});

// FIXED: Full hybrid mode integration
document.getElementById("btnVerify").addEventListener("click", async () => {
  const usedAPIs = { prompt: false, summarizer: false, proofreader: false, translator: false, writer: false, hybrid: (HYBRID_ON && !!HYBRID_KEY) };
  const txt = document.getElementById("selected").value.trim();
  if (!txt) {
    setStatus("Please enter or select text first");
    return;
  }
  
  setStatus("Verifying claim…");
  const btn = document.getElementById("btnVerify");
  btn.disabled = true;
  btn.classList.add("loading");

  try {
    setStatus("📝 Summarizing…");
    const s = await window.summarize(txt);
    if (s && s.ok) usedAPIs.summarizer = true;
    const claim = (s.ok && s.summary) ? String(s.summary) : txt.slice(0, 1000);

    setStatus("🔍 Classifying…");
    
    let verdict, reasons, spans, confidence, flags;
    
    // HYBRID MODE with proper fallback
    if (HYBRID_ON && HYBRID_KEY) {
      try {
        const geminiResult = await window.classifyWithGemini(claim, HYBRID_KEY);
        verdict = geminiResult.verdict || "ABSTAIN";
        confidence = geminiResult.confidence ?? 0.5;
        reasons = geminiResult.reasons || ["Gemini classification"];
        spans = geminiResult.spans || [];
        flags = geminiResult.flags || {};
        if (typeof imageFlags !== 'undefined' && imageFlags) { if (!flags || typeof flags !== 'object') flags = {}; flags.image = imageFlags; }
      } catch (err) {
        setStatus(`Hybrid error: ${err.message}. Falling back to local…`);
        // Fallback to local
        const session = await window.createPromptSession();
        const cls = await window.classifyWithStructuredOutput(session, claim);
        verdict = cls.ok ? (cls.data.verdict || "ABSTAIN") : "ABSTAIN";
        confidence = cls.ok ? (cls.data.confidence ?? 0.5) : 0.3;
        reasons = cls.ok ? (cls.data.reasons || []) : ["Local fallback"];
        spans = cls.ok ? (cls.data.spans || []) : [];
        flags = cls.ok ? (cls.data.flags || {}) : {};
        if (typeof imageFlags !== 'undefined' && imageFlags) { if (!flags || typeof flags !== 'object') flags = {}; flags.image = imageFlags; }
      }
    } else {
      // LOCAL MODE
      const session = await window.createPromptSession();
      const cls = await window.classifyWithStructuredOutput(session, claim);
      usedAPIs.prompt = true;
      verdict = cls.ok ? (cls.data.verdict || "ABSTAIN").toUpperCase() : "ABSTAIN";
      confidence = cls.ok ? (cls.data.confidence ?? 0.5) : 0.3;
      reasons = cls.ok ? (Array.isArray(cls.data.reasons) ? cls.data.reasons : ["No reasons"]) : ["Classification failed"];
      spans = cls.ok ? (Array.isArray(cls.data.spans) ? cls.data.spans : []) : [];
      flags = cls.ok ? (cls.data.flags || {}) : {};
        if (typeof imageFlags !== 'undefined' && imageFlags) { if (!flags || typeof flags !== 'object') flags = {}; flags.image = imageFlags; }
    }

    // Proofread
    setStatus("✍️ Proofreading…");
    let improved = null;
    const pr = await window.proofread(txt.slice(0, 500));
    if (pr && pr.ok) usedAPIs.proofreader = true;
    if (pr.ok && pr.text) improved = pr.text;
    // Translation disabled in this build (no-op)
    let translation = null;

    usedAPIs.writer = false; // Writer disabled in this build
    // Preserve any existing sources + preloaded evidence before struct build
const existingSources = (window.LAST?.structured?.proof?.sources) || [];
const preloadedSources = (window.__EVIDENCE_PRELOAD__) || [];
const __mergeSources = (arr)=>{
  const seen=new Set();
  return (arr||[]).filter(s=>s && s.url).filter(s=>{if(seen.has(s.url))return false; seen.add(s.url); return true;});
};
const uniqueSources = __mergeSources([...existingSources, ...preloadedSources]);

const structured = {
      summary: claim,
      claims: [{ text: claim, confidence, status: "checked" }],
      proof: {
        spans: spans.map((sp, i) => ({
          span_id: String(i),
          snippet: claim.slice(Math.max(0, sp.start), Math.min(claim.length, sp.end)),
          start: sp.start,
          end: sp.end
        
    ,sources: (uniqueSources && uniqueSources.length ? uniqueSources : (window.LAST?.structured?.proof?.sources||null))
  })),
        tau: confidence,
        confidence,
        abstain: verdict !== "OK",
        abstain_reason: verdict !== "OK" ? "low_confidence_or_context" : "ok",
        verdict,
        reasons,
        flags
      }
    };

    // Enrich proof.reasons with live Google News context if available
    await enrichProofWithNewsSummary(structured.proof);

    const structuredPatched = patchOutdatedReasons(structured);

    LAST = {

      mode: HYBRID_ON ? "hybrid" : "local",
      input_chars: txt.length,
      structured: structuredPatched,
      timestamp: new Date().toISOString(),
      improved,
      translation,
      apis: usedAPIs
    };

    setBadge(LAST);
    formatResults(LAST);
    document.getElementById("resultsRaw").textContent = JSON.stringify(LAST, null, 2);
// Trigger setter path and optional citation enforcement
    try { window.LAST = window.LAST || {}; window.LAST.structured = structuredPatched; } catch(e){}
    try { if (typeof __cs_enforce_citations === 'function') __cs_enforce_citations(structuredPatched); } catch(e){}
// Force a repaint shortly after async settles
setTimeout(()=>{ try{ window.__renderSourcesNow?.(); }catch(e){} try{ window.CS_setSources?.(window.LAST?.structured?.proof?.sources||[]);}catch(e){} }, 120);

    addToHistory(LAST);
    
    if (spans.length > 0) {
      document.getElementById("btnHighlight").style.display = "inline-flex";
    }

    setStatus(`✓ Verification complete — ${verdict} @ ${(confidence * 100).toFixed(0)}%`);
  } catch (e) {
    setStatus(`Error: ${e?.message || e}`);
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.classList.remove("loading");
  }
});

document.getElementById("btnHighlight").addEventListener("click", async () => {
  if (!LAST?.structured?.proof?.spans) {
    setStatus("No spans to highlight");
    return;
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, {
      type: "HIGHLIGHT",
      spans: LAST.structured.proof.spans
    });
    document.getElementById("btnClearHighlights").classList.remove("hidden");
    setStatus("✓ Highlights applied to page");
  } catch (e) {
    setStatus("Could not highlight (try reloading the page)");
  }
});

document.getElementById("btnClearHighlights").addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, { type: "CLEAR_HIGHLIGHTS" });
    document.getElementById("btnClearHighlights").classList.add("hidden");
    setStatus("✓ Highlights cleared");
  } catch (e) {
    setStatus("Could not clear highlights");
  }
});

document.getElementById("btnShare").addEventListener("click", () => {
  if (!LAST) {
    setStatus("Nothing to share yet");
    return;
  }
  const report = `ClaimShield Report
Verdict: ${LAST.structured.proof.verdict}
Confidence: ${(LAST.structured.proof.confidence * 100).toFixed(0)}%
Timestamp: ${LAST.timestamp}

Summary: ${LAST.structured.summary}

Reasons:
${LAST.structured.proof.reasons.join("\n")}

Generated by ClaimShield Nano - Private AI Fact Checker`;
  
  navigator.clipboard.writeText(report).then(() => {
    setStatus("✓ Report copied to clipboard!");
  }).catch(() => {
    setStatus("Could not copy to clipboard");
  });
});

// // Keyboard shortcuts

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === "V") {
    document.getElementById("btnVerify").click();
  }
});

// === Language Wiring (en/es/ja) ===
try {
  if (typeof globalThis !== 'undefined' && !('CLAIMSHIELD_LANG' in globalThis)) {
    globalThis.CLAIMSHIELD_LANG = 'en';
  }
  const langSelect = document.getElementById('translatorLang');
  if (langSelect) {
    // restore
    try {
      chrome.storage.local.get(['outputLang'], (d) => {
        const val = (d && d.outputLang) ? String(d.outputLang) : null;
        if (val) {
          globalThis.CLAIMSHIELD_LANG = val;
          langSelect.value = val;
        }
      });
    } catch (e) {}

    langSelect.addEventListener('change', (e) => {
      const v = String(e.target.value || 'en').trim();
      globalThis.CLAIMSHIELD_LANG = v;
      try { chrome.storage.local.set({ outputLang: v }); } catch (e) {}
    });
  }
} catch (e) { console.warn('Language wiring failed:', e); }

// === JSON Pretty + Copy ===
function showJson(obj) {
  try {
    const out = document.getElementById('jsonOutput');
    if (!out) return;
    const s = JSON.stringify(obj, null, 2);
    out.textContent = s;
    const btn = document.getElementById('btnCopyJson');
    if (btn) {
      btn.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(s); setStatus('JSON copied ✅'); }
        catch (e) { setStatus('Copy failed'); }
      });
    }
  } catch (e) { console.warn('showJson failed', e); }
}

// === UX polish: disable Verify until text present; spinner + elapsed ===
(function(){
  const verifyBtn = document.getElementById('btnVerify');
  const textArea = document.getElementById('selected');
  function gate() {
    if (verifyBtn && textArea) {
      verifyBtn.disabled = !textArea.value.trim();
    }
  }
  textArea?.addEventListener('input', gate);
  gate();

  // Wrap existing verify handler if present
  const _add = (el, type) => {
    if (!el) return { on: false };
    const listeners = [];
    const orig = el.addEventListener.bind(el);
    el.addEventListener = function(t, fn, opts){
      if (t === type) listeners.push(fn);
      return orig(t, fn, opts);
    };
    return { on: true, get: () => listeners };
  };
  // Capture verify listeners added earlier
  const trap = _add(verifyBtn, 'click');

  // After DOM loaded, re-bind with timer wrapper
  window.addEventListener('load', () => {
    try {
      const listeners = trap.get ? trap.get() : null;
      if (!listeners || listeners.length === 0) return;
      // Remove old handlers by cloning the node
      const parent = verifyBtn.parentNode;
      const clone = verifyBtn.cloneNode(true);
      parent.replaceChild(clone, verifyBtn);
      const statusEl = document.getElementById('status') || document.querySelector('.status') || null;

      listeners.forEach((fn) => {
        clone.addEventListener('click', async (e) => {
          const start = performance.now();
          const prev = statusEl ? statusEl.textContent : '';
          if (statusEl) statusEl.textContent = '⏳ Verifying…';
          try {
            const res = await fn.call(clone, e);
            const ms = Math.round(performance.now() - start);
            if (statusEl) statusEl.textContent = `✅ Done in ${ms} ms`;
            return res;
          } catch (err) {
            const ms = Math.round(performance.now() - start);
            if (statusEl) statusEl.textContent = `⚠️ Error after ${ms} ms: ${err?.message || err}`;
            throw err;
          }
        });
      });
    } catch (e) { /* no-op */ }
  });
})();

// Domain badges
function badgeForDomain(domain){
  domain = String(domain || '').toLowerCase();
  if (/(^|\.)who\.int$/.test(domain) || /(^(.*\.)?un\.org$)/.test(domain) || /(^|\.)oecd\.org$/.test(domain)) return {label:'IGO'};
  if (/\.gov$/.test(domain)) return {label:'GOV'};
  if (/(^|\.)pubmed\.ncbi\.nlm\.nih\.gov$/.test(domain)) return {label:'MED'};
  if (/(^|\.)doi\.org$/.test(domain)) return {label:'DOI'};
  if (/(^|\.)harvard\.edu$/.test(domain)) return {label:'EDU'};
  if (/(^|\.)en\.wikipedia\.org$/.test(domain)) return {label:'WIKI'};
  return null;
}
function makeBadge(label){
  const b = document.createElement('span');
  b.textContent = label;
  b.style.fontSize = '11px';
  b.style.padding = '2px 6px';
  b.style.border = '1px solid #d1d5db';
  b.style.borderRadius = '999px';
  b.style.marginLeft = '6px';
  b.style.background = '#f9fafb';
  b.style.color = '#111827';
  return b;
}

// Render evidence
function renderEvidenceResults(payload){
  const panel = document.getElementById('evidencePanel');
  const host = document.getElementById('evidenceResults');
  if (!panel || !host) return;
  host.innerHTML = "";
  const { results=[], sources=[] } = payload || {};
  results.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'card';
    row.style.padding = '8px';
    row.style.border = '1px solid #e5e7eb';
    row.style.borderRadius = '12px';

    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.justifyContent = 'space-between';
    head.style.alignItems = 'center';
    const v = document.createElement('strong');
    v.textContent = `${r.verdict} (${Math.round(r.confidence*100)}%)`;
    const claim = document.createElement('div');
    claim.textContent = r.claim;
    head.appendChild(claim);
    head.appendChild(v);

    const chips = document.createElement('div');
    chips.style.marginTop = '6px';
    r.citations?.forEach(n => {
      const s = sources[n-1];
      if (!s) return;
      const a = document.createElement('a');
      a.textContent = `[${n}] ${s.domain}`;
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.style.marginRight = '6px';
      chips.appendChild(a);
      const bd = badgeForDomain(s.domain);
      if (bd) chips.appendChild(makeBadge(bd.label));
    });

    const rat = document.createElement('div');
    rat.className = 'subtle';
    rat.textContent = r.rationale || "";

    row.appendChild(head);
    if (r.citations && r.citations.length) row.appendChild(chips);
    if (r.rationale) row.appendChild(rat);
    host.appendChild(row);
  });
  panel.style.display = results.length ? 'block' : 'none';
}

// Wire buttons
(() => {
  const btn = document.getElementById('btnEvidence');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const statusEl = document.getElementById('status') || document.querySelector('.status') || null;
    const text = (document.getElementById('selected')?.value || "").trim();
    if (!text) { if (statusEl) statusEl.textContent = 'Add some text first.'; return; }

    const t0 = performance.now();
    if (statusEl) statusEl.textContent = '🔎 Running Evidence Mode…';

    try {
      const payload = await evidenceRunPipeline(text);
      window.lastEvidencePayload = payload;
      renderEvidenceResults(payload);
      if (typeof showJson === 'function') showJson({ evidence_mode: true, ...payload });
      const ms = Math.round(performance.now() - t0);
      if (statusEl) statusEl.textContent = `✅ Evidence done in ${ms} ms`;
    } catch (e) {
      const ms = Math.round(performance.now() - t0);
      if (statusEl) statusEl.textContent = `⚠️ Evidence error after ${ms} ms: ${e?.message || e}`;
    }
  });

  const saveBtn = document.getElementById('btnSaveReportMd');
  if (saveBtn) saveBtn.addEventListener('click', () => {
    try {
      const text = (document.getElementById('selected')?.value || '').trim();
      const payload = window.lastEvidencePayload || null;
      const ts = new Date().toISOString();
      let md = `# ClaimShield Report\n\n- Timestamp: ${ts}\n- Mode: Local (Built-in AI)\n- Output language: ${globalThis.CLAIMSHIELD_LANG || 'en'}\n- Input length: ${text.length} chars\n\n`;
      md += `## Input\n\n> ${text.replace(/\n/g,'\n> ')}\n\n`;
      if (payload) {
        md += `## Evidence Mode Results\n\n`;
        payload.results.forEach((r, i) => {
          md += `### Claim ${i+1}\n`;
          md += `**Text:** ${r.claim}\n\n`;
          md += `**Verdict:** ${r.verdict} (${Math.round(r.confidence*100)}%)\n\n`;
          if (r.rationale) md += `**Rationale:** ${r.rationale}\n\n`;
          if (r.citations && r.citations.length) {
            md += `**Citations:**\n`;
            r.citations.forEach(n => {
              const s = (payload.sources || [])[n-1];
              if (s) md += `- [${n}] ${s.title} — ${s.domain} (${s.url})\n`;
            });
            md += `\n`;
          }
        });
      } else {
        md += `_(No evidence run in this session.)_\n`;
      }
      const blob = new Blob([md], {type:'text/markdown'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `claimshield_report_${ts.replace(/[:.]/g,'-')}.md`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 250);
    } catch(e) { console.warn('Save MD failed', e); }
  });
})();

document.getElementById("btnDiagnostics")?.addEventListener("click", async () => {
  const pre = document.getElementById("diagOut");
  pre.style.display = "block";
  pre.textContent = "Running...";
  const rep = await (window.runClaimShieldDiagnostics?.() || Promise.resolve({error:"diagnostics not available"}));
  pre.textContent = JSON.stringify(rep, null, 2);
});

// EVIDENCE_FALLBACK
const CONF_OK = 0.75;
async function runEvidenceFallbackIfNeeded(originalText, claim, primaryVerdict, primaryConfidence) {
  try {
    if (primaryVerdict === "ABSTAIN" || Number(primaryConfidence||0) < CONF_OK) {
      const ev = await (window.evidenceRunPipeline?.(originalText) || Promise.resolve(null));
      if (!ev || !ev.results || !ev.results.length) return { verdict: primaryVerdict, confidence: primaryConfidence, evidence: null };
      const usable = ev.results.filter(r => r && r.verdict && r.verdict !== "NO_EVIDENCE").sort((a,b)=> (b.confidence||0) - (a.confidence||0));
      if (usable.length) {
        const best = usable[0];
        let verdict = best.verdict || "NEEDS_REVIEW";
        let conf = Math.max(primaryConfidence||0, Math.min(0.9, Number(best.confidence||0.6)));
        return { verdict, confidence: conf, evidence: ev };
      }
      return { verdict: primaryVerdict, confidence: primaryConfidence, evidence: ev };
    }
    return { verdict: primaryVerdict, confidence: primaryConfidence, evidence: null };
  } catch (e) {
    return { verdict: primaryVerdict, confidence: primaryConfidence, evidence: null };
  }
}

/* === ClaimShield SOTA: Evidence-first, Zero-snippets UX, Hybrid key validator, Diagnostics === */
(function(){
  if (window.__CS_SOTA_PATCHED__) return; window.__CS_SOTA_PATCHED__ = true;
  function looksDescriptive(text){
    const t = String(text||"");
    const hasNumbers = /\d{4}|\b\d+%|\bpercent\b/i.test(t);
    const hasProgramish = /\b(program|course|series|learn|skills|outcomes|modules?|curriculum|students?)\b/i.test(t);
    const hasMarketish = /\b(demand|employment|hiring|job\s*market|growth|growing|rising)\b/i.test(t);
    return !hasNumbers && (hasProgramish || hasMarketish);
  }
  function __expandEvidenceQuery(q){
    if (/\b(data\s*scientist|data\s*science)\b/i.test(q)
     && /\b(demand|employment|job\s*market|hiring|growth|rising)\b/i.test(q)) {
      return "Data scientist employment job growth";
    }
    return String(q||"").slice(0,120);
  }
  async function preloadEvidenceIfHelpful(text){
    try{
      const q = __expandEvidenceQuery(String(text||"").slice(0,300));
      const fetchFn = (typeof window.enhancedEvidenceFetch === 'function')
        ? window.enhancedEvidenceFetch
        : window.evidenceFetchSnippets;
      if (typeof fetchFn !== 'function') return [];
      return await fetchFn(q, 3);
    }catch(_){ return []; }
  }
  function showZeroSnippetsTip(containerId, onRefine){
    try{
      const host = document.getElementById(containerId) || document.querySelector('#results') || document.body;
      if (!host) return;
      if (document.getElementById('cs-tip')) return;
      const wrap = document.createElement('div');
      wrap.id = 'cs-tip';
      wrap.style.cssText = 'margin:.5rem 0;padding:.5rem;border-radius:6px;background:#fff7d1;border:1px solid #f2e7a0;font-size:.9rem;';
      wrap.innerHTML = '<div style="margin-bottom:.4rem;">Tip: Try adding a proper noun or time window (e.g., <b>2019–2024</b>) or select text from a source page.</div>' +
                       '<button id="cs-refine" style="cursor:pointer;border:1px solid #bbb;border-radius:16px;padding:.25rem .6rem;background:#fafafa;">Refine query (employment)</button>';
      host.appendChild(wrap);
      wrap.querySelector('#cs-refine')?.addEventListener('click', () => onRefine?.('employment job growth'));
    }catch(_){}
  }
  function showToast(msg, kind){
    try{
      let el = document.getElementById('cs-toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'cs-toast';
        el.style.cssText = 'position:fixed; right:12px; bottom:12px; padding:.5rem .75rem; border-radius:8px; color:#111; background:#e7ffe7; border:1px solid #b6e7b6; z-index:9999; font-size:.9rem;';
        document.body.appendChild(el);
      }
      if (kind==='warn'){ el.style.background='#fff3d6'; el.style.borderColor='#f2d08c'; }
      else { el.style.background='#e7ffe7'; el.style.borderColor='#b6e7b6'; }
      el.textContent = msg;
      clearTimeout(el.__hide);
      el.__hide = setTimeout(()=>{ try{ el.remove(); }catch(_){} }, 2200);
    }catch(_){}
  }
  async function validateGeminiKeyMaybeToast(apiKey){
    try{
      const ok = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(apiKey), { method:'GET' }).then(r => r.ok);
      showToast(ok ? 'Gemini key accepted' : 'Invalid Gemini key', ok ? 'ok' : 'warn');
      return ok;
    }catch(_){ showToast('Network error validating key','warn'); return false; }
  }
  window.addEventListener('DOMContentLoaded', () => {
    try{
      const ta = document.getElementById('selected') || document.querySelector('textarea');
      if (ta && !ta.__cs_preload_bound) {
        ta.__cs_preload_bound = true;
        const doPreload = async () => {
          const txt = String(ta.value||'').trim();
          if (looksDescriptive(txt)) {
            window.__EVIDENCE_PRELOAD__ = await preloadEvidenceIfHelpful(txt);
          } else {
            window.__EVIDENCE_PRELOAD__ = [];
          }
        };
        ta.addEventListener('input', () => { doPreload(); });
        doPreload();
      }
    }catch(_){}
  });
  try{
    const mergeHelper = function(obj){
      try{
        if (!obj) return obj;
        if ((!obj.sources || !obj.sources.length) && Array.isArray(window.__EVIDENCE_PRELOAD__) && window.__EVIDENCE_PRELOAD__.length){
          obj.sources = window.__EVIDENCE_PRELOAD__;
        }
        return obj;
      }catch(_){ return obj; }
    };
    if (typeof window.setResultsJSON === 'function' && !window.__orig_setResultsJSON2){
      const orig = window.setResultsJSON;
      window.__orig_setResultsJSON2 = orig;
      window.setResultsJSON = function(o){
        try{ o = mergeHelper(o); }catch(_){}
        const r = orig(o);
        try{
          if (Array.isArray(o?.sources) && o.sources.length === 0) {
            showZeroSnippetsTip('results', async (anchor) => {
              const ta = document.getElementById('selected') || document.querySelector('textarea');
              const base = (ta?.value || '').trim();
              const refined = (base + ' ' + anchor).slice(0, 320);
              const fn = (typeof window.evidenceRunPipeline === 'function') ? window.evidenceRunPipeline
                       : (_ => Promise.resolve({claims:[], results:[], sources:[]}));
              const ev2 = await fn(refined);
              if (typeof window.renderEvidenceResults === 'function') window.renderEvidenceResults(ev2);
            });
          }
        }catch(_){}
        return r;
      };
    }
    if (typeof window.renderEvidenceResults === 'function' && !window.__orig_renderEvidenceResults2){
      const orig2 = window.renderEvidenceResults;
      window.__orig_renderEvidenceResults2 = orig2;
      window.renderEvidenceResults = function(payload){
        try{ payload = mergeHelper(payload); }catch(_){}
        const r = orig2(payload);
        try{
          const src = Array.isArray(payload?.sources) ? payload.sources : [];
          if (src.length === 0) {
            showZeroSnippetsTip('results', async (anchor) => {
              const ta = document.getElementById('selected') || document.querySelector('textarea');
              const base = (ta?.value || '').trim();
              const refined = (base + ' ' + anchor).slice(0, 320);
              const fn = (typeof window.evidenceRunPipeline === 'function') ? window.evidenceRunPipeline
                       : (_ => Promise.resolve({claims:[], results:[], sources:[]}));
              const ev2 = await fn(refined);
              orig2(ev2);
            });
          }
        }catch(_){}
        return r;
      };
    }
  }catch(_){}
  window.addEventListener('DOMContentLoaded', () => {
    try{
      const toggle = document.getElementById('hybridToggle') || document.querySelector('[data-setting="hybrid"]');
      const keyEl = document.getElementById('geminiKey') || document.querySelector('input[name="geminiKey"]');
      if (toggle && !toggle.__cs_hybrid_bound) {
        toggle.__cs_hybrid_bound = true;
        toggle.addEventListener('change', async (e) => {
          const on = !!e.target.checked;
          if (on && keyEl) {
            const key = String(keyEl.value||'').trim();
            if (!key){ showToast('Please enter an API key','warn'); e.target.checked = false; return; }
            const ok = await validateGeminiKeyMaybeToast(key);
            if (!ok) e.target.checked = false;
          }
        });
      }
    }catch(_){}
  });
  window.addEventListener('DOMContentLoaded', () => {
    try{
      const btn = document.getElementById('btnDiagnostics');
      const out = document.getElementById('diagOut');
      if (!btn || btn.__cs_diag_bound) return;
      btn.__cs_diag_bound = true;
      async function checkPromptAPI(){
        try{
          const lm = (globalThis.ai && ai.languageModel) || (globalThis.chrome?.ai?.languageModel);
          if (!lm) return { available:false, reason:'no languageModel' };
          const a = await (lm.availability?.() ?? lm.capabilities?.());
          return { available:true, detail:String(a) };
        }catch(e){ return { available:false, reason:String(e) }; }
      }
      async function checkSummarizer(){
        try{ if (!('Summarizer' in window)) return { available:false, reason:'Summarizer not in window' }; return { available:true }; }
        catch(e){ return { available:false, reason:String(e) }; }
      }
      async function checkWikipedia(){
        try{
          const r = await fetch('https://en.wikipedia.org/wiki/api.php?action=query&list=search&srsearch=Diagnostic&format=json&origin=*', { method:'GET' });
          return { reachable:r.ok, status:r.status };
        }catch(e){ return { reachable:false, error:String(e) }; }
      }
      function checkEvidenceBound(){ return { bound: (typeof window.evidenceRunPipeline === 'function') }; }
      btn.addEventListener('click', async () => {
        if (!out) return;
        const diag = {
          promptAPI: await checkPromptAPI(),
          summarizer: await checkSummarizer(),
          wikipedia: await checkWikipedia(),
          evidencePipeline: checkEvidenceBound()
        };
        out.style.display = 'block';
        out.textContent = JSON.stringify(diag, null, 2);
      });
    }catch(_){}
  });
})();
/* === End SOTA patch block === */

// ---- Evidence UI integration (robust, idempotent, with diagnostics) ----
(function(){
  try {
    // Ensure diagnostics object exists
    window.__DIAG = window.__DIAG || {};
    window.__DIAG.evidencePipeline = window.__DIAG.evidencePipeline || { bound: false, found: false };

    function findEvidenceButton(){
      return document.getElementById('btnEvidence')
          || document.querySelector('[data-action="evidence"]')
          || document.querySelector('#evidence, .btn-evidence, button[name="evidence"]');
    }

    async function attach(){
      try {
        const btn = findEvidenceButton();
        if (!btn) { window.__DIAG.evidencePipeline.found = false; return false; }
        if (btn.__evidenceBound) { window.__DIAG.evidencePipeline.bound = true; window.__DIAG.evidencePipeline.found = true; return true; }
        btn.__evidenceBound = true;
        window.__DIAG.evidencePipeline.bound = true;
        window.__DIAG.evidencePipeline.found = true;
        window.__DIAG.evidencePipeline.attachedAt = Date.now();

        btn.addEventListener('click', async () => {
          try {
            const ta = document.getElementById('selected') || document.querySelector('textarea');
            const text = (ta?.value || '').trim().slice(0, 600);

            const runEvidence = (typeof window.evidenceRunPipeline === 'function')
              ? window.evidenceRunPipeline
              : (_ => Promise.resolve({ claims:[], results:[], sources:[], note: "shim: pipeline not found" }));

            const payload = await runEvidence(text);

            if (typeof window.renderEvidenceResults === 'function') {
              window.renderEvidenceResults(payload);
            } else {
              const out = document.getElementById('results') || document.body;
              const pre = document.createElement('pre');
              pre.textContent = JSON.stringify(payload, null, 2);
              out.innerHTML = ""; out.appendChild(pre);
            }
          } catch (e) {
            console.error("Evidence click failed:", e);
            window.__DIAG.lastEvidenceError = String(e && e.message || e);
          }
        });
        return true;
      } catch(e){
        window.__DIAG.lastBinderError = String(e && e.message || e);
        return false;
      }
    }

    // Expose manual binder
    window.__bindEvidence = attach;

    // Try now, then retry until bound or timeout
    let attempts = 0, maxAttempts = 25; // ~5s at 200ms
    const t = setInterval(async () => {
      attempts++;
      const ok = await attach();
      if (ok || attempts >= maxAttempts) clearInterval(t);
    }, 200);

    // Also run on DOMContentLoaded for good measure
    document.addEventListener('DOMContentLoaded', attach, { once: false });

  } catch (e) {
    console.warn("Evidence binder (robust) init failed:", e);
  }
})();

// ---- Minimal robust Evidence binder (idempotent) ----
(function(){
  try {
    const sel = ['#btnEvidence','[data-action="evidence"]','#evidence','.btn-evidence','button[name="evidence"]'];
    function findBtn(){ return document.querySelector(sel.join(',')); }
    async function attach(){
      const btn = findBtn();
      if (!btn || btn.__evidenceBound) return !!btn;
      btn.__evidenceBound = true;
      btn.addEventListener('click', async () => {
        const ta = document.getElementById('selected') || document.querySelector('textarea');
        const text = (ta?.value || '').trim() || await getSelectionSafe();
        const run = (typeof window.evidenceRunPipeline === 'function')
          ? window.evidenceRunPipeline
          : (_ => Promise.resolve({ claims:[], results:[], sources:[], note:"shim" }));
        const payload = await run(text.slice(0, 600));
        if (typeof window.renderEvidenceResults === 'function') {
          window.renderEvidenceResults(payload);
        } else {
          const out = document.getElementById('results') || document.body;
          const pre = document.createElement('pre');
          pre.textContent = JSON.stringify(payload, null, 2);
          out.innerHTML = ""; out.appendChild(pre);
        }
      });
      return true;
    }
    let tries = 0, t = setInterval(async () => {
      tries++;
      if (await attach() || tries >= 25) clearInterval(t);
    }, 200);
    document.addEventListener('DOMContentLoaded', attach);
  } catch(e) { console.warn("Evidence binder failed:", e); }
})();

// === Hybrid toggle & helpers (popup.js) ===
async function hybridEnabled() {
  try {
    const { HYBRID_ON, GEMINI_API_KEY } = await chrome.storage.local.get(["HYBRID_ON", "GEMINI_API_KEY"]);
    return !!(HYBRID_ON && GEMINI_API_KEY);
  } catch { return false; }
}

async function callGeminiViaBackground(jsonBody) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "HYBRID_REQUEST", body: jsonBody }, (res) => resolve(res));
  });
}

(function(){
  const el = document.getElementById("toggleHybrid");
  if (!el) return;
  chrome.storage.local.get(["HYBRID_ON"], ({ HYBRID_ON }) => { el.checked = !!HYBRID_ON; });
  el.addEventListener("change", async (e) => { await chrome.storage.local.set({ HYBRID_ON: !!e.target.checked }); });
})();


// ---- Prefill from LAST_SELECTION (context menu) ----
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const { LAST_SELECTION } = await chrome.storage.local.get("LAST_SELECTION");
    const ta = document.getElementById('selected') || document.querySelector('textarea');
    if (LAST_SELECTION && ta && !ta.value.trim()) {
      ta.value = LAST_SELECTION;
    }
  } catch(e){ console.warn("Prefill LAST_SELECTION failed", e); }
});

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


// === ClaimShield: UI helpers (spans + share markdown) ===
function escapeHtml(str){ return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function renderProofSpans(proof){
  try{
    const box = document.getElementById('proof-spans');
    const spans = (proof && proof.spans) ? proof.spans : [];
    if (!box) return;
    if (!spans.length){ box.classList && box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList && box.classList.remove('hidden');
    box.innerHTML = spans.map(s => `<div class="span"><code>[${s.start}-${s.end}]</code> ${escapeHtml(s.snippet)}</div>`).join('');
  }catch(e){ /* ignore in prod */ }
}
function buildReportMarkdown(result, opts = {}){
  const title = opts.title || 'ClaimShield Nano — Verification Report';
  const verdict = result?.verdict ?? '—';
  const confidence = (result?.confidence != null) ? `${Math.round(result.confidence*100)}%` : '—';
  const engine = opts.engine || result?.engine || 'Local';
  const delta = (opts.delta != null) ? `${Math.round(opts.delta*100)}%` : (result?.delta != null ? `${Math.round(result.delta*100)}%` : '—');
  const sources = Array.isArray(result?.sources) ? result.sources : [];
  const sourcesMd = sources.length ? sources.map(s => {
    try{
      const host = (new URL(s.url)).hostname;
      return `- [${host}](${s.url}) — ${s.snippet ?? ''}`;
    }catch{ return `- ${s.url ?? ''} — ${s.snippet ?? ''}`; }
  }).join('\n') : '_No sources_';
  return [
    `# ${title}`,
    ``,
    `**Verdict:** ${verdict}  `,
    `**Confidence:** ${confidence}  `,
    `**Engine:** ${engine}  `,
    `**Δ (Hybrid − Local):** ${delta}`,
    ``,
    `## Summary`,
    result?.structured?.summary || '_(none)_',
    ``,
    `## Sources`,
    sourcesMd,
    ``,
    `---`,
    `_Generated by ClaimShield Nano (MV3; Built-in AI + Hybrid optional)_`
  ].join('\n');
}
(function attachShareHandler(){
  const shareBtn = document.getElementById('shareBtn');
  if (!shareBtn) return;
  shareBtn.addEventListener('click', async () => {
    try{
      const state = (window.getLatestResult && window.getLatestResult()) || window.__lastResult || {};
      const md = buildReportMarkdown(state, { engine: state.engine, delta: state.delta });
      await navigator.clipboard.writeText(md);
      (window.toast && window.toast('Report copied to clipboard.')) || console.info('Report copied to clipboard.');
    }catch(e){ console.error('Share failed', e); }
  });
})();

// === R6 INLINE CITES: add [S#] markers to reasons text ===
(function(){
  if (!window.__cs_r6_inline){
    function unique(arr){ const s=new Set(); (arr||[]).forEach(x=>s.add(x)); return Array.from(s).sort((a,b)=>a-b); }
    function citeList(ids){ return unique(ids).map(i=>`[S${i}]`).join(''); }

    // From a grounded reply, derive per-reason citation ids
    function annotateReasons(reasons, supports, sources){
      try{
        const srcCount = Array.isArray(sources)? sources.length : 0;
        if (!Array.isArray(reasons) || reasons.length===0) return reasons||[];

        // If we have supports, collect chunk indices from all supports
        let cited = [];
        if (Array.isArray(supports) && supports.length){
          for (const sp of supports){
            const idxs = Array.isArray(sp.groundingChunkIndices) ? sp.groundingChunkIndices : [];
            for (const i of idxs) if (Number.isInteger(i)) cited.push(i+1);
          }
        }

        // Map each reason to a consistent marker set
        const tag = (cited.length ? citeList(cited) : (srcCount ? citeList([...Array(srcCount)].map((_,i)=>i+1)) : ""));
        return reasons.map(r => tag ? `${r} ${tag}` : r);
      }catch(_){ return reasons||[]; }
    }

    // Patch the grounded hybrid JSON builder path if present; otherwise wrap renderJSON.
    const grounded = window.classifyWithGeminiGrounded_R5B || window.classifyWithGeminiGrounded;
    if (typeof grounded === 'function' && typeof window.hybridVerifyWithEvidence === 'function'){
      const orig = window.hybridVerifyWithEvidence;
      window.hybridVerifyWithEvidence = async function(text, apiKey){
        const rep = await grounded(String(text||''), apiKey);
        const sources = (rep && rep._grounding && Array.isArray(rep._grounding.sources)) ? rep._grounding.sources : [];
        const supports = (rep && rep._grounding && Array.isArray(rep._grounding.supports)) ? rep._grounding.supports : (rep && rep._grounding && rep._grounding.supports) || [];
        if (Array.isArray(rep.reasons)) rep.reasons = annotateReasons(rep.reasons, supports, sources);
        return orig.apply(this, arguments);
      };
    } else if (typeof window.renderJSON === 'function'){
      const _rj = window.renderJSON;
      window.renderJSON = function(payload){
        try{
          if (payload && payload.mode==="hybrid"){
            const s = payload.structured||{};
            const proof = s.proof||{};
            const srcs = proof.sources||[];
            const hp = window._lastHybridProof||{};
            const supports = (hp && hp.supports) || [];
            if (Array.isArray(proof.reasons)){
              payload.structured.proof.reasons = (function(reasons, supports, sources){
                return annotateReasons(reasons, supports, sources);
              })(proof.reasons, supports, srcs);
            }
          }
        }catch(_){}
        return _rj.apply(this, arguments);
      };
    }
    window.__cs_r6_inline = true;
  }
})();

// === R6E: INLINE CITES + ALWAYS-CITED FALLBACK + RED BANNER ===
(function(){
  if (window.__cs_r6e) return;
  window.__cs_r6e = true;

  function showBanner(msg){
    try{
      const id = "cs-grounding-banner";
      if (document.getElementById(id)) return;
      const b = document.createElement('div');
      b.id = id;
      b.textContent = msg || "Grounded citations unavailable — using offline Evidence sources.";
      b.style.cssText = "position:sticky;top:0;z-index:9999;background:#b00020;color:#fff;padding:8px 10px;margin-bottom:8px;border-radius:6px;font-size:12px;font-weight:600;letter-spacing:.2px;";
      const host = document.querySelector(".popup") || document.body;
      host.prepend(b);
    }catch(_){}
  }

  function unique(arr){ const s=new Set(); (arr||[]).forEach(x=>s.add(x)); return Array.from(s).sort((a,b)=>a-b); }
  function citeList(ids){ return unique(ids).map(i=>`[S${i}]`).join(''); }
  function annotateReasons(reasons, supports, sources){
    try{
      const srcCount = Array.isArray(sources)? sources.length : 0;
      if (!Array.isArray(reasons) || reasons.length===0) return reasons||[];
      let cited = [];
      if (Array.isArray(supports) && supports.length){
        for (const sp of supports){
          const idxs = Array.isArray(sp.groundingChunkIndices) ? sp.groundingChunkIndices : [];
          for (const i of idxs) if (Number.isInteger(i)) cited.push(i+1);
        }
      }
      const tag = (cited.length ? citeList(cited) : (srcCount ? citeList([...Array(srcCount)].map((_,i)=>i+1)) : ""));
      return reasons.map(r => tag ? `${r} ${tag}` : r);
    }catch(_){ return reasons||[]; }
  }

  async function offlineEvidenceSources(text, k){
    try{
      if (typeof window.evidenceFetchSnippets === "function"){
        const sn = await window.evidenceFetchSnippets(String(text||""), k||4);
        return Array.isArray(sn) ? sn.map((s,i)=>({ id:i+1, title:s.title||s.url||"source", url:s.url||"", snippet:s.snippet||"" })) : [];
      }
    }catch(_){}
    return [];
  }

  // Wrap the hybrid verify to enforce sources + inline cites + banner
  const _origHybrid = window.hybridVerifyWithEvidence;
  if (typeof _origHybrid === "function"){
    window.hybridVerifyWithEvidence = async function(text, apiKey){
      // Run original (which may already include R6 inline annotate path)
      let structured = await _origHybrid.apply(this, arguments);
      try{
        const s = structured && structured.proof ? structured.proof : {};
        let sources = Array.isArray(s.sources) ? s.sources : [];
        // If no grounded/evidence sources, force offline Evidence and show banner
        if (!sources.length){
          showBanner();
          const off = await offlineEvidenceSources(text, 4);
          if (off && off.length){
            sources = off;
            structured.proof = structured.proof || {};
            structured.proof.sources = sources;
            // ensure claim citations
            if (Array.isArray(structured.claims)){
              structured.claims = structured.claims.map(c =>
                (Array.isArray(c.citations) && c.citations.length) ? c :
                ({...c, citations: sources.map((_,i)=>i+1)})
              );
            }
            // annotate reasons with [S#] if missing
            if (Array.isArray(structured.proof.reasons)){
              structured.proof.reasons = annotateReasons(structured.proof.reasons, [], sources);
            }
          }
        }
        // Persist globally for share/export
        try{
          window._lastHybridProof = {
            verdict: structured.proof?.verdict,
            confidence: structured.proof?.confidence,
            sources: structured.proof?.sources || [],
            supports: [],
            ts: Date.now()
          };
          window.dispatchEvent(new CustomEvent("cs:hybrid-proof",{detail: window._lastHybridProof}));
        }catch(_){}
      }catch(_){}
      return structured;
    };
  }

  // Also guard renderJSON to avoid later overwrites that drop sources
  if (typeof window.renderJSON === "function"){
    const _rj = window.renderJSON;
    window.renderJSON = function(payload){
      try{
        if (payload && payload.mode==="hybrid"){
          const s = payload.structured = payload.structured || {};
          const p = s.proof = s.proof || { spans:[], flags:{} };
          let sources = Array.isArray(p.sources) ? p.sources : [];
          if (!sources.length){
            showBanner();
            // populate from last proof if exists
            const hp = window._lastHybridProof || {};
            if (Array.isArray(hp.sources) && hp.sources.length){
              p.sources = hp.sources;
              if (Array.isArray(s.claims)){
                s.claims = s.claims.map(c => (Array.isArray(c.citations)&&c.citations.length) ? c : ({...c, citations: hp.sources.map((_,i)=>i+1)}));
              }
              // annotate reasons
              if (Array.isArray(p.reasons)){
                p.reasons = annotateReasons(p.reasons, hp.supports||[], hp.sources||[]);
              }
            }
          }
        }
      }catch(_){}
      return _rj.apply(this, arguments);
    };
  }
})();


// --- H6 Message Bus: receive structured from SW/content and render ---
try{
  chrome.runtime && chrome.runtime.onMessage && chrome.runtime.onMessage.addListener((msg) => {
    try{
      if (msg && msg.type === "CS_RESULT" && msg.structured) {
        window.LAST = window.LAST || {};
        window.LAST.structured = msg.structured;
        if (typeof ensurePopupCitations === "function") ensurePopupCitations();
        if (typeof window.__renderSourcesNow === "function") window.__renderSourcesNow();
      }
    } catch(e){ console.warn("Popup CS_RESULT handler failed:", e); }
  });
}catch(e){ /* ignore */ }
// --- End H6 Message Bus ---

// --- H6safe Sources renderer REMOVED in Rev3.4d (handled by sources_display_fix.js) ---



// === ClaimShield v9.6 Dubai UI patch: span sources → UI list ===
(function(){
  // Create or reuse the sources container in the popup
  function csEnsureSourcesBox() {
    let box =
      document.querySelector('#sources-list, .sources-list, .cs-sources') ||
      document.getElementById('sources');

    if (!box) {
      const results = document.getElementById('results') || document.body;
      box = document.createElement('div');
      box.id = 'sources-list';
      box.className = 'cs-sources';
      results.appendChild(box);
    }
    return box;
  }

  // Render proof.sources as clickable links
  function csRenderSourcesFromProof(proof) {
    try {
      const box = csEnsureSourcesBox();
      const items = (proof && Array.isArray(proof.sources)) ? proof.sources : [];

      // Normalize and filter
      const cleaned = items
        .filter(s => s && typeof s.url === 'string')
        .map(s => ({
          title: s.title || s.domain || s.url,
          url: s.url,
          snippet: s.snippet || ''
        }));

      box.innerHTML = '';

      if (!cleaned.length) {
        // nothing to show, let internal fallback stay
        return;
      }

      const ol = document.createElement('ol');
      cleaned.forEach(s => {
        const li = document.createElement('li');

        const a = document.createElement('a');
        a.href = s.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = s.title;
        li.appendChild(a);

        if (s.snippet) {
          const sn = document.createElement('div');
          sn.className = 'cs-source-snippet';
          sn.textContent = s.snippet;
          li.appendChild(sn);
        }

        ol.appendChild(li);
      });

      box.appendChild(ol);

      // Hide the internal fallback source card when real links exist
      const internal = document.querySelector('.cs-internal-fallback');
      if (internal) internal.style.display = 'none';

    } catch (e) {
      console.warn('[ClaimShield] csRenderSourcesFromProof failed', e);
    }
  }

  // Flatten span-level sources → top-level proof.sources
  function csFlattenSpanSources(proof) {
    try {
      if (!proof || !Array.isArray(proof.spans)) return [];
      const acc = [];

      // include any existing top-level sources first
      if (Array.isArray(proof.sources)) {
        proof.sources.forEach(src => {
          if (!src || typeof src.url !== 'string') return;
          if (acc.find(x => x.url === src.url)) return;
          acc.push({
            title: src.title || src.domain || src.url,
            url: src.url,
            snippet: src.snippet || ''
          });
        });
      }

      // merge span-level sources
      proof.spans.forEach(span => {
        if (!span || !Array.isArray(span.sources)) return;
        span.sources.forEach(src => {
          if (!src || typeof src.url !== 'string') return;
          const url = src.url;
          if (!/^https?:\/\//i.test(url)) return;
          if (acc.find(x => x.url === url)) return;
          acc.push({
            title: src.title || src.domain || url,
            url,
            snippet: src.snippet || ''
          });
        });
      });

      return acc;
    } catch (e) {
      console.warn('[ClaimShield] csFlattenSpanSources failed', e);
      return [];
    }
  }

  // Wrap CS_setJSON so every structured update:
  // 1) flattens span sources
  // 2) renders them in the UI
  const prevSetJSON_v96 = window.CS_setJSON;
  window.CS_setJSON = function(structured) {
    try {
      if (typeof prevSetJSON_v96 === 'function') {
        prevSetJSON_v96(structured);
      }
    } catch (e) {
      console.warn('[ClaimShield] prev CS_setJSON (v96) threw', e);
    }

    try {
      const proof = structured && structured.proof;
      if (proof) {
        const flat = csFlattenSpanSources(proof);
        if (flat.length) {
          proof.sources = flat;
        }
      }
      csRenderSourcesFromProof(proof);
    } catch (e) {
      console.warn('[ClaimShield] v9.6 CS_setJSON hook failed', e);
    }
  };

  // Keep manual showSources() trigger working
  window.showSources = window.showSources || function () {
    try {
      const proof = window.LAST && window.LAST.structured && window.LAST.structured.proof;
      csRenderSourcesFromProof(proof);
    } catch (e) {
      console.warn('[ClaimShield] showSources() failed', e);
    }
  };
})();


// === Multimodal helpers (popup) ===

async function csGetPageContextFromActiveTab() {
  return new Promise((resolve) => {
    try {
      if (!chrome.tabs || !chrome.tabs.query) {
        return resolve({ ok: false, error: 'Tabs API not available' });
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs && tabs[0];
        if (!tab || !tab.id) {
          return resolve({ ok: false, error: 'No active tab' });
        }

        try {
          chrome.tabs.sendMessage(
            tab.id,
            { type: 'CS_GET_PAGE_CONTEXT' },
            (resp) => {
              if (chrome.runtime.lastError) {
                console.warn('[ClaimShield] CS_GET_PAGE_CONTEXT error:', chrome.runtime.lastError.message);
                return resolve({ ok: false, error: chrome.runtime.lastError.message });
              }
              resolve(resp || { ok: false, error: 'No response' });
            }
          );
        } catch (e) {
          console.warn('[ClaimShield] Failed to send CS_GET_PAGE_CONTEXT message:', e);
          resolve({ ok: false, error: String(e) });
        }
      });
    } catch (e) {
      console.warn('[ClaimShield] Tabs query failed:', e);
      resolve({ ok: false, error: String(e) });
    }
  });
}

async function csBuildInputWithImage(rawText) {
  const baseText = (rawText || '').trim();
  let imageInfo = null;
  let flags = { image: null };

  try {
    const ctxResp = await csGetPageContextFromActiveTab();
    if (ctxResp && ctxResp.ok && ctxResp.context) {
      imageInfo = ctxResp.context.imageInfo || null;
    }
  } catch (e) {
    console.warn('[ClaimShield] Failed to retrieve page image context:', e);
  }

  if (imageInfo && window.CS_ImagePipeline && typeof window.CS_ImagePipeline.buildTextWithImage === 'function') {
    try {
      const res = await window.CS_ImagePipeline.buildTextWithImage(imageInfo, baseText);
      return {
        text: (res && res.text) || baseText,
        imageFlags: (res && res.flags && res.flags.image) || null
      };
    } catch (e) {
      console.warn('[ClaimShield] buildTextWithImage failed, falling back to base text:', e);
    }
  }

  return {
    text: baseText,
    imageFlags: imageInfo
      ? {
          present: true,
          src: imageInfo.src || '',
          width: Number(imageInfo.width || 0) || 0,
          height: Number(imageInfo.height || 0) || 0,
          hasAlt: !!(imageInfo.alt && imageInfo.alt.trim()),
          altLength: (imageInfo.alt || '').trim().length,
          ocrEnabled: false,
          ocrAttempted: false,
          ocrSuccess: false,
          ocrChars: 0,
          ocrMode: 'none'
        }
      : null
  };
}
