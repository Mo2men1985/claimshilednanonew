// sources_display_fix.js - Immediate fix for sources display
// Add this script AFTER all other sources scripts in popup.html

(function() {
  'use strict';
  
  console.log('🔧 [Sources Display Fix] Initializing...');
  
  // ===== CRITICAL FIX: Make H6safe setter properly async =====
  if (window.LAST) {
    let _structured = window.LAST.structured;
    
    Object.defineProperty(window.LAST, 'structured', {
      configurable: true,
      enumerable: true,
      get() { 
        return _structured; 
      },
      set(val) {
        _structured = val;
        
        // CRITICAL: Use async IIFE to properly await enforcement
        (async () => {
          try {
            // Enforce citations first
            if (typeof __cs_enforce_citations === 'function') {
              _structured = await __cs_enforce_citations(_structured);
            }

            // Enrich sources with authority/recency if scorer is available
            try {
              if (window.CS_SourceScoring &&
                  _structured &&
                  _structured.proof &&
                  Array.isArray(_structured.proof.sources)) {
                _structured.proof.sources = window.CS_SourceScoring.enrichSources(_structured.proof.sources);
              }
            } catch (e) {
              console.warn('[Sources Display Fix] Source scoring error:', e);
            }

            // Run hallucination/grounding analysis if available
            try {
              if (window.CS_HallucinationGuard && typeof window.CS_HallucinationGuard.analyze === 'function') {
                _structured = window.CS_HallucinationGuard.analyze(_structured);
              }
            } catch (e) {
              console.warn('[Sources Display Fix] Hallucination guard error:', e);
            }

            // Compute risk score if risk guard is available
            try {
              if (window.CS_RiskGuard && typeof window.CS_RiskGuard.assess === 'function') {
                _structured.risk = window.CS_RiskGuard.assess(_structured);
              }
            } catch (e) {
              console.warn('[Sources Display Fix] Risk guard error:', e);
            }

            // Render risk section before sources
            try {
              if (typeof window.__renderRiskSection === 'function') {
                window.__renderRiskSection(_structured);
              }
            } catch (e) {
              console.warn('[Sources Display Fix] Risk section render error:', e);
            }

            // Then render sources
            renderSourcesNow(_structured);
          } catch (e) {
            console.error('[Sources Display Fix] Error in setter:', e);
            // Still try to render even if enforcement fails
            try {
              if (typeof window.__renderRiskSection === 'function') {
                window.__renderRiskSection(_structured);
              }
            } catch (_) {}
            renderSourcesNow(_structured);
          }
        })();
      }
    });
  }
  
  // ===== Unified render function =====
  function renderSourcesNow(structured) {
    try {
      const s = structured || (window.LAST && window.LAST.structured) || {};
      const proof = s.proof || {};
      
      // Collect ALL possible sources
      let sources = [];
      
      // 1. From proof.sources
      if (Array.isArray(proof.sources)) {
        sources.push(...proof.sources);
      }
      
      // 2. From _lastHybridProof
      if (window._lastHybridProof && Array.isArray(window._lastHybridProof.sources)) {
        sources.push(...window._lastHybridProof.sources);
      }
      
      // 3. From __EVIDENCE_PRELOAD__
      if (window.__EVIDENCE_PRELOAD__ && Array.isArray(window.__EVIDENCE_PRELOAD__)) {
        sources.push(...window.__EVIDENCE_PRELOAD__);
      }
      
      // 4. From window.__wiki_last_items
      if (window.__wiki_last_items && Array.isArray(window.__wiki_last_items)) {
        sources.push(...window.__wiki_last_items);
      }
      
      // Filter to external web evidence (Wikipedia + temporal news search) and dedupe by URL
      const seen = new Set();
      sources = sources.filter(src => {
        if (!src || !src.url) return false;
        try {
          const url = String(src.url);
          const u = new URL(url);
          const host = u.hostname.replace(/^www\./, '');
          // For Rev 3.2 we primarily surface Wikipedia evidence links,
          // but we also allow Google News search as a temporal helper.
          const isWiki = /wikipedia\.org$/i.test(host);
          const isNews = host === 'news.google.com';
          if (!isWiki && !isNews) return false;
          if (seen.has(url)) return false;
          seen.add(url);
          // Clean non-string snippets to avoid "[object Promise]"
          if (src.snippet && typeof src.snippet !== 'string') {
            src.snippet = '';
          }
          return true;
        } catch (e) {
          return false;
        }
      });

      console.log(`📚 [Sources Display Fix] Rendering ${sources.length} sources`);

      // Find or create a dedicated WIKI container so we don't fight the old block
      let container = document.getElementById('wiki-sources-card');
      if (!container) {
        container = document.createElement('div');
        container.id = 'wiki-sources-card';
        container.className = 'cs-sources cs-sources-wiki';

        const results = document.getElementById('results');
        if (results) {
          // show right under the JSON/results area
          results.appendChild(container);
        } else {
          document.body.appendChild(container);
        }
      }
      
      // Render
      if (sources.length === 0) {
        container.innerHTML = `
          <div style="
            padding: 12px;
            background: #fef3c7;
            border: 1px solid #f59e0b;
            border-radius: 8px;
            color: #92400e;
            font-size: 13px;
            margin: 16px 0;
          ">
            ⚠️ Wikipedia/API unreachable or returned no usable evidence. ClaimShield abstained instead of guessing.
          </div>
        `;
        return;
      }
      
      // Build styled sources list
      let html = `
        <div style="
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          border: 2px solid #667eea;
          border-radius: 12px;
          padding: 16px;
          margin: 16px 0;
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
        ">
          <h3 style="
            display: flex;
            align-items: center;
            gap: 8px;
            color: #1e293b;
            font-size: 16px;
            margin: 0 0 12px 0;
          ">
            📚 Verification Sources
            <span style="
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
              color: white;
              padding: 4px 12px;
              border-radius: 16px;
              font-size: 12px;
              font-weight: 700;
            ">${sources.length}</span>
          </h3>
          <ol style="margin: 0; padding-left: 20px; font-size: 13px;">
      `;
      
      sources.forEach((src, idx) => {
        const domain = src.domain || (src.url ? new URL(src.url).hostname.replace(/^www\./, '') : '');
        html += `
          <li style="
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 12px;
            transition: all 0.2s ease;
          ">
            <a href="${src.url || '#'}" 
               target="_blank" 
               rel="noopener noreferrer"
               style="
                 color: #667eea;
                 text-decoration: none;
                 font-weight: 600;
                 display: flex;
                 align-items: center;
                 gap: 8px;
               ">
              ${src.title || 'Source ' + (idx + 1)}
              ${domain ? `
                <span style="
                  font-size: 11px;
                  color: #64748b;
                  background: #f8fafc;
                  padding: 2px 8px;
                  border-radius: 6px;
                  border: 1px solid #e2e8f0;
                  margin-left: auto;
                ">${domain}</span>
              ` : ''}
            </a>
            ${src.snippet ? `
              <div style="
                color: #475569;
                font-size: 13px;
                line-height: 1.6;
                margin-top: 8px;
                padding-top: 8px;
                border-top: 1px solid #f1f5f9;
              ">${src.snippet}</div>
            ` : ''}
          </li>
        `;
      });
      
      html += '</ol></div>';
      container.innerHTML = html;
      
      // Hide legacy 'Sources' card if present
      try {
        const legacy = document.getElementById('sources-list');
        if (legacy) {
          let card = legacy;
          while (card && card.parentElement && card.parentElement !== document.body) {
            card = card.parentElement;
            if (!card) break;
            const cls = (card.className || '').toString();
            if (
              card.id === 'sourcesCard' ||
              card.id === 'sources-root' ||
              /sources/i.test(cls)
            ) {
              card.style.display = 'none';
              break;
            }
          }
        }
      } catch (e) {
        console.warn('[Sources Display Fix] Failed to hide legacy sources card', e);
      }
      
      // Scroll into view
      setTimeout(() => {
        container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
      
      console.log('✅ [Sources Display Fix] Rendered successfully!');
      
    } catch (e) {
      console.error('[Sources Display Fix] Render error:', e);
    }
  }
  
  // ===== Override ALL competing render functions =====
  window.__renderSourcesNow = renderSourcesNow;
  window.showSources = renderSourcesNow;
  window.renderSources = renderSourcesNow;
  
  // Override formatResults to always render sources at the end
  const originalFormatResults = window.formatResults;
  window.formatResults = function(data) {
    try {
      if (typeof originalFormatResults === 'function') {
        originalFormatResults.apply(this, arguments);
      }
    } catch (e) {
      console.warn('[Sources Display Fix] Original formatResults error:', e);
    }
    
    // Always render sources after formatResults completes
    setTimeout(() => {
      renderSourcesNow(data?.structured || window.LAST?.structured);
    }, 200);
  };
  
  // ===== Listen for verification complete events =====
  window.addEventListener('claimshield:verificationComplete', (e) => {
    setTimeout(() => {
      renderSourcesNow(e.detail?.structured || window.LAST?.structured);
    }, 100);
  });
  
  // ===== Initial render if data exists =====
  if (window.LAST?.structured?.proof?.sources?.length) {
    console.log('🔄 [Sources Display Fix] Rendering existing sources...');
    setTimeout(() => {
      renderSourcesNow(window.LAST.structured);
    }, 500);
  }
  
  // ===== Hook into Wikipedia fetch completion =====
  if (typeof window.evidenceFetchSnippets === 'function') {
    const originalFetch = window.evidenceFetchSnippets;
    window.evidenceFetchSnippets = async function(...args) {
      const results = await originalFetch.apply(this, args);
      
      // Store results globally
      window.__wiki_last_items = results;
      
      // Trigger immediate render
      setTimeout(() => {
        if (window.LAST && window.LAST.structured) {
          if (!window.LAST.structured.proof) {
            window.LAST.structured.proof = {};
          }
          if (!window.LAST.structured.proof.sources) {
            window.LAST.structured.proof.sources = [];
          }
          
          // Merge with existing sources
          const existing = window.LAST.structured.proof.sources;
          const merged = [...existing, ...results];
          const seen = new Set();
          window.LAST.structured.proof.sources = merged.filter(s => {
            if (!s || !s.url) return false;
            if (seen.has(s.url)) return false;
            seen.add(s.url);
            return true;
          });
          
          renderSourcesNow(window.LAST.structured);
        }
      }, 100);
      
      return results;
    };
  }
  
  console.log('✅ [Sources Display Fix] Initialization complete');
  console.log('💡 Manual trigger: window.showSources()');
})();
