
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

// Export ProofCard → Markdown helper and sources renderer.

// Main export logic: reads JSON from the textarea, optionally loads demo
// data or from chrome.storage.local, and renders a Markdown proofcard.
(function(){
  const $ = id => document.getElementById(id);
  const src = $("src"), out = $("out");
  $("load").addEventListener("click", () => {
    chrome.storage.local.get(["lastProofCard"], (res) => {
      const v = res && res.lastProofCard;
      src.value = v ? (typeof v === "string" ? v : JSON.stringify(v, null, 2)) : "";
      if (!v) alert("Nothing found in storage under 'lastProofCard'. Paste instead.");
    });
  });
  $("demo").addEventListener("click", () => {
    src.value = JSON.stringify({
      claim: "Google acquired DeepMind in 2014.",
      verdict: "supported",
      citations: [
        { title: "Wikipedia: DeepMind", url: "https://en.wikipedia.org/wiki/DeepMind", snippet: "In January 2014, Google announced it had acquired DeepMind." }
      ],
      metrics: { CRI: 0.92, SAD: 0.08, tau: 0.87 },
      mode: "local",
      notes: "Short example ProofCard"
    }, null, 2);
  });
  $("toMd").addEventListener("click", () => {
    const raw = (src.value || "").trim();
    if (!raw) { alert("Paste something first."); return; }
    let obj = null, md = "";
    try { obj = JSON.parse(raw); } catch (e) {}
    if (obj && typeof obj === "object") {
      const c = obj.claim || "";
      const v = obj.verdict || "";
      const m = obj.metrics || {};
      md += `# ProofCard\n\n`;
      md += `**Claim:** ${c}\n\n`;
      md += `**Verdict:** ${v}\n\n`;
      if (obj.mode) md += `**Mode:** ${obj.mode}\n\n`;
      if (m && (m.CRI || m.SAD || m.tau)) {
        md += `**Metrics:** CRI=${m.CRI ?? "-"}, SAD=${m.SAD ?? "-"}, τ=${m.tau ?? "-"}\n\n`;
      }
      if (Array.isArray(obj.citations) && obj.citations.length) {
        md += `## Citations\n`;
        obj.citations.forEach((ct, i) => {
          md += `- [${ct.title || ("Source " + (i + 1))}](${ct.url || "#"}) — ${ct.snippet || ""}\n`;
        });
        md += `\n`;
      }
      if (obj.notes) {
        md += `## Notes\n${obj.notes}\n\n`;
      }
      if (obj.debug) {
        md += `## Debug\n\n\`\`\`json\n${JSON.stringify(obj.debug, null, 2)}\n\`\`\``;
      }
    } else {
      md = "```\n" + raw + "\n```";
    }
    out.textContent = md;
  });
  $("clear").addEventListener("click", () => { src.value = ""; out.textContent = "–"; });
})();

// Sources renderer similar to the popup. It dynamically creates a section
// containing a list of sources based off of LAST.structured or a payload
// passed from the opener. This is idempotent.
function renderSources(structured) {
  try {
    const s = structured || (window.LAST && window.LAST.structured) || {};
    const sources = (s && s.proof && Array.isArray(s.proof.sources)) ? s.proof.sources : [];
    let root = document.getElementById("sources-root");
    if (!root) {
      root = document.createElement("section");
      root.id = "sources-root";
      const h = document.createElement("h2"); h.textContent = "Sources";
      const list = document.createElement("ol"); list.id = "sources-list";
      root.appendChild(h); root.appendChild(list);
      document.body.appendChild(root);
    }
    const list = root.querySelector("#sources-list"); list.innerHTML = "";
    sources.forEach(src => {
      const li = document.createElement("li");
      const a = document.createElement("a"); a.target = "_blank"; a.rel = "noopener";
      a.href = src.url || "#"; a.textContent = src.title || src.url || "Source";
      const p = document.createElement("p"); p.textContent = src.snippet || "";
      li.appendChild(a); li.appendChild(p); list.appendChild(li);
    });
  } catch (e) {
    console.warn("renderSources failed", e);
  }
}
// Expose a helper so other modules (like ai_local.js) can trigger a re-render
window.__renderSourcesNow = () => renderSources();
// Initialize sources on DOMContentLoaded. Attempt to fetch structured data
// from the opener (the popup window) if available.
document.addEventListener("DOMContentLoaded", () => {
  try {
    let payload;
    try {
      if (window.opener && typeof window.opener.buildSharePayload === "function") {
        payload = window.opener.buildSharePayload();
      }
    } catch (_) {}
    const structured = (payload && payload.structured) || (window.LAST && window.LAST.structured);
    renderSources(structured);
  } catch (_) { }
});