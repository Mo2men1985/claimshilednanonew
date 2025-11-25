// --- Robust Wikipedia Summary Helper (stable; avoids 404s) ---
async function getWikiSummarySafe(query) {
  const base = 'https://en.wikipedia.org';
  const q = String(query || '').trim();
  if (!q) return null;
  // Try stable REST summary first
  try {
    const u = `${base}/api/rest_v1/page/summary/${encodeURIComponent(q)}`;
    const r = await fetch(u);
    if (r.ok) return await r.json();
  } catch {}
  // Normalize via Action API search
  try {
    const u2 = `${base}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=1&format=json&origin=*`;
    const j = await fetch(u2).then(x=>x.json());
    const best = j?.query?.search?.[0]?.title;
    if (best) {
      const r2 = await fetch(`${base}/api/rest_v1/page/summary/${encodeURIComponent(best)}`);
      if (r2.ok) return await r2.json();
    }
  } catch {}
  // Fallback object
  return { title: q, extract: '', content_urls: { desktop: { page: `${base}/wiki/${encodeURIComponent(q)}` } } };
}

// ===== COMPLETE SOURCES INTEGRATION =====
// Run this script in the popup console to immediately surface sources
// Or add it to popup.js permanently

(async function integrateSourcesEverywhere() {
  console.log('🚀 Starting Complete Sources Integration...');
  
  // ===== 1. INJECT CSS =====
  const injectCSS = () => {
    if (document.getElementById('sources-css-injected')) return;
    
    const style = document.createElement('style');
    style.id = 'sources-css-injected';
    style.textContent = `
      .result-sources, #sources-root {
        background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
        border: 2px solid #667eea;
        border-radius: 12px;
        padding: 16px;
        margin: 16px 0;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
        animation: slideInSources 0.3s ease-out;
      }
      
      @keyframes slideInSources {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      .result-sources strong, #sources-root h3 {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #1e293b;
        font-size: 16px;
        margin-bottom: 12px;
      }
      
      .source-count-badge {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 4px 12px;
        border-radius: 16px;
        font-size: 12px;
        font-weight: 700;
      }
      
      .result-sources ol li, #sources-list li {
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 12px;
        transition: all 0.2s ease;
      }
      
      .result-sources ol li:hover, #sources-list li:hover {
        border-color: #667eea;
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
        transform: translateX(4px);
      }
      
      .result-sources a, #sources-list a {
        color: #667eea;
        text-decoration: none;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .result-sources a:hover, #sources-list a:hover {
        color: #764ba2;
        text-decoration: underline;
      }
      
      .source-domain-badge {
        font-size: 11px;
        color: #64748b;
        background: #f8fafc;
        padding: 2px 8px;
        border-radius: 6px;
        border: 1px solid #e2e8f0;
        margin-left: auto;
      }
      
      .source-snippet {
        color: #475569;
        font-size: 13px;
        line-height: 1.6;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid #f1f5f9;
      }
    `;
    document.head.appendChild(style);
    console.log('✅ CSS injected');
  };
  
  // ===== 2. ENHANCED RENDER FUNCTION =====
  // Helper: flatten top-level and span-level sources into one list
  const csFlattenProofSources = (proof) => {
    try {
      if (!proof) return [];
      const acc = [];
      const seen = new Set();

      const pushSrc = (src) => {
        if (!src || typeof src.url !== 'string') return;
        const url = src.url;
        if (!/^https?:\/\//i.test(url)) return;
        if (seen.has(url)) return;
        seen.add(url);
        acc.push({
          title: src.title || src.domain || url,
          url,
          domain: src.domain || (url ? new URL(url).hostname.replace(/^www\./, '') : ''),
          snippet: src.snippet || ''
        });
      };

      if (Array.isArray(proof.sources)) {
        proof.sources.forEach(pushSrc);
      }

      if (Array.isArray(proof.spans)) {
        proof.spans.forEach(span => {
          if (!span || !Array.isArray(span.sources)) return;
          span.sources.forEach(pushSrc);
        });
      }

      return acc;
    } catch (e) {
      console.warn('[ClaimShield] csFlattenProofSources failed', e);
      return [];
    }
  };
  const renderSourcesEnhanced = (structured) => {
    const s = structured || (window.LAST && window.LAST.structured) || {};
    const proof = s && s.proof;
    const sources = csFlattenProofSources(proof);
    
    // Find or create container
    let root = document.getElementById('sources-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'sources-root';
      
      const results = document.getElementById('results');
      if (results) {
        results.parentNode.insertBefore(root, results.nextSibling);
      } else {
        document.body.appendChild(root);
      }
    }
    
    // Build HTML
    root.innerHTML = '';
    
    const header = document.createElement('h3');
    header.innerHTML = `📚 Sources <span class="source-count-badge">${sources.length}</span>`;
    root.appendChild(header);
    
    if (!sources.length) {
      root.innerHTML += '<p style="color: #64748b; font-style: italic; margin: 0;">No sources available yet. Run a verification first.</p>';
      return;
    }
    
    const list = document.createElement('ol');
    list.id = 'sources-list';
    list.style.margin = '0';
    list.style.paddingLeft = '20px';
    
    sources.forEach((src, idx) => {
      const li = document.createElement('li');
      
      const link = document.createElement('a');
      link.href = src.url || '#';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = src.title || src.url || `Source ${idx + 1}`;
      
      // Add domain badge
      const domain = src.domain || (src.url ? new URL(src.url).hostname.replace('www.', '') : '');
      if (domain) {
        const badge = document.createElement('span');
        badge.className = 'source-domain-badge';
        badge.textContent = domain;
        link.appendChild(badge);
      }
      
      li.appendChild(link);
      
      // Add snippet
      if (src.snippet) {
        const snippet = document.createElement('div');
        snippet.className = 'source-snippet';
        snippet.textContent = src.snippet;
        li.appendChild(snippet);
      }
      
      list.appendChild(li);
    });
    
    root.appendChild(list);
    
    // Scroll into view smoothly
    setTimeout(() => {
      root.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
    
    console.log(`✅ Rendered ${sources.length} sources`);
  };
  
  // ===== 3. INLINE SOURCES IN FORMATTED RESULTS =====
  const enhancedFormatResults = (data) => {
    const formatted = document.getElementById("resultsFormatted");
    if (!formatted) return;
    
    const verdict = data?.structured?.proof?.verdict || "UNKNOWN";
    const confidence = (data?.structured?.proof?.confidence || 0) * 100;
    const reasons = data?.structured?.proof?.reasons || [];
    const sources = data?.structured?.proof?.sources || [];
    const mode = data?.mode || "local";

    let modeBadge = `<span class="mode-badge ${mode === "hybrid" ? "hybrid" : "local"}">${mode === "hybrid" ? "Hybrid" : "Local"}</span>`;
    
    let html = `
      <div class="result-verdict verdict-${verdict.toLowerCase()}">
        <strong>Verdict:</strong> ${verdict} ${modeBadge}
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

    // ADD SOURCES INLINE
    if (sources.length > 0) {
      html += `<div class="result-sources">`;
      html += `<strong>📚 Sources <span class="source-count-badge">${sources.length}</span></strong>`;
      html += `<ol style="margin: 0; padding-left: 20px; font-size: 13px;">`;
      
      sources.forEach((src, idx) => {
        const domain = src.domain || (src.url ? new URL(src.url).hostname.replace('www.', '') : '');
        html += `<li>`;
        html += `<a href="${src.url || '#'}" target="_blank" rel="noopener noreferrer">`;
        html += `${src.title || src.url || 'Source ' + (idx + 1)}`;
        if (domain) {
          html += `<span class="source-domain-badge">${domain}</span>`;
        }
        html += `</a>`;
        if (src.snippet) {
          html += `<div class="source-snippet">${src.snippet}</div>`;
        }
        html += `</li>`;
      });
      
      html += `</ol></div>`;
    }

    formatted.innerHTML = html;
    document.getElementById("results").classList.remove("hidden");
  };
  
  // ===== 4. HOOK INTO VERIFY BUTTON =====
  const patchVerifyButton = () => {
    const btnVerify = document.getElementById('btnVerify');
    if (!btnVerify || btnVerify.__sourcesPatched) return;
    
    const originalClick = btnVerify.onclick;
    
    btnVerify.onclick = async function(e) {
      // Call original handler
      if (originalClick) {
        await originalClick.call(this, e);
      }
      
      // Wait for LAST to be populated
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (window.LAST && window.LAST.structured) {
        enhancedFormatResults(window.LAST);
        renderSourcesEnhanced(window.LAST.structured);
      }
    };
    
    btnVerify.__sourcesPatched = true;
    console.log('✅ Patched verify button');
  };
  
  // ===== 5. HOOK INTO EVIDENCE BUTTON =====
  const patchEvidenceButton = () => {
    const btnEvidence = document.getElementById('btnEvidence');
    if (!btnEvidence || btnEvidence.__sourcesPatched) return;
    
    const originalClick = btnEvidence.onclick;
    
    btnEvidence.onclick = async function(e) {
      if (originalClick) {
        await originalClick.call(this, e);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const payload = window.lastEvidencePayload || window.LAST?.structured;
      if (payload) {
        renderSourcesEnhanced(payload);
      }
    };
    
    btnEvidence.__sourcesPatched = true;
    console.log('✅ Patched evidence button');
  };
  
  // ===== 6. AUTO-RENDER EXISTING DATA =====
  const renderExisting = () => {
    const structured = window.LAST?.structured || window.lastEvidencePayload;
    if (structured && structured.proof && structured.proof.sources) {
      console.log('Found existing data, rendering...');
      enhancedFormatResults(window.LAST || { structured });
      renderSourcesEnhanced(structured);
    }
  };
  
  // ===== 7. EXPOSE MANUAL TRIGGER =====
  window.showSources = () => {
    const structured = window.LAST?.structured || window.lastEvidencePayload;
    if (structured) {
      renderSourcesEnhanced(structured);
    } else {
      console.warn('No data available. Run a verification first.');
    }
  };
  
  // ===== EXECUTE ALL PATCHES =====
  try {
    injectCSS();
    patchVerifyButton();
    patchEvidenceButton();
    
    // Override global functions
    window.formatResults = enhancedFormatResults;
    window.renderSources = renderSourcesEnhanced;
    window.__renderSourcesNow = renderSourcesEnhanced;
    
    // Try to render existing data
    renderExisting();
    
    console.log('✅ Complete Sources Integration Successful!');
    console.log('💡 Sources will now appear automatically after every verification');
    console.log('💡 Manual trigger: showSources()');
    
    // Add a notification
    const notice = document.createElement('div');
    notice.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea, #764ba2);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      z-index: 9999;
      font-weight: 600;
      animation: slideIn 0.3s ease-out;
    `;
    notice.textContent = '✅ Sources display enabled!';
    document.body.appendChild(notice);
    
    setTimeout(() => {
      notice.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => notice.remove(), 300);
    }, 3000);
    
  } catch (e) {
    console.error('❌ Integration failed:', e);
  }
})();
