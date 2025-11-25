// request_sanitizer.js — last‑line defense: fix bad srsearch queries & dedupe at the network layer
(function(){
  function sanitize(q){
    try{
      if (typeof q === "string") return q.trim().replace(/\s+/g, " ");
      if (q && typeof q.text === "string") return q.text.trim().replace(/\s+/g, " ");
      if (q && typeof q === "object") {
        if (typeof q.summary === "string") return q.summary.trim().replace(/\s+/g, " ");
        if (typeof q.claim === "string")   return q.claim.trim().replace(/\s+/g, " ");
      }
    }catch{}
    return "";
  }

  function fixSrsearch(u){
    try{
      const url = new URL(u, location.href);
      if (!/\.wikipedia\.org\/w\/api\.php$/.test(url.pathname)) return u;
      const q = url.searchParams.get("srsearch");
      if (!q) return u;
      const s = sanitize(q);
      if (!s || s.includes("[object Object]")) {
        // drop the param entirely if unusable to avoid garbage requests
        url.searchParams.delete("srsearch");
        // Optionally put a tiny safe term to avoid 400s
        // url.searchParams.set("srsearch", "data");
      } else if (s !== q) {
        url.searchParams.set("srsearch", s);
      }
      return url.toString();
    }catch(e){ return u; }
  }

  // Dedupe recent exact URLs (5s window)
  const seen = new Set();
  function mark(u){
    seen.add(u);
    setTimeout(()=>seen.delete(u), 5000);
  }
  function shouldSend(u){
    return !seen.has(u);
  }

  // Patch fetch
  try{
    const _fetch = window.fetch;
    if (typeof _fetch === "function"){
      window.fetch = function(input, init){
        try{
          if (typeof input === "string"){
            const fixed = fixSrsearch(input);
            if (fixed !== input){
              if (!shouldSend(fixed)) return Promise.resolve(new Response(new Blob([JSON.stringify({ skipped:true })]), { status: 200 }));
              mark(fixed);
              return _fetch.call(this, fixed, init);
            }
            if (!shouldSend(input)) return Promise.resolve(new Response(new Blob([JSON.stringify({ skipped:true })]), { status: 200 }));
            mark(input);
          } else if (input && input.url){
            const fixed = fixSrsearch(input.url);
            if (fixed !== input.url) input = new Request(fixed, input);
            if (!shouldSend(input.url)) return Promise.resolve(new Response(new Blob([JSON.stringify({ skipped:true })]), { status: 200 }));
            mark(input.url);
          }
        }catch{}
        return _fetch.call(this, input, init);
      };
    }
  }catch{}

  // Patch XHR
  try{
    const X = XMLHttpRequest;
    if (X && X.prototype && typeof X.prototype.open === "function"){
      const _open = X.prototype.open;
      X.prototype.open = function(method, url, async, user, password){
        try { url = fixSrsearch(url); } catch {}
        return _open.call(this, method, url, async, user, password);
      };
    }
  }catch{}

  try{ console.log("[ClaimShield] request_sanitizer active"); }catch{}
})();
