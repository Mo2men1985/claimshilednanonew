(function(){
  function defaultRender() {
    // Ensure anchor exists
    var el = document.querySelector("#sources-list, #sources, .sources-list, .cs-sources");
    if (!el) {
      el = document.createElement("div");
      el.id = "sources-list";
      el.className = "cs-sources";
      el.style.minHeight = "60px";
      el.style.display = "block";
      (document.getElementById("results") || document.body).appendChild(el);
      try { console.log("✅ Created missing #sources-list anchor"); } catch(e) {}
    }

    // Read sources from state
    var items = (window.LAST && window.LAST.structured && window.LAST.structured.proof && window.LAST.structured.proof.sources) || [];
    el.innerHTML = "";
    if (!items || !items.length) return;

    var ul = document.createElement("ul");
    ul.style.margin = "8px 0";
    ul.style.padding = "0 16px";
    items.forEach(function(s){
      if (!s || !s.url) return;
      var li = document.createElement("li");
      li.style.margin = "6px 0";

      var a = document.createElement("a");
      a.href = s.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = s.title || s.url;

      var p = document.createElement("div");
      p.style.fontSize = "12px";
      p.style.opacity = "0.8";
      p.textContent = s.snippet || "";

      li.appendChild(a);
      if (p.textContent) li.appendChild(p);
      ul.appendChild(li);
    });
    el.appendChild(ul);
  }

  window.CS_setSources = function(arr) {
    var seen = Object.create(null);
    var merged = [];

    function add(x){
      if (!x || !x.url) return;
      if (seen[x.url]) return;
      seen[x.url] = 1;
      merged.push({
        title: (x.title || "").trim() || x.url,
        url: x.url,
        snippet: (x.snippet || x.extract || "").trim()
      });
    }

    // Merge incoming + existing
    (arr || []).forEach(add);
    var existing = (((window.LAST||{}).structured||{}).proof||{}).sources || [];
    existing.forEach(add);

    if (!merged.length) {
      try { add({ title: document.title || "Current Page", url: location.href, snippet: "" }); } catch(e) {}
    }

    window.LAST = window.LAST || {};
    var S = (window.LAST.structured = window.LAST.structured || {});
    var P = (S.proof = S.proof || {});
    P.sources = merged;

    try { defaultRender(); } catch(e) {}
  };

  // Expose renderer
  window.defaultRender = defaultRender;
})();
