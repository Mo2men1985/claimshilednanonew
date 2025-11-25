(function () {
  const keep = () => (window.LAST?.structured?.proof?.sources) || [];
  const merge = (a,b) => {
    const seen = new Set(); const out = [];
    [...(a||[]), ...(b||[])].forEach(it => {
      if (!it || !it.url) return;
      if (seen.has(it.url)) return;
      seen.add(it.url);
      out.push({ title: it.title || it.url, url: it.url, snippet: it.snippet || "" });
    });
    return out;
  };
  const original = window.formatResults;
  window.formatResults = function () {
    const before = keep();
    const r = original ? original.apply(this, arguments) : undefined;
    const after = keep();
    const merged = merge(before, after);
    if (merged.length) {
      window.CS_setSources?.(merged);
    }
    try { window.renderSources?.(); } catch {}
    return r;
  };
})();
