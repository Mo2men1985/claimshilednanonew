// risk_guard.js
// Lightweight risk / hallucination guard for ClaimShield.

(function () {
  'use strict';

  /**
   * Compute a risk score and reasons based on:
   * - verdict / confidence
   * - evidence sources count
   * - authority / recency of sources
   * - temporal flags / model availability
   */
  function assess(structured) {
    const reasons = [];
    let score = 0.5; // base risk

    if (!structured || typeof structured !== 'object') {
      return { score: 0.7, label: 'high', reasons: ['No structured result available.'] };
    }

    const proof = structured.proof || {};
    const flags = structured.flags || proof.flags || {};

    const verdict = structured.verdict || proof.verdict || 'ABSTAIN';
    const confidence = typeof structured.confidence === 'number'
      ? structured.confidence
      : (typeof proof.confidence === 'number' ? proof.confidence : 0.5);

    const sources = Array.isArray(proof.sources) ? proof.sources : [];

    // Try to infer the main claim text for domain-specific messaging
    const textBlob = [
      structured.summary,
      structured.text,
      proof.summary,
      structured.claims && structured.claims[0] && structured.claims[0].text
    ].filter(Boolean).join(' ').toLowerCase();

    // Heuristic: job-market / demand claims, especially about data science
    const looksJobMarket =
      /\b(data\s*scientist|data\s*science)\b/.test(textBlob) &&
      /\b(demand|employment|job\s*market|hiring|growth|rising|shortage)\b/.test(textBlob);


    // 1) Verdict + confidence shaping
    if (verdict === 'ABSTAIN') {
      score += 0.1;
      reasons.push('Model abstained on this claim.');
    } else if (verdict === 'NEEDS_REVIEW') {
      score += 0.1;
      reasons.push('Model requested human review.');
    }

    if (confidence < 0.6) {
      score += 0.1;
      reasons.push('Low model confidence.');
    } else if (confidence >= 0.85 && verdict === 'OK') {
      score -= 0.05;
      reasons.push('High model confidence for an OK verdict.');
    }

    // 2) Model availability flags
    if (flags.outdated_model) {
      score += 0.1;
      reasons.push('Local model may be outdated for this claim.');
    }
    if (flags.no_model_available) {
      score += 0.15;
      reasons.push('Local model was unavailable; only evidence mode was used.');
    }

    // 3) Evidence coverage: count sources
    const count = sources.length;
    if (count === 0) {
      score += 0.15;
      reasons.push('No external evidence sources available.');
    } else if (count === 1) {
      score += 0.05;
      reasons.push('Only one external source available.');
    } else if (count >= 3) {
      score -= 0.05;
      reasons.push('Multiple independent sources available.');
    }

    // 4) Authority + recency from sources (filled by source_scoring.js)
    let avgAuth = 0;
    let avgRec = 0;
    let highAuth = 0;
    let lowAuth = 0;

    sources.forEach((src) => {
      const a = typeof src.authority === 'number' ? src.authority : 0.5;
      const r = typeof src.recency === 'number' ? src.recency : 0.5;
      avgAuth += a;
      avgRec += r;
      const label = (src.authorityLabel || '').toLowerCase();
      if (label.indexOf('high') === 0) highAuth += 1;
      if (label.indexOf('low') === 0) lowAuth += 1;
    });

    if (count > 0) {
      avgAuth /= count;
      avgRec /= count;
    }

    if (count > 0) {
      if (avgAuth < 0.6) {
        score += 0.15;
        reasons.push('Evidence is mostly from low or unknown authority sources.');
      } else if (avgAuth >= 0.8 && highAuth >= 2) {
        score -= 0.1;
        reasons.push('Multiple high-authority sources support this claim.');
      }

      // Temporal sensitivity + recency
      const looksTemporal = !!flags.isTemporal;
      if (looksTemporal) {
        if (avgRec < 0.6) {
          score += 0.15;
          reasons.push('Time-sensitive claim, but evidence appears old or stale.');
        } else {
          reasons.push('Time-sensitive claim with reasonably recent evidence.');
        }
      }

      // Domain-specific clarification: job-market / demand claims
      if (looksJobMarket && flags.outdated_model) {
        reasons.push(
          'This is a job-market/demand claim. Current labour-market data may post-date the local model, so it cannot reliably confirm present demand levels.'
        );
      }
      if (looksJobMarket && avgAuth < 0.7) {
        reasons.push(
          'Available sources mostly define the field or discuss general trends, but do not provide strong, up-to-date statistics about current demand across sectors.'
        );
      }
    }

    // Optional strict mode: bias risk upward slightly when enabled
    try {
      const cfg = (typeof window !== 'undefined' && window.__CS_SETTINGS__) || {};
      if (cfg.strictRiskMode) {
        score = Math.min(1, score + 0.1);
        reasons.push('Strict risk mode is enabled (more conservative).');
      }
    } catch (_) {}

    // 5) Clamp score and assign label
    if (score < 0) score = 0;
    if (score > 1) score = 1;

    let label = 'medium';
    if (score <= 0.33) label = 'low';
    else if (score >= 0.66) label = 'high';

    return { score, label, reasons };
  }

  try {
    window.CS_RiskGuard = { assess: assess };
  } catch (_) {}
})();