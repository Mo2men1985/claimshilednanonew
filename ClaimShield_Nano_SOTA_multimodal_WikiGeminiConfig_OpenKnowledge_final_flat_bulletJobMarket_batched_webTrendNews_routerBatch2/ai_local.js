
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


// === H6 Core Enforcer: __cs_enforce_citations ===
async function __cs_enforce_citations(structured) {
  structured = structured || {};
  structured.proof = structured.proof || {};
  let has = Array.isArray(structured.proof.sources) && structured.proof.sources.length > 0;

  // Prefer parsed grounding (if any)
  if (!has && window._lastHybridProof && Array.isArray(window._lastHybridProof.sources) && window._lastHybridProof.sources.length) {
    structured.proof.sources = window._lastHybridProof.sources;
    has = true;
  }

  // Evidence retriever (accepts both array and {sources:[]} shapes)
  if (!has) {
    const ef = (typeof evidenceFetchSnippets === 'function') ? evidenceFetchSnippets
             : (window.evidenceFetchSnippets ? window.evidenceFetchSnippets : null);
    if (ef) {
      try {
        const fb = await ef(structured);
        const fbSources = Array.isArray(fb) ? fb
                          : (fb && Array.isArray(fb.sources) ? fb.sources : []);
        if (fbSources && fbSources.length) {
          structured.proof.sources = fbSources;
          (structured.claims || []).forEach((c,i)=>{
            if (!Array.isArray(c.citations) || !c.citations.length) {
              const cit = fb && fb.citations && fb.citations[i];
              c.citations = Array.isArray(cit) && cit.length ? cit : [1];
            }
          });
          has = true;
        }
      } catch (e) { console.warn("Evidence fallback failed:", e); }
    }
  }

  // Last resort: local page fallback
  if (!has) {
    const src = {
      id: 1,
      title: (typeof document!=="undefined" && document.title) ? document.title : "Current Page",
      url: (typeof location!=="undefined" && location.href) ? location.href : "",
      snippet: (typeof window!=="undefined" && window.getSelection) 
              ? String(window.getSelection()) 
              : (structured.summary || "").slice(0,240)
    };
    structured.proof.sources = [src];
    (structured.claims || []).forEach(c => {
      if (!Array.isArray(c.citations) || !c.citations.length) c.citations = [1];
    });
  }
  return structured;
}
// === End H6 Core Enforcer ===

const PROD = true;
const log = (..._args) => {};

// === Safe Translator wrapper (handles NotSupported) ===
(function(){
  try{
    if (!self.__TranslatorSafe) {
      const ORIG = self.Translator && self.Translator.create;
      async function TranslatorSafeCreate(opts){
        if (!self.Translator || !ORIG) throw new Error("Translation API not available");
        try {
          return await ORIG.call(self.Translator, opts||{});
        } catch (e) {
          const msg = String(e&&e.message||e||"");
          if (msg.includes("NotSupportedError") || msg.includes("Unable to create translator")) {
            return { translate: async (t)=>String(t||""), destroy: ()=>{}, __mock:true };
          }
          throw e;
        }
      }
      if (self.Translator) { self.Translator.create = TranslatorSafeCreate; }
      self.__TranslatorSafe = true;
    }
  }catch{}
})();

// ClaimShield AI Local Processing - COMPLETE FIXED VERSION

const MAX_RETRIES = 3;
const TIMEOUT_MS = 60000;
// Shared language default (single global)
if (typeof globalThis !== 'undefined' && !('CLAIMSHIELD_LANG' in globalThis)) { globalThis.CLAIMSHIELD_LANG = 'en'; }
function OUTPUT_LANG(){ try { return (globalThis && globalThis.CLAIMSHIELD_LANG) || 'en'; } catch(_) { return 'en'; } }

// ============ Edge Case Detection Helpers ============
function detectUrls(text) {
  const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|(\w+\.(com|org|edu|gov|net)[^\s]*)/gi;
  return (text.match(urlRegex) || []).length > 0;
}

function detectCitations(text) {
  const patterns = [
    /doi:\s*10\.\d{4,}/i,
    /arxiv:\s*\d{4}\.\d{4,}/i,
    /isbn[:\s]*[\d-]+/i,
    /et\s+al\./i,
    /\(\s*\d{4}\s*\)/,
    /\[\d+\]/
  ];
  return patterns.some(p => p.test(text));
}

function detectMultiLanguage(text) {
  const patterns = [
    /[\u0600-\u06FF]/,  // Arabic
    /[\u4E00-\u9FFF]/,  // Chinese
    /[\u0900-\u097F]/,  // Hindi
    /[\u0400-\u04FF]/   // Cyrillic
  ];
  return patterns.some(p => p.test(text));
}

// ============ Claim Router → Evidence Mode Helper ============
function csComputeRoutingPolicy(routerDecision) {
  const d = routerDecision || {};
  const label = (d.topLabel || d.label || 'other_or_ambiguous');
  const score = (typeof d.topScore === 'number') ? d.topScore
               : (typeof d.score === 'number') ? d.score
               : 0;
  const isTemporal = !!d.isTemporal;

  let evidenceMode = 'wiki-first';
  let abstainLean = 'normal';
  let verdictHint = 'NEEDS_REVIEW';

  // Very low-confidence router → fall back to simple temporal heuristic
  if (!label || score < 0.4) {
    return {
      evidenceMode: isTemporal ? 'web-first' : 'wiki-first',
      abstainLean: isTemporal ? 'cautious' : 'normal',
      verdictHint,
      routerCategory: label || 'other_or_ambiguous',
      routerConfidence: score,
      routerIsTemporal: isTemporal
    };
  }

  const trendOrNews =
    /job_market_or_employment|financial_markets_or_economy|politics_or_elections_or_policy|breaking_news_or_recent_event/.test(label);

  if (trendOrNews && (isTemporal || score >= 0.55)) {
    // Job market, finance, politics, or breaking news → we strongly prefer live web
    evidenceMode = 'web-first';
    abstainLean = 'cautious';
  } else if (/public_health_or_medicine/.test(label)) {
    // Health claims: mix offline + web, but stay cautious
    evidenceMode = isTemporal ? 'web-first' : 'mixed';
    abstainLean = 'cautious';
  } else if (/evergreen_fact_or_definition|technology_or_science/.test(label)) {
    // Timeless or technical facts: Wikipedia / offline are usually enough
    evidenceMode = 'wiki-first';
    abstainLean = isTemporal ? 'cautious' : 'normal';
  } else {
    // Fallback: respect temporal signal
    evidenceMode = isTemporal ? 'web-first' : 'wiki-first';
    abstainLean = isTemporal ? 'cautious' : 'normal';
  }

  return {
    evidenceMode,
    abstainLean,
    verdictHint,
    routerCategory: label,
    routerConfidence: score,
    routerIsTemporal: isTemporal
  };
}

