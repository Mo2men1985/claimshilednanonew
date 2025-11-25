(function(){
  function tryPaint(){
    const s = window.LAST?.structured?.proof?.sources;
    if (Array.isArray(s) && s.length){
      try { window.CS_setSources?.(s); } catch {}
      return true;
    }
    return false;
  }
  const iv = setInterval(() => { if (tryPaint()) clearInterval(iv); }, 300);
  setTimeout(() => { tryPaint(); }, 2500);
})();
