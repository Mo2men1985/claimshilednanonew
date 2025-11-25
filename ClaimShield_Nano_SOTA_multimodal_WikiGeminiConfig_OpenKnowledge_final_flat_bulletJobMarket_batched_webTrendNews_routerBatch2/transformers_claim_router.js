// transformers_claim_router.js
// ES module: local claim router using Transformers.js zero-shot classification.
//
// Responsibilities:
// - Load Transformers.js from CDN.
// - Lazy-load a small zero-shot model: Xenova/nli-deberta-v3-xsmall.
// - Classify claims into coarse labels (job_market, finance, health, etc.).
// - Expose window.csRouteClaim(claimText) that returns:
//   { topLabel, topScore, scores, isTemporal }.

import { env, pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.0';

// We fetch models from CDN; no local model files.
env.allowLocalModels = false;

// Labels for zero-shot routing. These are purely for routing decisions.
const ROUTER_LABELS = [
  'job_market_or_employment',
  'financial_markets_or_economy',
  'public_health_or_medicine',
  'politics_or_elections_or_policy',
  'technology_or_science',
  'sports_or_entertainment',
  'evergreen_fact_or_definition',
  'breaking_news_or_recent_event',
  'other_or_ambiguous',
];

// Fallback temporal detector if window.csLooksTemporal is not available
function localLooksTemporal(text) {
  const t = String(text || '');
  // Simple heuristic: explicit years ≥ 2023 or phrases like "this year", "today" etc.
  if (/\b20(2[3-9]|3[0-9])\b/.test(t)) return true;
  if (/\b(this year|this month|this week|today|yesterday|recently)\b/i.test(t)) return true;
  return false;
}

// Lazy-load the zero-shot pipeline
let routerPipeline = null;

async function getRouterPipeline() {
  if (routerPipeline) return routerPipeline;

  console.log('[ClaimShield] Loading claim router model: Xenova/nli-deberta-v3-xsmall');

  routerPipeline = await pipeline(
    'zero-shot-classification',
    'Xenova/nli-deberta-v3-xsmall',
    {
      // You can experiment later with quantization / device settings.
      // e.g. { dtype: 'q8', device: 'webgpu' }
    }
  );

  return routerPipeline;
}

/**
 * Core router: classify a claim into coarse topical labels.
 *
 * @param {string} claimText
 * @returns {Promise<{
 *   topLabel: string,
 *   topScore: number,
 *   scores: Array<{ label: string, score: number }>,
 *   isTemporal: boolean
 * }>}
 */
export async function csRouteClaim(claimText) {
  const text = String(claimText || '').trim();

  if (!text) {
    const emptyDecision = {
      topLabel: 'other_or_ambiguous',
      topScore: 0,
      scores: [],
      isTemporal: false,
    };
    if (typeof window !== 'undefined') {
      window.csClaimRouterLast = emptyDecision;
      window.csRouteClaim = csRouteClaim;
    }
    return emptyDecision;
  }

  let classifier;
  try {
    classifier = await getRouterPipeline();
  } catch (e) {
    console.warn('[ClaimShield] Router model load failed:', e);
    const failDecision = {
      topLabel: 'other_or_ambiguous',
      topScore: 0,
      scores: [],
      isTemporal: localLooksTemporal(text),
    };
    if (typeof window !== 'undefined') {
      window.csClaimRouterLast = failDecision;
      window.csRouteClaim = csRouteClaim;
    }
    return failDecision;
  }

  let result;
  try {
    result = await classifier(text, ROUTER_LABELS, {
      multi_label: false, // we just want the dominant route
    });
  } catch (e) {
    console.warn('[ClaimShield] Router classification failed:', e);
    const failDecision = {
      topLabel: 'other_or_ambiguous',
      topScore: 0,
      scores: [],
      isTemporal: localLooksTemporal(text),
    };
    if (typeof window !== 'undefined') {
      window.csClaimRouterLast = failDecision;
      window.csRouteClaim = csRouteClaim;
    }
    return failDecision;
  }

  const labels = Array.isArray(result.labels) ? result.labels : [];
  const scores = Array.isArray(result.scores) ? result.scores : [];

  const zipped = labels.map((label, i) => ({
    label,
    score: typeof scores[i] === 'number' ? scores[i] : 0,
  }));

  const [top] = zipped;
  const topLabel = top ? top.label : 'other_or_ambiguous';
  const topScore = top ? top.score : 0;

  // Prefer your existing temporal detector if present.
  let isTemporal = false;
  try {
    if (typeof window !== 'undefined' && typeof window.csLooksTemporal === 'function') {
      isTemporal = !!window.csLooksTemporal(text);
    } else {
      isTemporal = localLooksTemporal(text);
    }
  } catch (e) {
    console.warn('[ClaimShield] Router temporal check failed:', e);
    isTemporal = localLooksTemporal(text);
  }

  const decision = {
    topLabel,
    topScore,
    scores: zipped,
    isTemporal,
  };

  // Expose last decision for console inspection / future debug panel.
  if (typeof window !== 'undefined') {
    window.csClaimRouterLast = decision;
    window.csRouteClaim = csRouteClaim;
  }

  return decision;
}

// Also attach to window for safety if script executes before export is used.
if (typeof window !== 'undefined') {
  window.csRouteClaim = csRouteClaim;
}
