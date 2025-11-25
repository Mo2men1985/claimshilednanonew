(function (global) {
  async function csFetchWebSearch(query, { apiKey, searchEngineId, fetchImpl } = {}) {
    const key = apiKey || (global.csSettings && global.csSettings.get('googleApiKey'));
    const cx = searchEngineId || (global.csSettings && global.csSettings.get('googleSearchEngineId'));
    const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);

    if (!key || !cx || !doFetch) {
      console.log('[ClaimShield] Web search unavailable: missing key, cx, or fetch');
      return [];
    }

    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', key);
    url.searchParams.set('cx', cx);
    url.searchParams.set('q', query);

    try {
      const res = await doFetch(url.toString());
      const data = await res.json();
      const items = data.items || [];
      return items.map((item, idx) => {
        const publishDate = item.pagemap?.metatags?.[0]?.['article:published_time'] || null;
        let ageDays = null;
        if (publishDate) {
          const dt = new Date(publishDate);
          if (!isNaN(dt)) {
            ageDays = Math.floor((Date.now() - dt.getTime()) / (1000 * 60 * 60 * 24));
          }
        }
        return {
          id: `web-${idx}`,
          title: item.title,
          url: item.link,
          domain: (item.displayLink || '').replace(/^https?:\/\//, ''),
          snippet: item.snippet || '',
          publishDate: publishDate || null,
          ageDays,
          sourceType: 'web',
          evidenceCategory: 'core_evidence'
        };
      });
    } catch (err) {
      console.error('[ClaimShield] Web search failed', err);
      return [];
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { csFetchWebSearch };
  } else {
    global.csFetchWebSearch = csFetchWebSearch;
  }
})(typeof window !== 'undefined' ? window : globalThis);