function chunkText(text, maxChars = 800) {
  if (text.length <= maxChars) return [text];
  
  const chunks = [];
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = "";
  
  for (const para of paragraphs) {
    if ((currentChunk + para).length > maxChars && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = para;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + para;
    }
  }
  
  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks;
}

// --- Robust JSON extractor for LLM outputs ---
function __extractJSONFuzzy(text) {
  if (!text) return null;
  // Plain JSON
  try { return JSON.parse(text); } catch {}
  // ```json ... ``` or ``` ... ```
  const m = text.match(/```json\s*([\s\S]*?)\s*```/i) || text.match(/```\s*([\s\S]*?)\s*```/i);
  if (m) {
    const inner = m[1].trim();
    try { return JSON.parse(inner); } catch {}
    let fixed = inner.replace(/'(.*?)'/g, '"$1"').replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(fixed); } catch {}
  }
  // Slice between first { and last }
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s !== -1 && e !== -1 && e > s) {
    const slice = text.slice(s, e+1);
    try { return JSON.parse(slice); } catch {}
  }
  return null;
}

// ============ Core API Functions ============

/**
 * Ensure the on‑device language model is downloaded and ready.  This helper
 * checks for both the legacy `LanguageModel` API and the newer
 * `ai.languageModel` API exposed via `chrome.ai`.  It attempts to
 * download the model if necessary and reports progress via the optional
 * callback.  If no supported API is available, it throws.
 */
async function ensureLanguageModelReady(onProgress) {
  // Determine which language model interface is available.  We prefer the
  // newer ai.languageModel API exposed on chrome.ai, but fall back to
  // the legacy global LanguageModel if present.
  const lm = (globalThis.ai && ai.languageModel) ||
             (globalThis.chrome && chrome.ai && chrome.ai.languageModel) ||
             (typeof LanguageModel !== 'undefined' ? LanguageModel : undefined);
  if (!lm) {
    throw new Error("Prompt API not available");
  }

  // Try the availability API.  Some implementations return a string
  // ('readily', 'ready', etc.) while others return an object with a
  // status/available property.  Treat any truthy/"ready" value as ready.
  try {
    if (typeof lm.availability === 'function') {
      const avail = await lm.availability();
      if (avail === 'readily' || avail === 'ready') {
        return { ready: true };
      }
    }
  } catch (_) {}

  // Newer versions expose a capabilities() method.  It may return a
  // string or an object.  Interpret common values.
  try {
    if (typeof lm.capabilities === 'function') {
      const caps = await lm.capabilities();
      const status = typeof caps === 'string' ? caps : (caps?.status || caps?.available);
      if (status === 'readily' || status === 'ready' || status === 'yes' || status === true) {
        return { ready: true };
      }
    }
  } catch (_) {}

  // If the API supports createDownload(), initiate a download with
  // progress events.  Some experimental builds expose this helper.
  if (typeof lm.createDownload === 'function') {
    try {
      const dl = await lm.createDownload();
      dl.addEventListener?.('progress', (ev) => onProgress?.(ev));
      await dl.whenReady;
      return { ready: true };
    } catch (_) {
      // Fall through to the warm‑up below.
    }
  }

  // As a last resort, create and immediately destroy a session.  This
  // triggers a download on platforms that do not expose createDownload().
  const session = await (lm.create?.({ outputLanguage: (typeof OUTPUT_LANG_MODEL==="function"?OUTPUT_LANG_MODEL():OUTPUT_LANG()) }) ||
                         (typeof LanguageModel !== 'undefined' ? LanguageModel.create?.({ outputLanguage: (typeof OUTPUT_LANG_MODEL==="function"?OUTPUT_LANG_MODEL():OUTPUT_LANG()) }) : undefined));
  await session?.destroy?.();
  return { ready: true };
}

/**
 * Create a new prompt session using whichever language model API is
 * available.  It respects the global output language via OUTPUT_LANG().
 * A timeout is enforced to avoid hanging if a download stalls.
 */
async function createPromptSession() {
  // Determine the language model interface as in ensureLanguageModelReady().
  const lm = (globalThis.ai && ai.languageModel) ||
             (globalThis.chrome && chrome.ai && chrome.ai.languageModel) ||
             (typeof LanguageModel !== 'undefined' ? LanguageModel : undefined);
  if (!lm) {
    throw new Error("Prompt API not available");
  }

  await ensureLanguageModelReady();

  const sessionPromise = lm.create?.({ outputLanguage: (typeof OUTPUT_LANG_MODEL==="function"?OUTPUT_LANG_MODEL():OUTPUT_LANG()) }) ||
                         (typeof LanguageModel !== 'undefined' ? LanguageModel.create?.({ outputLanguage: (typeof OUTPUT_LANG_MODEL==="function"?OUTPUT_LANG_MODEL():OUTPUT_LANG()) }) : undefined);
  return await Promise.race([
    sessionPromise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Model download timeout")), TIMEOUT_MS)
    )
  ]);
}

