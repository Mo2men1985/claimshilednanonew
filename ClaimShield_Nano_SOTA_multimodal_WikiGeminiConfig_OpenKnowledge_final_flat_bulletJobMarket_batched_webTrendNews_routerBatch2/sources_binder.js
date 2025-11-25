// Stub binder — if the real binder is absent, push from Wikipedia into CS_setSources.
(function(){
  function push(items){
    try { window.CS_setSources && window.CS_setSources(items); } catch(e){}
  }
  try { if (window.__wiki_last_items && __wiki_last_items.length) push(__wiki_last_items); } catch(e){}
  try { console.log("[ClaimShield] sources_binder stub active"); } catch(e){}
})();
