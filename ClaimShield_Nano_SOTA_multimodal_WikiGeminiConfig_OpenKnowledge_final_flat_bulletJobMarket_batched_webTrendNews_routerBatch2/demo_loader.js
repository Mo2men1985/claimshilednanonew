(function(){
  try {
    const params = new URLSearchParams(location.search);
    const demo = params.get('demo');
    if (demo === '1' || demo === 'true') {
      const scripts = ['test_verification_with_sources.js','complete_sources_demo.js'];
      scripts.forEach(src => {
        const s=document.createElement('script');
        s.src=src; s.async=false; document.body.appendChild(s);
      });
      console.log('🧪 Demo mode enabled: loaded test/demo scripts.');
    } else {
      console.log('Demo mode off (add ?demo=1 to popup.html to enable).');
    }
  } catch (e) { console.warn('demo_loader init failed', e); }
})();