// query_guard.js — sanitize & dedupe every call into evidenceFetchSnippets and search()
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

  const seen = new Set();
  function shouldRun(q){
    if (!q) return false;
    if (q.includes("[object Object]")) return false;
    if (seen.has(q)) return false;
    seen.add(q);
    setTimeout(()=>seen.delete(q), 5000);
    return true;
  }

  function wrapFn(obj, name){
    const orig = obj[name];
    if (typeof orig !== "function") return false;
    if (orig.__wrapped_by_guard) return true;
    const wrapped = async function(q, ...rest){
      const s = sanitize(q);
      if (!s || !shouldRun(s)) return [];
      try { return await orig.call(this, s, ...rest); }
      catch(e){ console.warn(`[guard] ${name} failed`, e); return []; }
    };
    wrapped.__wrapped_by_guard = true;
    obj[name] = wrapped;
    return true;
  }

  function install(){
    let ok = false;
    if (window && typeof window === "object"){
      if (window.evidenceFetchSnippets) ok = wrapFn(window, "evidenceFetchSnippets") || ok;
      if (window.search)                ok = wrapFn(window, "search")                || ok;
    }
    return ok;
  }

  if (!install()){
    const hook = (target, prop) => {
      let _v = target[prop];
      Object.defineProperty(target, prop, {
        configurable: true,
        get(){ return _v; },
        set(nv){ _v = nv; setTimeout(install, 0); }
      });
    };
    try { hook(window, "evidenceFetchSnippets"); } catch {}
    try { hook(window, "search"); } catch {}
    const iv = setInterval(()=>{ if (install()) clearInterval(iv); }, 100);
  }
})();
