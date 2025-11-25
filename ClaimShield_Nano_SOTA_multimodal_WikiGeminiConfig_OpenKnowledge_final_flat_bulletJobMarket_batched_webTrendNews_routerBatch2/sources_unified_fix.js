// sources_unified_fix.js - Unified fix for sources display
// Load this AFTER all other sources scripts

(function() {
  'use strict';
  
  console.log('🔧 [Sources Fix] Initializing unified sources display...');
  
  // ===== STEP 1: Ensure DOM container exists =====
  function ensureSourcesContainer() {
    let container = document.getElementById('sources-list');
    if (!container) {
      container = document.createElement('div');
      container.id = 'sources-list';
      container.className = 'cs-sources';
      container.style.minHeight = '60px';
      container.style.display = 'block';
      
      const results = document.getElementById('results');
      if (results) {
        results.appendChild(container);
      } else {
        document.body.appendChild(container);
      }
      console.log('✅ [Sources Fix] Created #sources-list container');
    }
    return container;
  }
  
  // ===== STEP 2: Smart source collection (handles all cases) =====
  function collectAllSources(structured) {
    const seen = new Set();
    const sources = [];
    
    function addSource(src) {
      if (!src || !src.url) return;
      const url = String(src.url).trim();
      if (!url || !/^https?:\/\//i.test(url)) return;
      if (seen.has(url)) return;
      
      seen.add(url);
      sources.push({
        title: src.title || src.domain || url,
        url: url,
        domain: src.domain || (url ? new URL(url).hostname.replace(/^www\./, '') : ''),
        snippet: src.snippet || ''
      });
    }
    
    try {
      const proof = structured?.proof;
      if (!proof) return sources;
      
      // 1. Top-level sources
      if (Array.isArray(proof.sources)) {
        proof.sources.forEach(addSource);
      }
      
      // 2. Span-level sources
      if (Array.isArray(proof.spans)) {
        proof.spans.forEach(span => {
          if (Array.isArray(span.sources)) {
            span.sources.forEach(addSource);
          }
        });
      }
      
      // 3. Check _lastHybridProof (grounding data)
      if (window._lastHybridProof && Array.isArray(window._lastHybridProof.sources)) {
        window._lastHybridProof.sources.forEach(addSource);
      }
      
      // 4. Check __EVIDENCE_PRELOAD__
      if (window.__EVIDENCE_PRELOAD__ && Array.isArray(window.__EVIDENCE_PRELOAD__)) {
        window.__EVIDENCE_PRELOAD__.forEach(addSource);
      }
      
    } catch (e) {
      console.warn('[Sources Fix] Collection error:', e);
    }
    
    return sources;
  }
  
  // ===== STEP 3: Robust renderer =====
  function renderSources(structured) {
    const container = ensureSourcesContainer();
    const sources = collectAllSources(structured || window.LAST?.structured);
    
    console.log(`📚 [Sources Fix] Rendering ${sources.length} sources`);
    
    if (sources.length === 0) {
      container.innerHTML = '<div style="color: #64748b; font-style: italic; padding: 12px;">No sources available yet. Run a verification first.</div>';
      return;
    }
    
    // Build HTML
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
          📚 Sources
          <span style="
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 4px 12px;
            border-radius: 16px;
            font-size: 12px;
            font-weight: 700;
          ">${sources.length}</span>
        </h3>
        <ol style="margin: 0; padding-left: 20px;">
    `;
    
    sources.forEach((src, idx) => {
      html += `
        <li style="
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 12px;
          transition: all 0.2s ease;
        ">
          <a href="${src.url}" 
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
            ${src.domain ? `
              <span style="
                font-size: 11px;
                color: #64748b;
                background: #f8fafc;
                padding: 2px 8px;
                border-radius: 6px;
                border: 1px solid #e2e8f0;
                margin-left: auto;
              ">${src.domain}</span>
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
    
    console.log('✅ [Sources Fix] Rendered successfully');
  }
  
  // ===== STEP 4: Hook into verification flow =====
  
  // Override formatResults to always render sources AFTER
  const originalFormatResults = window.formatResults;
  window.formatResults = function(data) {
    // Call original
    if (typeof originalFormatResults === 'function') {
      originalFormatResults.apply(this, arguments);
    }
    
    // Then render sources (with slight delay to let setter complete)
    setTimeout(() => {
      try {
        renderSources(data?.structured || window.LAST?.structured);
      } catch (e) {
        console.error('[Sources Fix] Render error:', e);
      }
    }, 150);
  };
  
  // Also hook the setter (H6safe)
  if (window.LAST) {
    let _structured = window.LAST.structured;
    Object.defineProperty(window.LAST, 'structured', {
      configurable: true,
      enumerable: true,
      get() { return _structured; },
      set(val) {
        _structured = val;
        
        // Trigger render after setter completes
        setTimeout(() => {
          try {
            renderSources(val);
          } catch (e) {
            console.error('[Sources Fix] Setter render error:', e);
          }
        }, 100);
      }
    });
  }
  
  // ===== STEP 5: Expose manual trigger =====
  window.__renderSourcesNow = renderSources;
  window.showSources = renderSources;
  
  // ===== STEP 6: Initial render if data already exists =====
  if (window.LAST?.structured?.proof) {
    setTimeout(() => {
      console.log('🔄 [Sources Fix] Rendering existing data...');
      renderSources(window.LAST.structured);
    }, 300);
  }
  
  console.log('✅ [Sources Fix] Initialization complete');
  console.log('💡 Manual trigger: window.showSources() or window.__renderSourcesNow()');
})();