async function summarize(text, maxChunk = 4000) {
  try {
    if (!('Summarizer' in self)) {
      return { ok: false, error: "Summarizer API not available" };
    }
    
    const chunks = [];
    for (let i = 0; i < text.length; i += maxChunk) {
      chunks.push(text.slice(i, i + maxChunk));
    }
    
    const summarizeOnce = async (t) => {
      const s = await Summarizer.create({ outputLanguage: (typeof OUTPUT_LANG_MODEL==="function"?OUTPUT_LANG_MODEL():OUTPUT_LANG()), 
        type: "key-points",
        format: "plain-text",
        length: "short",
        monitor(m) { 
          m.addEventListener?.('downloadprogress', () => {}); 
        }
      });
      const out = await s.summarize(t);
      await s.destroy?.();
      return String(out || "");
    };
    
    const parts = [];
    for (const c of chunks) {
      parts.push(await summarizeOnce(c));
    }
    
    if (parts.length === 1) {
      return { ok: true, summary: parts[0] };
    }
    
    const combined = parts.join("\n");
    const final = await summarizeOnce(combined);
    return { ok: true, summary: final };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function classifyWithStructuredOutput(session, claim) {
  // Guard against a null or invalid session. When the built‑in language model
  // is unavailable (soft‑vetoed by LangGuard), session may be null. In that
  // case route to evidence‑only mode and return a safe ABSTAIN payload.
  if (!session || typeof session.prompt !== 'function') {
    console.warn('[ClaimShield] Session unavailable, routing to evidence mode');
    try {
      // Attempt to inform the UI about the fallback. These helpers may
      // be undefined in some contexts, so wrap in try/catch.
      if (typeof window !== 'undefined') {
        window.__cs_routeNoBuiltInLM?.();
        window.__cs_setBanner?.('Built‑in AI unavailable – using Evidence mode');
      }
    } catch (_err) {
      // Silently ignore; fallback will still be returned below.
    }
    return {
      ok: false,
      error: 'Model unavailable',
      data: {
        verdict: 'ABSTAIN',
        confidence: 0.3,
        reasons: ['Local AI model unavailable – switched to evidence‑only mode'],
        spans: [],
        flags: {}
      }
    };
  }

  const hasUrls = detectUrls(claim);
  const hasCitations = detectCitations(claim);
  const hasMultiLang = detectMultiLanguage(claim);

  const prompt = `You are a fact-checking AI. Analyze this claim and return ONLY valid JSON (no markdown, no code blocks):

Claim: "${claim}"

Return JSON with this exact structure:
{
  "verdict": "OK" | "NEEDS_REVIEW" | "ABSTAIN",
  "confidence": 0.0-1.0,
  "reasons": ["reason1", "reason2"],
  "spans": [{"start": 0, "end": 10}],
  "flags": {"hasUrls": boolean, "hasCitations": boolean}
}

Rules:
- OK: claim has strong evidence markers (URLs, citations, specific data)
- NEEDS_REVIEW: claim lacks evidence or uses absolute language
- ABSTAIN: insufficient context to evaluate
- spans: mark suspicious phrases (vague claims, absolute statements)
- Be strict: most claims should be NEEDS_REVIEW unless they have clear evidence`;

  try {
    const response = await session.prompt(prompt);
    const cleaned = String(response).replace(/```json\n?|```\n?/g, "").trim();
    const obj = JSON.parse(cleaned);

    // Only boost confidence if initial is low
    if (obj.confidence < 0.6) {
      let shaped = obj.confidence;
      if (hasUrls) shaped += 0.15;
      if (hasCitations) shaped += 0.10;
      if (hasMultiLang) shaped += 0.05;
      obj.confidence = Math.min(0.95, shaped);
    }

    obj.flags = obj.flags || {};
    obj.flags.hasUrls = hasUrls;
    obj.flags.hasCitations = hasCitations;
    obj.flags.hasMultiLang = hasMultiLang;

    return { ok: true, data: obj };
  } catch (err) {
    console.error("Classification error:", err);
    return {
      ok: false,
      error: err.message,
      data: {
        verdict: "ABSTAIN",
        confidence: 0.3,
        reasons: ["Classification failed"],
        spans: [],
        flags: { hasUrls, hasCitations, hasMultiLang }
      }
    };
  }
}

async function classifyWithGemini(claim, apiKey) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

  const claimText = String(claim ?? "").trim();
  const now = new Date();
  const TODAY_ISO = now.toISOString().slice(0, 10);
  const TRAINING_CUTOFF = "2024-06-30"; // approximate knowledge window for the underlying model

  // Detect if the claim looks temporal / recent
  let temporal = false;
  try {
    if (typeof window !== "undefined" && typeof window.csLooksTemporal === "function") {
      temporal = window.csLooksTemporal(claimText);
    } else {
      temporal = /\b20(2[3-9]|3[0-9])\b/.test(claimText) ||
                 /(today|yesterday|tomorrow|recently|lately|this year|this month|this week|this quarter)/i.test(claimText);
    }
  } catch (e) {
    console.warn("[ClaimShield] classifyWithGemini temporal detection failed", e);
  }

    // ---- Router decision + routing policy (Hybrid evidence mode) ----
  let routerDecision = null;
  let routingPolicy = null;
  try {
    if (typeof window !== "undefined" && typeof window.csRouteClaim === "function") {
      routerDecision = await window.csRouteClaim(claimText);
      routingPolicy = csComputeRoutingPolicy(routerDecision);
      if (typeof window !== "undefined") {
        try {
          window._csLastRoutingPolicy = routingPolicy;
          window.csClaimRouterLast = routerDecision || window.csClaimRouterLast;
        } catch (_e) {}
      }
    }
  } catch (e) {
    console.warn("[ClaimShield] classifyWithGemini router invocation failed", e);
  }
  if (!routingPolicy) {
    routingPolicy = {
      evidenceMode: temporal ? "web-first" : "wiki-first",
      abstainLean: temporal ? "cautious" : "normal",
      verdictHint: "NEEDS_REVIEW",
      routerCategory: (routerDecision && (routerDecision.topLabel || routerDecision.label)) || "other_or_ambiguous",
      routerConfidence: (routerDecision && typeof routerDecision.topScore === "number") ? routerDecision.topScore : 0,
      routerIsTemporal: !!temporal
    };
  }

  // If router or heuristics say this is temporal, keep temporal=true
  try {
    if (routerDecision && typeof routerDecision.isTemporal === "boolean" && routerDecision.isTemporal) {
      temporal = true;
    }
  } catch (_e) {}

  // Pull evidence according to routing policy (Wiki vs Web)
  let sources = [];
  try {
    const canUseWiki =
      typeof window !== "undefined" &&
      typeof window.evidenceFetchSnippets === "function";
    const canUseWeb =
      typeof window !== "undefined" &&
      typeof window.csFetchWebSearch === "function";

    if (routingPolicy.evidenceMode === "web-first" && canUseWeb) {
      try {
        const webSources = await window.csFetchWebSearch(claimText, 6);
        if (Array.isArray(webSources) && webSources.length) {
          sources = sources.concat(webSources);
        }
      } catch (e) {
        console.warn("[ClaimShield] csFetchWebSearch (web-first) failed", e);
      }
      if (canUseWiki) {
        try {
          const wikiSources = await window.evidenceFetchSnippets(claimText, 3);
          if (Array.isArray(wikiSources) && wikiSources.length) {
            sources = sources.concat(wikiSources);
          }
        } catch (e) {
          console.warn("[ClaimShield] evidenceFetchSnippets (web-first fallback) failed", e);
        }
      }
    } else if (routingPolicy.evidenceMode === "mixed") {
      if (canUseWiki) {
        try {
          const wikiSources = await window.evidenceFetchSnippets(claimText, 3);
          if (Array.isArray(wikiSources) && wikiSources.length) {
            sources = sources.concat(wikiSources);
          }
        } catch (e) {
          console.warn("[ClaimShield] evidenceFetchSnippets (mixed) failed", e);
        }
      }
      if (canUseWeb) {
        try {
          const webSources = await window.csFetchWebSearch(claimText, 4);
          if (Array.isArray(webSources) && webSources.length) {
            sources = sources.concat(webSources);
          }
        } catch (e) {
          console.warn("[ClaimShield] csFetchWebSearch (mixed) failed", e);
        }
      }
    } else {
      // Default: wiki-first / offline-first
      if (canUseWiki) {
        try {
          const wikiSources = await window.evidenceFetchSnippets(claimText, 3);
          if (Array.isArray(wikiSources) && wikiSources.length) {
            sources = sources.concat(wikiSources);
          }
        } catch (e) {
          console.warn("[ClaimShield] evidenceFetchSnippets (wiki-first) failed", e);
        }
      }
      // Optionally, for temporal claims, try web as a backstop if wiki is empty
      if ((!sources || !sources.length) && canUseWeb && temporal) {
        try {
          const webSources = await window.csFetchWebSearch(claimText, 4);
          if (Array.isArray(webSources) && webSources.length) {
            sources = sources.concat(webSources);
          }
        } catch (e) {
          console.warn("[ClaimShield] csFetchWebSearch (wiki-first backstop) failed", e);
        }
      }
    }
  } catch (e) {
    console.warn("[ClaimShield] classifyWithGemini evidence fetch failed", e);
  }

  let sourcesText;
  if (sources && sources.length) {
    sourcesText = sources
      .map((s, i) => {
        const title = s.title || "Untitled source";
        const domain = s.domain || "unknown-domain";
        const snippet = (s.snippet || "").replace(/\s+/g, " ").trim();
        const url = s.url || "";
        return `Source ${i + 1} (${domain} – ${title}): ${snippet}${url ? " [" + url + "]" : ""}`;
      })
      .join("\n\n");
  } else {
    sourcesText = "No external evidence could be retrieved for this claim from Wikipedia. Do NOT guess: if the claim depends on events after your knowledge cutoff, you MUST abstain and mark it as NEEDS_REVIEW.";
  }

  const systemInstruction = `
You are ClaimShield Nano's hybrid fact-checking model.

Today's date is ${TODAY_ISO}.
Your general world knowledge comes from a model trained only on information available up to around ${TRAINING_CUTOFF}.
You MUST treat any claim about events after that training window as potentially unknown.

Rules:
1. If the claim is clearly about events after your training window AND the evidence block below does not contain strong, specific support, you MUST abstain and mark the claim as "NEEDS_REVIEW". In that case:
   - verdict = "NEEDS_REVIEW"
   - confidence should reflect your uncertainty (for example 0.6–0.85, but never above 0.9)
   - flags.outdated_model = true
   - flags.future_event = true
   - The FIRST item in "reasons" MUST start with: "⏳ Time-window notice: " followed by a short explanation.
2. If the claim is about recent events BUT the evidence clearly supports it, you may say "OK" but still mention any temporal uncertainty.
3. If the claim is not temporal, analyze it normally but never invent facts beyond the evidence.
4. ALWAYS base your reasoning on the EVIDENCE block when it is present.
5. When in doubt, prefer "NEEDS_REVIEW" (do not hallucinate).

Return ONLY valid JSON with the exact fields: verdict, confidence, reasons, spans, flags.
If you are missing information, prefer NEEDS_REVIEW over guessing.
`.trim();

  const userPrompt = `
CLAIM:
"${claimText}"

EVIDENCE:
${sourcesText}
`.trim();

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: systemInstruction + "\n\n" + userPrompt }
        ]
      }
    ]
  };

  // Enable Google Search grounding so Gemini can fetch live web evidence
  // ONLY when the claim looks temporal / post‑cutoff.
  if (temporal) {
    body.tools = [
      {
        google_search: {}
      }
    ];
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  // Extract grounded web sources (if any) from Gemini's response
  let geminiSources = [];
  try {
    const gm = data && data.candidates && data.candidates[0] && data.candidates[0].groundingMetadata;
    const chunks = (gm && Array.isArray(gm.groundingChunks)) ? gm.groundingChunks : [];
    for (let i = 0; i < chunks.length; i++) {
      const ch = chunks[i];
      if (!ch || !ch.web) continue;
      const w = ch.web;
      const rawUrl = w.uri || w.url || "";
      if (!rawUrl) continue;
      let url = rawUrl;
      try {
        url = new URL(rawUrl).toString();
      } catch (_) {
        // keep rawUrl if URL parsing fails
      }
      let domain = "";
      try {
        domain = new URL(url).hostname;
      } catch (_) {
        domain = "";
      }
      const snippet = (w.snippet || w.description || "").toString().replace(/\s+/g, " ").trim();
      const title = (w.title || w.site || "Search Result").toString().trim();
      geminiSources.push({
        id: geminiSources.length + 1,
        title,
        url,
        domain,
        snippet
      });
    }
  } catch (e) {
    console.warn("[ClaimShield] Failed to parse Gemini groundingMetadata", e);
  }

  // Merge Gemini-grounded sources with Wikipedia / local evidence
  let mergedSources = [];
  const seenSourceKeys = new Set();
  function __cs_addSourceForHybrid(src) {
    if (!src) return;
    const t = (src.title || "").toString();
    const u = (src.url || "").toString();
    const d = (src.domain || "").toString();
    const s = (src.snippet || "").toString();
    if (!t && !u) return;
    const key = t + "|" + u;
    if (seenSourceKeys.has(key)) return;
    seenSourceKeys.add(key);
    let domain = d;
    if (!domain && u) {
      try { domain = new URL(u).hostname; } catch (_) { /* ignore */ }
    }
    mergedSources.push({
      id: mergedSources.length + 1,
      title: t || "Source",
      url: u,
      domain: domain || "unknown",
      snippet: s
    });
  }

  if (Array.isArray(geminiSources) && geminiSources.length) {
    geminiSources.forEach(__cs_addSourceForHybrid);
  }
  if (Array.isArray(sources) && sources.length) {
    sources.forEach(__cs_addSourceForHybrid);
  }

  if (mergedSources.length) {
    try {
      if (typeof window !== "undefined") {
        window._lastHybridProof = window._lastHybridProof || {};
        window._lastHybridProof.sources = mergedSources;
      }
    } catch (e) {
      console.warn("[ClaimShield] Failed to store _lastHybridProof.sources", e);
    }
    // Also let the rest of this function see the combined evidence
    sources = mergedSources;
  }

  const parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  const firstTextPart = (parts.find(p => typeof p.text === "string") || {}).text || "{}";

  // Clean common Markdown / JSON fencing
  const cleaned = String(firstTextPart)
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();

  let obj;
  try {
    obj = JSON.parse(cleaned);
  } catch (e) {
    // Fallback: try to extract the first JSON-like block
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      obj = JSON.parse(m[0]);
    } else {
      throw e;
    }
  }

  if (!obj || typeof obj !== "object") {
    throw new Error("Invalid JSON from Gemini");
  }

  obj.verdict = (obj.verdict || "ABSTAIN").toString().toUpperCase();
  if (typeof obj.confidence !== "number") obj.confidence = 0.5;
  if (!Array.isArray(obj.reasons)) obj.reasons = ["No reasons provided"];
  if (!Array.isArray(obj.spans)) obj.spans = [];
  obj.flags = obj.flags && typeof obj.flags === "object" ? obj.flags : {};

  // Attach router metadata when available (for risk guard + UI)
  try {
    if (routingPolicy && typeof routingPolicy === "object") {
      obj.flags.routerCategory = routingPolicy.routerCategory;
      obj.flags.routerConfidence = routingPolicy.routerConfidence;
      obj.flags.routerIsTemporal = routingPolicy.routerIsTemporal;
      obj.flags.routerEvidenceMode = routingPolicy.evidenceMode;
      obj.flags.routerAbstainLean = routingPolicy.abstainLean;
    }
  } catch (_e) {}

  // Enforce temporal flags + time-window notice when we know this is a future/temporal claim with weak evidence
  if (temporal && (!sources || !sources.length)) {
    obj.flags.future_event = true;
    obj.flags.outdated_model = true;
    const notice = "⏳ Time-window notice: The claim appears to depend on events after the model's training cutoff, and no strong external evidence was found. Treat this as NEEDS_REVIEW rather than a confirmed fact.";
    if (obj.reasons.length === 0) {
      obj.reasons.push(notice);
    } else if (!obj.reasons[0].startsWith("⏳ Time-window notice:")) {
      obj.reasons.unshift(notice);
    }
    if (!obj.verdict || obj.verdict === "OK") {
      obj.verdict = "NEEDS_REVIEW";
    }
    if (obj.confidence > 0.9) {
      obj.confidence = 0.85;
    }
  }

  return obj;
}async function proofread(text) {
  // Try Proofreader first
  try {
    if ('Proofreader' in self) {
      const s = await Proofreader.create();
      const r = await s.proofread(text);
      await s.destroy?.();
      return { ok: true, text: r?.text ?? r ?? "" };
    }
  } catch (_) { /* fall through */ }

  // Fallback: Rewriter
  try {
    if ('Rewriter' in self) {
      const rw = await Rewriter.create({ outputLanguage: (typeof OUTPUT_LANG_MODEL==="function"?OUTPUT_LANG_MODEL():OUTPUT_LANG()),  tone: "more-formal", length: "as-is" });
      const out = await rw.rewrite(text);
      await rw.destroy?.();
      return { ok: true, text: out ?? "" };
    }
  } catch (e) {
    return { ok: false, error: String(e) };
  }
  
  return { ok: false, error: "Neither Proofreader nor Rewriter available" };
}

