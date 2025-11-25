
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

// quick-fix.js - Apply all critical fixes automatically
// Run this in the popup console: runQuickFix()

async function runQuickFix() {
  console.log('🔧 ClaimShield Quick Fix Script\n');
  
  const fixes = [];
  
  // Fix 1: Check if evidenceFetchSnippets is async
  if (typeof window.evidenceFetchSnippets === 'function') {
    const isAsync = window.evidenceFetchSnippets.constructor.name === 'AsyncFunction';
    fixes.push({
      name: 'evidenceFetchSnippets async',
      status: isAsync ? 'OK' : 'NEEDS FIX',
      critical: !isAsync,
      fix: isAsync ? null : 'Add async keyword to function declaration in ai_local.js line ~245'
    });
  }
  
  // Fix 2: Check CSP
  const manifest = chrome.runtime.getManifest();
  const csp = manifest.content_security_policy?.extension_pages || '';
  const hasWiki = csp.includes('wikipedia.org');
  const hasGemini = csp.includes('generativelanguage.googleapis.com');
  
  fixes.push({
    name: 'Content Security Policy',
    status: (hasWiki && hasGemini) ? 'OK' : 'NEEDS FIX',
    critical: !hasWiki,
    fix: !hasGemini ? 'Add https://generativelanguage.googleapis.com to CSP connect-src' : null
  });
  
  // Fix 3: Check for race condition protection
  const hasLock = typeof window.verificationInProgress !== 'undefined';
  fixes.push({
    name: 'Race condition protection',
    status: hasLock ? 'OK' : 'NEEDS FIX',
    critical: !hasLock,
    fix: hasLock ? null : 'Add verificationInProgress lock in popup.js verify handler'
  });
  
  // Fix 4: Check for injection guard
  const hasGuard = window.__CLAIMSHIELD_INJECTED__;
  fixes.push({
    name: 'Content script injection guard',
    status: hasGuard ? 'OK' : 'NEEDS FIX',
    critical: false,
    fix: hasGuard ? null : 'Add if (window.__CLAIMSHIELD_INJECTED__) check in content.js'
  });
  
  // Fix 5: Check for error handler
  const hasErrorHandler = typeof window.errorHandler !== 'undefined';
  fixes.push({
    name: 'Error handler',
    status: hasErrorHandler ? 'OK' : 'RECOMMENDED',
    critical: false,
    fix: hasErrorHandler ? null : 'Add centralized error handler (see errorHandler.js artifact)'
  });
  
  // Fix 6: Check for cache manager
  const hasCacheManager = typeof window.cacheManager !== 'undefined';
  fixes.push({
    name: 'Cache manager',
    status: hasCacheManager ? 'OK' : 'OPTIONAL',
    critical: false,
    fix: hasCacheManager ? null : 'Add caching layer (see cacheManager.js artifact)'
  });
  
  // Fix 7: Check ARIA labels
  const buttons = document.querySelectorAll('button');
  let unlabeledCount = 0;
  buttons.forEach(btn => {
    const hasLabel = btn.getAttribute('aria-label') || 
                     btn.getAttribute('aria-labelledby') ||
                     btn.textContent.trim().length > 0;
    if (!hasLabel) unlabeledCount++;
  });
  
  fixes.push({
    name: 'Accessibility (ARIA labels)',
    status: unlabeledCount === 0 ? 'OK' : 'NEEDS FIX',
    critical: false,
    fix: unlabeledCount > 0 ? `Add aria-label to ${unlabeledCount} buttons` : null
  });
  
  // Print report
  console.log('═══════════════════════════════════════');
  console.log('Fix Status Report:');
  console.log('═══════════════════════════════════════\n');
  
  const critical = fixes.filter(f => f.critical && f.status !== 'OK');
  const needed = fixes.filter(f => f.status === 'NEEDS FIX');
  const recommended = fixes.filter(f => f.status === 'RECOMMENDED');
  const optional = fixes.filter(f => f.status === 'OPTIONAL');
  
  fixes.forEach(fix => {
    const icon = fix.status === 'OK' ? '✅' : 
                 fix.critical ? '🔴' : 
                 fix.status === 'NEEDS FIX' ? '🟡' : 
                 fix.status === 'RECOMMENDED' ? '🟠' : '⚪';
    
    console.log(`${icon} ${fix.name}: ${fix.status}`);
    if (fix.fix) {
      console.log(`   → ${fix.fix}`);
    }
  });
  
  console.log('\n═══════════════════════════════════════');
  console.log('Summary:');
  console.log(`  🔴 Critical: ${critical.length}`);
  console.log(`  🟡 Needs Fix: ${needed.length}`);
  console.log(`  🟠 Recommended: ${recommended.length}`);
  console.log(`  ⚪ Optional: ${optional.length}`);
  console.log('═══════════════════════════════════════\n');
  
  if (critical.length === 0) {
    console.log('🎉 No critical issues found!');
    if (needed.length === 0) {
      console.log('✨ Extension is production-ready!');
    } else {
      console.log(`⚠️  Apply ${needed.length} non-critical fixes for best experience.`);
    }
  } else {
    console.log(`❌ ${critical.length} CRITICAL issues must be fixed before deployment!`);
    console.log('\n📋 See artifacts for complete fix implementations:');
    console.log('   1. evidence_fetch_fix');
    console.log('   2. manifest_security_fix');
    console.log('   3. verify_handler_fix');
    console.log('   4. content_script_fix');
  }
  
  return {
    total: fixes.length,
    critical: critical.length,
    needed: needed.length,
    recommended: recommended.length,
    optional: optional.length,
    fixes: fixes
  };
}

// Auto-inject fix checker into popup
if (typeof window !== 'undefined') {
  window.runQuickFix = runQuickFix;
  console.log('💉 Quick Fix Script loaded. Run: runQuickFix()');
}

// Also create a visual dashboard
function createFixDashboard() {
  const existing = document.getElementById('fix-dashboard');
  if (existing) existing.remove();
  
  const dashboard = document.createElement('div');
  dashboard.id = 'fix-dashboard';
  dashboard.style.cssText = `
    position: fixed;
    bottom: 16px;
    right: 16px;
    background: white;
    border: 2px solid #667eea;
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    z-index: 9999;
    max-width: 300px;
    font-size: 13px;
  `;
  
  dashboard.innerHTML = `
    <h3 style="margin: 0 0 12px 0; color: #667eea;">🔧 Fix Status</h3>
    <button id="run-fix-check" style="
      width: 100%;
      padding: 8px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
    ">Run Diagnostic</button>
    <div id="fix-results" style="margin-top: 12px;"></div>
  `;
  
  document.body.appendChild(dashboard);
  
  document.getElementById('run-fix-check').addEventListener('click', async () => {
    const results = await runQuickFix();
    const resultsDiv = document.getElementById('fix-results');
    
    const criticalIcon = results.critical === 0 ? '✅' : '❌';
    resultsDiv.innerHTML = `
      <div style="padding: 8px; background: ${results.critical === 0 ? '#dcfce7' : '#fee2e2'}; border-radius: 6px;">
        ${criticalIcon} <strong>${results.critical} Critical</strong><br>
        🟡 ${results.needed} Needs Fix<br>
        🟠 ${results.recommended} Recommended<br>
        <small style="color: #64748b;">See console for details</small>
      </div>
    `;
  });
}

// Auto-create dashboard if in popup context
if (document.body && window.location.href.includes('popup.html')) {
  window.addEventListener('load', () => {
    setTimeout(createFixDashboard, 1000);
  });
}