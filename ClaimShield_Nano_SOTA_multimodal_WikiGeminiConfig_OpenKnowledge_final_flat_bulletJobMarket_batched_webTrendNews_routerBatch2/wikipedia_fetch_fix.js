// --- Query sanitization & dedupe guards (v6) ---
(function(){
  window.__wiki_busy = window.__wiki_busy || false;
  window.__wiki_seen = window.__wiki_seen || new Set();


  function csResolveWikipediaBaseUrlFromSettings() {
    try {
      if (typeof window !== 'undefined' && window.CS_SETTINGS_DEFAULTS) {
        const fromDefaults = window.CS_SETTINGS_DEFAULTS.wikipediaBaseUrl;
        if (typeof fromDefaults === 'string' && fromDefaults.startsWith('http')) {
          return fromDefaults.replace(/\/$/, '');
        }
      }
      if (typeof window !== 'undefined' && typeof window.csLoadSettings === 'function') {
        // Attempt async load, but do not block; this is a best-effort hook.
        window.csLoadSettings().then((settings) => {
          if (settings && typeof settings.wikipediaBaseUrl === 'string') {
            window.__csWikiBase = settings.wikipediaBaseUrl.replace(/\/$/, '');
          }
        }).catch(() => {});
      }
      if (typeof window !== 'undefined' && typeof window.__csWikiBase === 'string') {
        return window.__csWikiBase.replace(/\/$/, '');
      }
    } catch (e) {
      console.warn('[ClaimShield] csResolveWikipediaBaseUrlFromSettings failed, using default', e);
    }
    return 'https://en.wikipedia.org';
  }



  window.__wiki_sanitize = function(q) {
    try {
      if (typeof q === "string") return q.trim().replace(/\s+/g, " ");
      if (q && typeof q.text === "string") return q.text.trim().replace(/\s+/g, " ");
      if (q && typeof q === "object") {
        if (typeof q.summary === "string") return q.summary.trim().replace(/\s+/g, " ");
        if (typeof q.claim === "string") return q.claim.trim().replace(/\s+/g, " ");
      }
    } catch {}
    return "";
  };

  window.__wiki_shouldRun = function(q) {
    if (!q) return False; // handle falsy
    if (window.__wiki_seen.has(q)) return false;
    window.__wiki_seen.add(q);
    if (window.__wiki_seen.size > 20) {
      const it = window.__wiki_seen.values().next();
      if (!it.done) window.__wiki_seen.delete(it.value);
    }
    return true;
  };
})();

