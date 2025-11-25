(function (global) {
  function tokenize(text) {
    return (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  function buildClaimTokens(claimText) {
    const tokens = tokenize(claimText);
    const phrases = [];
    const joined = tokens.join(' ');
    const phrasePatterns = [
      /data\s+science/,
      /data\s+scientist/,
      /job\s+market/,
      /employment/, /unemployment/, /hiring/, /layoffs?/, /shortage/, /demand/,
      /workforce/, /talent/, /skills?\s+gap/,
    ];
    phrasePatterns.forEach((pat) => {
      if (pat.test(joined)) {
        phrases.push(pat.source.replace(/\\s\+/g, ' '));
      }
    });
    return new Set([...tokens, ...phrases]);
  }

  function overlapScore(hit, claimTokens) {
    const text = `${hit.title || ''} ${hit.snippet || ''}`.toLowerCase();
    let score = 0;
    claimTokens.forEach((tok) => {
      if (tok && text.includes(tok)) {
        score += tok.split(' ').length >= 2 ? 2 : 1;
      }
    });
    return score;
  }

  function csFilterWikiHitsByOverlap(rawHits = [], claimText = '') {
    const claimTokens = buildClaimTokens(claimText);
    const scored = rawHits.map((hit) => ({
      hit,
      score: overlapScore(hit, claimTokens)
    }));
    scored.sort((a, b) => b.score - a.score);
    if (global.csDebugWikiOverlap) {
      console.log('[ClaimShield] Wiki overlap scores', scored);
    }
    const filtered = scored.filter((entry) => entry.score > 0).map((entry, idx) => ({
      id: `wiki-${idx}`,
      pageid: entry.hit.pageid,
      title: entry.hit.title,
      snippet: entry.hit.snippet,
      url: entry.hit.url || `https://en.wikipedia.org/?curid=${entry.hit.pageid}`,
      sourceType: 'wiki',
      evidenceCategory: 'core_evidence'
    }));
    return filtered;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { csFilterWikiHitsByOverlap };
  } else {
    global.csFilterWikiHitsByOverlap = csFilterWikiHitsByOverlap;
  }

  if (typeof window === 'undefined') {
    // simple harness
    const sampleHits = [
      { pageid: 1, title: 'Data science', snippet: 'Data science is about data scientists.' },
      { pageid: 2, title: 'Nursing shortage', snippet: 'Shortage of nurses worldwide.' },
      { pageid: 3, title: 'Labor market', snippet: 'Employment and job market trends.' }
    ];
    const result = csFilterWikiHitsByOverlap(sampleHits, 'The demand for skilled data science practitioners is increasing');
    console.log('[ClaimShield harness] Filtered wiki hits', result);
  }
})(typeof window !== 'undefined' ? window : globalThis);