async function translate(text, targetLang) {
  try {
    if (!('Translator' in self)) {
      return { ok: false, error: "Translation API not available" };
    }
    
    const tr = await Translator.create({ 
      sourceLanguage: "en", 
      targetLanguage: (targetLang || OUTPUT_LANG()) 
    });
    const out = await tr.translate(text);
    await tr.destroy?.();
    return { ok: true, text: String(out) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function writerDraft(text, opts = {}) {
  // Try Writer API first
  try {
    if ('Writer' in self) {
      const w = await Writer.create({ outputLanguage: (typeof OUTPUT_LANG_MODEL==="function"?OUTPUT_LANG_MODEL():OUTPUT_LANG()),  
        style: "neutral", 
        tone: "objective", 
        ...opts 
      });
      const out = await w.write(text);
      await w.destroy?.();
      return { ok: true, text: String(out) };
    }
  } catch (_) { /* fall through */ }

  // Fallback to Rewriter
  try {
    if ('Rewriter' in self) {
      const rw = await Rewriter.create({ outputLanguage: (typeof OUTPUT_LANG_MODEL==="function"?OUTPUT_LANG_MODEL():OUTPUT_LANG()),  tone: "neutral", length: "as-is" });
      const out = await rw.rewrite(text);
      await rw.destroy?.();
      return { ok: true, text: String(out ?? "") };
    }
  } catch (e) {
    return { ok: false, error: String(e) };
  }
  
  return { ok: false, error: "Writer/Rewriter not available" };
}

async function checkVisionSupport() {
  try {
    const lm = (globalThis.ai && ai.languageModel) || 
                (globalThis.chrome && chrome.ai && chrome.ai.languageModel);
    if (!lm) return { ok: true, image: false };
    
    const caps = await (lm.capabilities?.() ?? lm.availability?.());
    const mods = (caps && (caps.modalities || caps.modes || caps.supported || [])) || [];
    const str = typeof caps === "string" ? caps : JSON.stringify(caps || {});
    
    // FIXED: Changed 'or' to '||'
    const hasImage = (Array.isArray(mods) && mods.includes("image")) || 
                     ("image" in (caps || {})) || 
                     /image/i.test(str);
    
    return { ok: true, image: !!hasImage };
  } catch (_) {
    return { ok: true, image: false };
  }
}

async function analyzeImageInput(input, userNote = "") {
  const support = await checkVisionSupport();
  if (!support.image) {
    return { 
      ok: false, 
      error: "On-device image analysis not available in this build (stub only)." 
    };
  }

  try {
    const session = await createPromptSession();
    const textHint = [
      "You are a cautious on-device assistant.",
      "Given an image and an optional note, return a short list of visible text or objects,",
      "and any potential claims to verify. JSON only: {objects:[], text:[], candidate_claims:[]}",
      userNote ? `NOTE: ${userNote}` : ""
    ].join("\n");

    // Stub response for builds without full multimodal support
    const fake = { 
      objects: ["(stub)"], 
      text: ["(stub)"], 
      candidate_claims: ["(stub)"] 
    };
    await session?.destroy?.();
    return { ok: true, data: fake, stub: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ============ Export to Window ============
if (typeof window !== "undefined") {
  window.ensureLanguageModelReady = ensureLanguageModelReady;
  window.createPromptSession = createPromptSession;
  window.summarize = summarize;
  window.classifyWithStructuredOutput = classifyWithStructuredOutput;
  window.classifyWithGemini = classifyWithGemini;
  window.proofread = proofread;
  window.translate = translate;
  window.writerDraft = writerDraft;
  window.checkVisionSupport = checkVisionSupport;
  window.analyzeImageInput = analyzeImageInput;
}
// ==== ESM exports (for `import { ... } from "./ai_local.js"`) ====

// Evidence Mode (trusted‑lite) scaffold
// NOTE: we reuse the OUTPUT_LANG() defined near the top of this module.  Do not
// redeclare it here; this avoids multiple definitions and ensures the
// user‑selected language is respected.

async function evidenceExtractClaims(text, maxClaims = 3) {
  try {
    const s = await Summarizer.create({ type: "key-points", format: "plain-text", length: "short", outputLanguage: (typeof OUTPUT_LANG_MODEL==="function"?OUTPUT_LANG_MODEL():OUTPUT_LANG()) });
    const prompt = `Extract up to ${maxClaims} short, atomic claims from the following text. Each claim <= 140 characters. Return as a numbered list.\n\nTEXT:\n` + text.slice(0, 4000);
    const out = await s.summarize(prompt);
    const lines = String(out?.summary || out || "").split(/\n+/).map(x=>x.replace(/^[-*\d\.\)\s]+/,'').trim()).filter(Boolean);
    return lines.slice(0, maxClaims);
  } catch { return String(text).split(/[\.!?]+/).map(x=>x.trim()).filter(Boolean).slice(0, maxClaims).map(s => s.slice(0, 140)); }
}

async function __expandEvidenceQuery(text){
  try {
    if (/\b(data\s*scientist|data\s*science)\b/i.test(text) &&
        /\b(demand|employment|job\s*market|hiring|growth|rising)\b/i.test(text)) {
      return "Data scientist employment job growth";
    }
    return String(text||"").slice(0, 120);
  } catch { return String(text||"").slice(0, 120); }
}

// FIXED VERSION - Added async keyword
async function evidenceFetchSnippets(claim, limit = 3) {
  const base = "https://en.wikipedia.org";
  const q = encodeURIComponent(claim.slice(0, 120));
  const out = [];
  
  try {
    const searchUrl = `${base}/w/api.php?action=query&list=search&srsearch=${q}&format=json&origin=*`;
    const res = await fetch(searchUrl);
    const js = await res.json().catch(() => ({}));
    const hits = (js?.query?.search || []).slice(0, 2);
    
    for (const h of hits) {
      const title = h.title;
      let sum = {};
      
      try { 
        sum = await fetch(`${base}/w/rest.php/v1/page/summary/${encodeURIComponent(title)}`)
          .then(r => r.json()); 
      } catch {}
      
      const url = (sum?.content_urls?.desktop?.page) || `${base}/wiki/${encodeURIComponent(title)}`;
      const raw = (sum?.extract || (h.snippet || "").replace(/<[^>]+>/g, ""));
      const snippet = String(raw).split(". ").slice(0, 2).join(". ").slice(0, 300);
      
      out.push({ 
        id: out.length + 1, 
        url, 
        domain: "en.wikipedia.org", 
        title, 
        snippet 
      });
    }
    
    // Fallback if no results
    if (out.length === 0) {
      try {
        const res2 = await fetch(`${base}/w/rest.php/v1/search/title?q=${q}`);
        const js2 = await res2.json().catch(() => ({}));
        const pages = (js2?.pages || []).slice(0, 2);
        
        for (const p of pages) {
          let sum2 = {};
          try { 
            sum2 = await fetch(`${base}/w/rest.php/v1/page/summary/${encodeURIComponent(p.title)}`)
              .then(r => r.json()); 
          } catch {}
          
          const url2 = (sum2?.content_urls?.desktop?.page) || `${base}/wiki/${encodeURIComponent(p.title)}`;
          const snippet2 = (sum2?.extract || "").split(". ").slice(0, 2).join(". ").slice(0, 300);
          
          out.push({ 
            id: out.length + 1, 
            url: url2, 
            domain: "en.wikipedia.org", 
            title: sum2?.title || p.title, 
            snippet: snippet2 
          });
        }
      } catch {}
    }
  } catch (e) { 
    console.warn("evidenceFetchSnippets error:", e); 
  }
  
  return out.slice(0, limit);
}

async function evidenceCompareClaim(claim, snippets) {
  const session = await LanguageModel.create({ outputLanguage: (typeof OUTPUT_LANG_MODEL==="function"?OUTPUT_LANG_MODEL():OUTPUT_LANG()) });
  const snips = snippets.map((s,i)=>`[${i+1}] ${s.domain} — ${s.title}
"${s.snippet}"`).join('\n\n');
  const prompt = `You are verifying a claim using only the SHORT snippets given.
Claim: "${claim}"
Snippets:
${snips}

Return STRICT JSON: { "verdict":"OK|NO_EVIDENCE|NEEDS_REVIEW", "confidence":0..1, "citations":[1,2], "rationale":"<=40 words"}`;
  const out = await session.prompt(prompt);
  await session.destroy?.();
  const txt = out?.text ?? out;
  let obj = __extractJSONFuzzy(String(txt||""));
  if (!obj) {
    if (snippets && snippets.length) return { verdict:"NEEDS_REVIEW", confidence:0.55, citations:[1], rationale:"Parser failed; provisional evidence." };
    return { verdict:"NO_EVIDENCE", confidence:0.3, citations:[], rationale:"Parser error" };
  }
  let verdict = String(obj.verdict||"").toUpperCase();
  if (!["OK","NO_EVIDENCE","NEEDS_REVIEW"].includes(verdict)) verdict = "NEEDS_REVIEW";
  let confidence = Math.max(0, Math.min(1, Number(obj.confidence||0.6)));
  let citations = Array.isArray(obj.citations) ? obj.citations.filter(n=>Number.isFinite(n)).map(n=>Number(n)) : [];
  let rationale = String(obj.rationale||"");
  return { verdict, confidence, citations, rationale };
}

async function evidenceRunPipeline(text) {
  const claims = await evidenceExtractClaims(text, 3);
  const results = [];
  const sourcesIndex = {};
  for (const claim of claims) {
    const snippets = await evidenceFetchSnippets(claim, 3);
    const cmp = (snippets.length ? await evidenceCompareClaim(claim, snippets)
                                 : { verdict:"NO_EVIDENCE", confidence:0.3, citations:[], rationale:"No snippets" });
    results.push({ claim, verdict: cmp.verdict, confidence: cmp.confidence, citations: cmp.citations, rationale: cmp.rationale });
    snippets.forEach((s)=>{ const key = s.url; if(!(key in sourcesIndex)) sourcesIndex[key] = { id: Object.keys(sourcesIndex).length+1, ...s }; });
  }
  const sources = Object.values(sourcesIndex);
  return { claims, results, sources };
}

(() => {
  try {
    const api = { evidenceExtractClaims, evidenceFetchSnippets, evidenceCompareClaim, evidenceRunPipeline };
    if (typeof globalThis !== "undefined") Object.assign(globalThis, api);
    if (typeof window !== "undefined") Object.assign(window, api);
    if (typeof self !== "undefined") Object.assign(self, api);
  } catch {}
})();

async function translateOrSelf(q, targetLang){
  try{
    if(!('Translator' in self)) return { ok:true, text:q };
    const tr = await Translator.create({ sourceLanguage: "auto", targetLanguage: (targetLang || (globalThis && globalThis.CLAIMSHIELD_LANG) || "en") });
    const out = await tr.translate(q);
    await tr.destroy?.();
    return { ok:true, text: String(out||q) };
  }catch(e){
    return { ok:true, text:q };
  }
}

/* ROBUST_EXPORTS_V2 */
(function(){
  try{
    const api = {
      ensureLanguageModelReady, createPromptSession, summarize, classifyWithStructuredOutput,
      classifyWithGemini, proofread, translate, writerDraft, checkVisionSupport, analyzeImageInput,
      evidenceExtractClaims, evidenceFetchSnippets, evidenceCompareClaim, evidenceRunPipeline
    };
    if (typeof window !== "undefined") for (const [k,v] of Object.entries(api)) { if (typeof window[k] !== "function") window[k] = v; }
    if (typeof globalThis !== "undefined") for (const [k,v] of Object.entries(api)) { if (typeof globalThis[k] !== "function") globalThis[k] = v; }
    if (typeof self !== "undefined") for (const [k,v] of Object.entries(api)) { if (typeof self[k] !== "function") self[k] = v; }
  }catch(e){}
})();

// === Ensure classifyWithGemini on window (idempotent) ===
(() => { try{
  if (typeof classifyWithGemini === 'function' && !('classifyWithGemini' in globalThis)) {
    globalThis.classifyWithGemini = classifyWithGemini;
  }
}catch(e){} })();

// removed unsafe Object.assign export (analyzeImageTLDR)



/* Safety fallback: ensure Image TL;DR helper is present */
if (typeof window !== "undefined" && typeof window.analyzeImageTLDR !== "function") {
  try {
    if (typeof analyzeImageTLDR === "function") {
      window.analyzeImageTLDR = analyzeImageTLDR;
    } else {
      window.analyzeImageTLDR = async () => ({ ok: false, error: "vision_not_supported" });
    }
  } catch (e) {
    window.analyzeImageTLDR = async () => ({ ok: false, error: "vision_not_supported" });
  }
}


// === ClaimShield: result normalizer & throttle wrappers ===
(function(){
  function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, (n|0))); }
  function normalizeSpans(text, spansLike){
    if (!text || !Array.isArray(spansLike)) return [];
    return spansLike.map((s,i)=>{
      const start = clamp((s && s.start) ?? 0, 0, text.length);
      const end   = clamp((s && s.end) ?? start, 0, text.length);
      const a = Math.min(start, end), b = Math.max(start, end);
      const snippet = text.slice(a,b);
      return snippet ? { span_id:String(i), snippet, start:a, end:b } : null;
    }).filter(Boolean);
  }
  function normalizeResult(res){
    try{
      if (!res || typeof res !== 'object') return res;
      const text = (res?.structured?.summary) || (res?.input) || "";
      const spans = res?.structured?.proof?.spans || [];
      const safeSpans = normalizeSpans(text, spans);
      res.structured = res.structured || {};
      res.tructured = res.tructured || {}; // harmless guard if typos existed elsewhere
      res.structured.proof = res.structured.proof || {};
      res.structured.proof.spans = safeSpans;
    }catch(e){ /* swallow in prod */ }
    return res;
  }
  function throttle(fn, wait=2000){
    let last=0, timer=null, pending=null;
    return (...args)=>{
      const now = Date.now();
      const remain = wait - (now - last);
      if (remain <= 0){
        last = now; return fn(...args);
      } else {
        pending = args;
        clearTimeout(timer);
        timer = setTimeout(()=>{ last = Date.now(); fn(...pending); }, remain);
      }
    };
  }

  if (typeof window !== "undefined"){
    if (typeof window.classifyLocal === "function" && !window.classifyLocal.__normalized){
      const __origLocal = window.classifyLocal;
      window.classifyLocal = async function(...args){
        const out = await __origLocal.apply(this, args);
        return normalizeResult(out);
      };
      window.classifyLocal.__normalized = true;
    }
    if (typeof window.classifyWithGemini === "function" && !window.classifyWithGemini.__normalized){
      let __origHybrid = window.classifyWithGemini;
      const throttled = throttle(async function(...args){
        const out = await __origHybrid.apply(this, args);
        return normalizeResult(out);
      }, 2000);
      const proxy = function(...args){ return throttled.apply(this, args); };
      proxy.__normalized = true;
      window.classifyWithGemini = proxy;
    }
  }
})();


// removed previous defineProperty export block


// --- Safe export stub (idempotent, no redefine) ---
(function(){
  const w = typeof window !== 'undefined' ? window : globalThis;
  if (typeof w.analyzeImageTLDR !== 'function') {
    w.analyzeImageTLDR = async () => ({ ok:false, error:'vision_not_supported' });
  }
  if (typeof w.checkVisionSupport !== 'function') {
    w.checkVisionSupport = async () => ({ ok:false, error:'vision_not_supported' });
  }
})();
// --- end safe export stub ---

// H6safe: minimally invasive citation enforcement via LAST.structured setter
(function(){
  function txt(c){ if (typeof c === 'string') return c;
    if (c?.text) return c.text;
    if (Array.isArray(c?.parts)) return c.parts.map(p=>p?.text||'').join(' ').trim();
    try{ return JSON.stringify(c);}catch(_){ return String(c); } }
  function normCit(x){ if (!x) return [1]; if (Array.isArray(x)) return x.length?x:[1]; if (typeof x==='number') return [x]; return [1]; }
  function normSrc(arr){
    if (!Array.isArray(arr)) return [];
    let i=1; return arr.map(s=>({ id:(s?.id!=null)?s.id:i++, title:(s?.title||s?.url)||'Source', url:s?.url||'', snippet:s?.snippet||'' }));
  }
  async function enforce(structured){
    try{
      structured = structured || {}; structured.proof = structured.proof || {};
      const claims = Array.isArray(structured.claims) ? structured.claims : [];
      let has = Array.isArray(structured.proof.sources) && structured.proof.sources.length>0;
      if (!has && window._lastHybridProof?.sources?.length){
        structured.proof.sources = normSrc(window._lastHybridProof.sources);
        claims.forEach(c=>{ c.citations = normCit(c.citations); }); has = true;
      }
      if (!has && typeof window.evidenceFetchSnippets === 'function'){
        try{
          const fb = await window.evidenceFetchSnippets({ claims: claims.map(txt), contextUrl: location?.href||'', lang:'en' });
          if (fb?.sources?.length){
            structured.proof.sources = normSrc(fb.sources);
            claims.forEach((c,i)=>{ c.citations = normCit(fb.citations?.[i]); }); has = true;
          }
        }catch(e){ console.warn('Evidence fallback failed:', e); }
      }
      if (!has){
        const t = txt(claims[0] || structured.summary || '');
        structured.proof.sources = [{ id:1, title: document?.title || 'Current Page', url: location?.href || '', snippet: (''+t).slice(0,240) }];
        claims.forEach(c=>{ c.citations = normCit(c.citations); });
      }
      return structured;
    }catch(e){ console.warn('H6safe enforce error:', e); return structured||{}; }
  }
  try{
    window.LAST = window.LAST || {};
    let __structured = window.LAST.structured;
    Object.defineProperty(window.LAST, 'structured', {
      configurable:true, enumerable:true,
      get(){ return __structured; },
      set(v){ (async()=>{ __structured = await enforce(v);
        try{ window.__renderSourcesNow && window.__renderSourcesNow(); }catch(_){} })(); }
    });
  }catch(e){ console.warn('H6safe setter init failed:', e); }
})();