// v9.6: basic cleaner to avoid `[object Object]` noise in Wikipedia queries
function csCleanWikiQuery(q){
  try{
    if (q == null) return "";
    if (typeof q === "object") {
      if (typeof q.text === "string") q = q.text;
      else if (typeof q.value === "string") q = q.value;
      else if (typeof q.query === "string") q = q.query;
      else if (typeof q.summary === "string") q = q.summary;
      else if (typeof q.claim === "string") q = q.claim;
      else q = String(q);
    }

function csTokenizeForWiki(str) {
  const out = new Set();
  try {
    String(str || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .forEach((w) => {
        if (!w) return;
        if (w.length <= 2) return;
        out.add(w);
      });
  } catch (_e) {}
  return out;
}

function csFilterWikiHitsByOverlap(hits, query) {
  try {
    if (!Array.isArray(hits)) return [];
    const qTokens = csTokenizeForWiki(query);
    if (!qTokens || qTokens.size === 0) return hits;

    const strongTokens = new Set([
      "data","science","scientist","scientists","job","jobs","employment",
      "career","careers","market","demand","salary","salaries","hiring",
      "unemployment"
    ]);

    return hits.filter((hit) => {
      const title = hit && typeof hit.title === "string" ? hit.title : "";
      const rawSnippet = hit && typeof hit.snippet === "string" ? hit.snippet : "";
      const cleanSnippet = rawSnippet.replace(/<[^>]+>/g, " ");
      const text = (title + " " + cleanSnippet).toLowerCase();

      const hTokens = csTokenizeForWiki(text);
      let overlap = 0;
      let strongOverlap = 0;

      for (const t of qTokens) {
        if (hTokens.has(t)) {
          overlap++;
          if (strongTokens.has(t)) strongOverlap++;
        }
      }

      // Keep if there is clear overlap
      return overlap >= 2 || strongOverlap >= 1;
    });
  } catch (e) {
    console.warn("[ClaimShield] csFilterWikiHitsByOverlap failed", e);
    return hits || [];
  }
}
    if (typeof q !== "string") q = String(q || "");
    q = q.replace(/\[object Object\]/gi, " ").replace(/\s+/g, " ").trim();
    if (!/[A-Za-z0-9]/.test(q)) return "";
    if (q.length > 256) q = q.slice(0,256);
    return q;
  }catch(e){
    console.warn("[ClaimShield] csCleanWikiQuery failed", e);
    return "";
  }
}


// ===== FIX WIKIPEDIA 404 ERRORS =====
// The current evidenceFetchSnippets has URL encoding issues
// This replaces it with a more robust version

(function fixWikipediaFetch() {
  console.log('🔧 Fixing Wikipedia fetch...');
  
  // Enhanced Wikipedia fetch with better error handling
  
async function fetchNewsGoogleHeadlines(encodedQuery, maxItems = 3) {
  try {
    // CSP-safe stub: current extension Content Security Policy only allows
    // outbound requests to Wikipedia / Gemini / localhost. To preserve that
    // guarantee (and avoid extension errors), we don't fetch Google News RSS
    // here. This helper exists as a future hook if the CSP is relaxed.
    console.log("[ClaimShield] fetchNewsGoogleHeadlines stub active (no network call)");
    return null;
  } catch (_e) {
    return null;
  }
}


// Global resolver for Wikipedia base URL (used by evidenceFetchSnippetsFixed and others)
function csResolveWikipediaBaseUrlFromSettings() {
  try {
    if (typeof window !== 'undefined' && window.CS_SETTINGS && typeof window.CS_SETTINGS.wikipediaBaseUrl === 'string') {
      return window.CS_SETTINGS.wikipediaBaseUrl.replace(/\/$/, '');
    }
    if (typeof window !== 'undefined' && window.CS_SETTINGS_DEFAULTS && typeof window.CS_SETTINGS_DEFAULTS.wikipediaBaseUrl === 'string') {
      return window.CS_SETTINGS_DEFAULTS.wikipediaBaseUrl.replace(/\/$/, '');
    }
    if (typeof window !== 'undefined' && typeof window.__csWikiBase === 'string') {
      return window.__csWikiBase.replace(/\/$/, '');
    }
  } catch (e) {
    console.warn('[ClaimShield] csResolveWikipediaBaseUrlFromSettings (global) failed, using default', e);
  }
  return 'https://en.wikipedia.org';
}

async function evidenceFetchSnippetsFixed(claim, limit = 3) {
    const base = csResolveWikipediaBaseUrlFromSettings();
    const results = [];
    
    try {
      // Clean and encode the search query properly
      const cleanQuery = csCleanWikiQuery(claim) || String(claim || "")
        .trim()
        .replace(/[^\w\s-]/g, ' ') // Remove special chars
        .replace(/\s+/g, ' ')      // Collapse spaces
        .slice(0, 120);

      // Normalize bullet-style summaries (strip bullet markers everywhere,
      // not just at the start) so we do not send "* *" noise to Wikipedia.
      let trimmedQuery = cleanQuery.trim();
      if (/^[*\-\u2022]/.test(trimmedQuery) || trimmedQuery.indexOf('* *') !== -1) {
        console.log('[ClaimShield] Normalizing bullet-style summary query for Wikipedia search');

        // Drop leading bullet characters for the first line
        trimmedQuery = trimmedQuery.replace(/^[*\-\u2022\s]+/, '');

        // Remove any remaining inline bullet markers ("* *", "•", etc.)
        trimmedQuery = trimmedQuery
          .replace(/(\*\s*\*)/g, ' ')
          .replace(/[\u2022•]/g, ' ')
          .replace(/[\*\-]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      if (!trimmedQuery) {
        trimmedQuery = cleanQuery;
      }

      const encodedQuery = encodeURIComponent(trimmedQuery);

      // Log the normalized query (not the noisy bullet version)
      console.log(`🔍 Searching Wikipedia for: "${trimmedQuery}"`);

      // Use the search API
      const searchUrl = `${base}/w/api.php?action=query&list=search&srsearch=${encodedQuery}&format=json&origin=*&srlimit=${limit}`;
      
      console.log('📡 Fetching:', searchUrl);
      
      const response = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.warn(`Wikipedia search failed: ${response.status}`);
        return [];
      }
      
      const data = await response.json();
      let hits = (data?.query?.search || []);

      console.log(`✅ Raw Wikipedia hits: ${hits.length}`);
      try {
        const filterQuery = trimmedQuery || cleanQuery || String(claim || "");
        hits = csFilterWikiHitsByOverlap(hits, filterQuery);
      } catch (e) {
        console.warn("[ClaimShield] Failed to filter Wikipedia hits:", e);
      }
      hits = hits.slice(0, limit);

      console.log(`✅ Filtered Wikipedia hits: ${hits.length}`);

      // If this looks temporal and Wikipedia has no direct hits,
// we now let the final temporal fallback block synthesize any pseudo-sources,
// so this section only logs and defers to the tail logic.
      if (hits.length === 0) {
        try {
          const looksTemporal = (typeof csLooksTemporal === "function")
            ? csLooksTemporal(claim)
            : false;

          if (looksTemporal) {
            console.log("[ClaimShield] Temporal claim detected with zero direct Wikipedia hits — deferring to tail fallback");
          }
        } catch (e) {
          console.warn("[ClaimShield] Temporal detection guard failed", e);
        }
      }


// Fetch summaries for each result
      for (let i = 0; i < hits.length; i++) {
        const hit = hits[i];
        const title = hit.title;
        
        try {
          // Use the REST API for summaries
          const summaryUrl = `${base}/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
          
          const summaryResponse = await fetch(summaryUrl);
          
          if (summaryResponse.ok) {
            const summary = await summaryResponse.json();
            
            results.push({
              id: results.length + 1,
              title: summary.title || title,
              url: summary.content_urls?.desktop?.page || `${base}/wiki/${encodeURIComponent(title)}`,
              domain: "en.wikipedia.org",
              snippet: summary.extract || hit.snippet?.replace(/<[^>]+>/g, '') || ""
            });
            
            console.log(`✅ Fetched summary for: ${title}`);
          } else {
            // Fallback: use search snippet
            results.push({
              id: results.length + 1,
              title: title,
              url: `${base}/wiki/${encodeURIComponent(title)}`,
              domain: "en.wikipedia.org",
              snippet: hit.snippet?.replace(/<[^>]+>/g, '') || ""
            });
            
            console.log(`⚠️ Used fallback for: ${title}`);
          }
        } catch (err) {
          console.warn(`Failed to fetch summary for ${title}:`, err);
        }
      }
      
            // ---- TEMPORAL FALLBACK: PSEUDO-SOURCES FOR RECENT EVENTS ----
      const rawClaimText = String(claim || "");
      const lowerClaim = rawClaimText.toLowerCase();

      const trendLike = /\b(job market|employment|hiring|layoffs?|unemployment|labou?r market|demand for [a-z0-9\s]+(skills|workers|jobs)|fastest[- ]growing|increasing demand|declining demand|career prospects?)\b/.test(lowerClaim);

      const isTemporal = typeof csLooksTemporal === "function"
        ? csLooksTemporal(rawClaimText)
        : false;

      const isTemporalOrTrend = isTemporal || trendLike;

      if (isTemporalOrTrend) {
        console.log("[ClaimShield] Using temporal/trend pseudo-source for recent event or job-market style claim");

        const raw = (cleanQuery || String(claim || "")).trim();
        const q = raw.slice(0, 220);
        const encoded = encodeURIComponent(q || "recent event");

        let newsSnippet =
          "Open a live news search for this claim. Use official outlets and timestamps to confirm details.";

        try {
          const headlines = await fetchNewsGoogleHeadlines(encoded, 3);
          if (headlines && headlines.length) {
            const parts = headlines.map((h) => {
              const src = h.source || "Unknown source";
              return `${h.title} (${src})`;
            });
            newsSnippet = "Top live headlines: " + parts.join(" • ");
          }
        } catch (e) {
          console.warn("[ClaimShield] Failed to enrich Google News source:", e);
        }

        const pseudoSources = [
          {
            id: results.length + 1,
            title: "📰 Live News Search",
            url: `https://news.google.com/search?q=${encoded}`,
            domain: "news.google.com",
            snippet: newsSnippet
          },
          {
            id: results.length + 2,
            title: "⏳ Recent Event – Limited Sources (Wikipedia)",
            url: `${csResolveWikipediaBaseUrlFromSettings()}/w/index.php?search=${encoded}`,
            domain: "en.wikipedia.org",
            snippet:
              "This claim appears time-sensitive or very recent. Wikipedia may not yet have a dedicated page; this link runs a live search instead."
          }
        ];

        const remainingSlots = Math.max((limit || 3) - results.length, 0);

        if (remainingSlots > 0) {
          for (const src of pseudoSources.slice(0, remainingSlots)) {
            results.push(src);
          }
        } else {
          // No room left but we still want at least one live news entry.
          const hasNews = results.some((r) => (r.domain || "").includes("news.google.com"));
          if (!hasNews && pseudoSources[0]) {
            results[results.length - 1] = pseudoSources[0];
          }
        }
      }

      console.log("✅ Returning", results.length, "Wikipedia sources");
      return results;

    } catch (error) { console.warn('⚠️ Wikipedia fetch error – falling back to search-only mode:', error);
      return [];
    }
  }
 

  // Simple temporal detector for recent / time-sensitive claims
  function csLooksTemporal(claim) {
  try {
    let text = "";
    if (typeof claim === "string") {
      text = claim;
    } else if (claim && typeof claim === "object") {
      text = claim.text || claim.summary || claim.claim || "";
    }
    text = String(text || "").toLowerCase();
    if (!text) return false;

    // 1) Years 2023+ or generic recency markers
    if (/\b20(2[3-9]|3[0-9])\b/.test(text)) return true;
    if (/(today|yesterday|tomorrow|recently|lately|this year|this month|this week|this quarter|tonight|this morning|this afternoon|this evening)/.test(text)) {
      return true;
    }

    // 2) Time-sensitive domains that almost always require fresh data
    if (/(election|vote|voting|polls|results|runoff|primary)/.test(text)) return true;

    if (/(national weather service|\bnws\b|storm system|storm warning|weather alert|weather advisory|heatwave|heat wave|hurricane|typhoon|tornado|flooding|flash flood|wildfire)/.test(text)) {
      return true;
    }

    return false;
  } catch (e) {
    console.warn("[ClaimShield] csLooksTemporal failed", e);
    return false;
  }
  }


  // Wire the fixed Wikipedia pipeline + temporal detector into the global namespace
  try {
    if (typeof window !== "undefined") {
      // Expose the temporal detector so classifyWithGemini can use it
      if (!window.csLooksTemporal) {
        window.csLooksTemporal = csLooksTemporal;
      }

      // Keep a handle to the legacy evidence fetcher (for debugging or fallback)
      if (typeof window.evidenceFetchSnippets === "function") {
        window.__cs_legacyEvidenceFetchSnippets = window.evidenceFetchSnippets;
      } else if (typeof evidenceFetchSnippets === "function") {
        window.__cs_legacyEvidenceFetchSnippets = evidenceFetchSnippets;
      }

      // Use the fixed implementation for all new calls
      window.evidenceFetchSnippets = evidenceFetchSnippetsFixed;
    }

    // Also update the global symbol if it exists so __cs_enforce_citations()
    // and other callers that reference evidenceFetchSnippets directly
    // will automatically use the fixed version.
    try {
      // eslint-disable-next-line no-global-assign
      evidenceFetchSnippets = evidenceFetchSnippetsFixed;
    } catch (e) {
      // If this fails in strict mode, we still have window.evidenceFetchSnippets patched.
      console.warn("[ClaimShield] Global evidenceFetchSnippets override failed softly:", e);
    }

    console.log("[ClaimShield] Patched evidenceFetchSnippets → evidenceFetchSnippetsFixed");
  } catch (e) {
    console.warn("[ClaimShield] Failed to patch Wikipedia evidence pipeline", e);
  }

// ===== TEST THE FIX =====
// Simple smoke test that reuses the same evidence function we use in production.
// This avoids hitting deprecated REST endpoints and keeps the console clean.
async function csTestWikipediaFetch() {
  try {
    console.log("\n🧪 Testing Wikipedia fetch...");
    if (typeof window.evidenceFetchSnippets !== "function") {
      console.warn("[ClaimShield] evidenceFetchSnippets not available for smoke test");
      return;
    }

    const results = await window.evidenceFetchSnippets("data science", 3);

    if (!Array.isArray(results) || results.length === 0) {
      console.info("[ClaimShield] Wikipedia evidence smoke test: no results (possibly offline, blocked, or zero hits).");
      return;
    }

    console.log("✅ Wikipedia fetch SUCCESS!");
    console.log("Found", results.length, "results:");
    for (const r of results) {
      console.log("  📄", r.title);
      console.log("     ", r.url);
    }
  } catch (e) {
    console.error("[ClaimShield] Wikipedia evidence test crashed", e);
  }
}

// Run the smoke test once on load, without breaking anything if it fails.
setTimeout(() => {
  try {
    csTestWikipediaFetch();
  } catch (e) {
    console.warn("[ClaimShield] csTestWikipediaFetch threw:", e);
  }
}, 0);

})();