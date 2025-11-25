(function (global) {
  function normalizeText(text) {
    return (text || '').trim();
  }

  function csHeuristicRouteClaim(claimText) {
    const text = normalizeText(claimText).toLowerCase();
    const res = {
      topLabel: 'other_or_ambiguous',
      topScore: 0.4,
      scores: {},
      isTemporal: false
    };

    const categoryMatchers = [
      {
        label: 'job_market_or_employment',
        patterns: [/job market/, /employment/, /unemployment/, /layoff/, /hiring/, /workers?/, /demand for .*?professionals?/, /data science/, /data scientist/, /shortage of .*?workers?/]
      },
      {
        label: 'financial_markets_or_economy',
        patterns: [/stock market/, /nasdaq/, /s&p/, /inflation/, /gdp/, /econom/, /cpi/]
      },
      {
        label: 'politics_or_elections_or_policy',
        patterns: [/election/, /president/, /policy/, /congress/, /parliament/, /vote/]
      },
      {
        label: 'public_health_or_medicine',
        patterns: [/vaccine/, /covid/, /disease/, /medical/, /health/, /hospital/]
      },
      {
        label: 'technology_or_science',
        patterns: [/ai\b/, /artificial intelligence/, /quantum/, /space/, /rocket/, /physics/, /biology/, /chemistry/]
      }
    ];

    categoryMatchers.forEach((entry) => {
      const matched = entry.patterns.some((pat) => pat.test(text));
      if (matched) {
        res.topLabel = entry.label;
        res.topScore = 0.8;
        res.scores[entry.label] = res.topScore;
      }
    });

    // temporal detection
    const temporalPattern = /20(2[3-9]|3[0-9])/;
    const temporalWords = /(currently|recently|as of|this year|this month|today|now|increasing)/;
    if (
      temporalPattern.test(text) ||
      temporalWords.test(text) ||
      ['job_market_or_employment', 'financial_markets_or_economy', 'politics_or_elections_or_policy'].includes(res.topLabel)
    ) {
      res.isTemporal = true;
    }

    return res;
  }

  function csComputeRoutingPolicy(routerDecision) {
    const policy = {
      evidenceMode: 'wiki-first',
      abstainLean: 'normal',
      routerCategory: routerDecision.topLabel,
      routerConfidence: routerDecision.topScore,
      routerIsTemporal: routerDecision.isTemporal
    };

    if (routerDecision.topLabel === 'job_market_or_employment' && routerDecision.isTemporal) {
      policy.evidenceMode = 'web-first';
      policy.abstainLean = 'cautious';
    } else if (routerDecision.topLabel === 'financial_markets_or_economy') {
      policy.evidenceMode = 'mixed';
      policy.abstainLean = 'cautious';
    }

    return policy;
  }

  function mergeSources(primary = [], secondary = []) {
    const seen = new Set();
    const merged = [];
    [primary, secondary].forEach((arr) => {
      arr.forEach((src) => {
        if (!seen.has(src.url)) {
          seen.add(src.url);
          merged.push(src);
        }
      });
    });
    return merged;
  }

  async function classifyWithGemini(claimText, { wikiHits = [], fetchWebSearch = null } = {}) {
    const claim = normalizeText(claimText);
    const routerDecision = (global.csRouteClaim && global.csRouteClaim(claim)) || csHeuristicRouteClaim(claim);
    const routingPolicy = csComputeRoutingPolicy(routerDecision);

    const proof = {
      verdict: 'NEEDS_REVIEW',
      sources: [],
      reasons: [],
      flags: {
        outdated_model: true,
        future_event: routingPolicy.routerIsTemporal || false
      }
    };

    const wikiSources = global.csFilterWikiHitsByOverlap
      ? global.csFilterWikiHitsByOverlap(wikiHits, claim)
      : [];

    proof.sources = mergeSources(wikiSources, []);

    const shouldUseWeb =
      (['web-first', 'mixed'].includes(routingPolicy.evidenceMode) || (routingPolicy.evidenceMode === 'wiki-first' && wikiSources.length === 0)) &&
      routingPolicy.routerIsTemporal &&
      global.csSettings &&
      global.csSettings.get('useWebSearch') &&
      global.csSettings.get('googleApiKey') &&
      global.csSettings.get('googleSearchEngineId') &&
      !proof.flags.web_search_used;

    let webSources = [];
    if (shouldUseWeb) {
      const searchFn = fetchWebSearch || global.csFetchWebSearch;
      if (searchFn) {
        webSources = await searchFn(claim);
        if (webSources.length > 0) {
          proof.flags.web_search_used = true;
          proof.reasons.unshift(
            '🌐 Online web search was used because Wikipedia evidence was weak or tangential for this time-sensitive claim.'
          );
        }
      }
    }

    if (webSources.length > 0) {
      proof.sources = mergeSources(webSources, proof.sources);
    }

    proof.flags.routerCategory = routingPolicy.routerCategory;
    proof.flags.routerEvidenceMode = routingPolicy.evidenceMode;
    proof.flags.routerIsTemporal = routingPolicy.routerIsTemporal;
    proof.flags.routerConfidence = routingPolicy.routerConfidence;
    proof.flags.routerAbstainLean = routingPolicy.abstainLean;

    return { claim, proof, routingPolicy };
  }

  const api = {
    csHeuristicRouteClaim,
    csComputeRoutingPolicy,
    classifyWithGemini
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    Object.assign(global, api);
  }
})(typeof window !== 'undefined' ? window : globalThis);
