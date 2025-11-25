// hallucination_guard.js
// Lightweight hallucination / grounding detector for ClaimShield.

(function () {
  'use strict';

  /**
   * Analyze a structured result and attach hallucination-related flags.
   *
   * @param {Object} structured
   * @returns {Object} structured (mutated)
   *
   * Adds to structured.flags:
   *  - hallucinationScore ∈ [0,1]
   *  - hallucinationLabel: "Well grounded" | "Weakly grounded" | "Potential hallucination"
   *  - hallucination: boolean (true if potentially hallucinated)
   */
  function analyze(structured) {
    if (!structured || typeof structured !== 'object') return structured;

    const proof = structured.proof || {};
    const flags = structured.flags || proof.flags || {};
    const verdict = structured.verdict || proof.verdict || 'ABSTAIN';

    const confidence = typeof structured.confidence === 'number'
      ? structured.confidence
      : (typeof proof.confidence === 'number' ? proof.confidence : 0.5);

    const sources = Array.isArray(proof.sources) ? proof.sources : [];

    // Basic stats from sources
    let count = sources.length;
    let avgAuth = 0;
    let highAuth = 0;
    let lowAuth = 0;

    sources.forEach((src) => {
      const a = typeof src.authority === 'number' ? src.authority : 0.5;
      avgAuth += a;
      const label = (src.authorityLabel || '').toLowerCase();
      if (label.indexOf('high') === 0) highAuth += 1;
      if (label.indexOf('low') === 0) lowAuth += 1;
    });

    if (count > 0) {
      avgAuth /= count;
    }

    // ---- Heuristic: hallucination score ----
    // 0   = very well grounded
    // 0.5 = neutral
    // 1   = strong suspicion of hallucination
    let hScore = 0.5;

    // If we abstain and have no sources, treat as "unknown", not necessarily hallucinated.
    if (verdict === 'ABSTAIN' && count === 0) {
      hScore = 0.5;
    } else {
      // Big red flag: high-confidence OK with almost no / weak evidence
      if (verdict === 'OK' && confidence >= 0.8 && count === 0) {
        hScore += 0.3;
      }
      if (verdict === 'OK' && confidence >= 0.8 && count > 0 && avgAuth < 0.6) {
        hScore += 0.2;
      }

      // Moderate flag: non-abstain, low confidence, weak/low sources
      if (verdict !== 'ABSTAIN' && confidence < 0.6 && (count === 0 || avgAuth < 0.6)) {
        hScore += 0.2;
      }

      // Positive signal: multiple high-authority sources
      if (count >= 2 && avgAuth >= 0.75 && highAuth >= 2) {
        hScore -= 0.2;
      }

      // If model was unavailable, we are basing verdict only on evidence heuristics
      if (flags.no_model_available) {
        hScore += 0.1;
      }

      // Temporal: if claim looks temporal and evidence recency is low,
      // we slightly push towards hallucination suspicion
      const looksTemporal = !!flags.isTemporal;
      if (looksTemporal && count > 0) {
        let avgRec = 0;
        sources.forEach((src) => {
          const r = typeof src.recency === 'number' ? src.recency : 0.5;
          avgRec += r;
        });
        avgRec = avgRec / count;
        if (avgRec < 0.6) {
          hScore += 0.1;
        } else {
          hScore -= 0.05;
        }
      }
    }

    // Clamp to [0,1]
    if (hScore < 0) hScore = 0;
    if (hScore > 1) hScore = 1;

    let label = 'Weakly grounded';
    let hallucination = false;

    if (hScore <= 0.33) {
      label = 'Well grounded';
      hallucination = false;
    } else if (hScore >= 0.66) {
      label = 'Potential hallucination';
      hallucination = true;
    } else {
      label = 'Weakly grounded';
      hallucination = false;
    }

    // Attach to structured.flags (both top-level and proof.flags if they exist)
    const outFlags = Object.assign({}, flags, {
      hallucinationScore: hScore,
      hallucinationLabel: label,
      hallucination: hallucination
    });

    structured.flags = outFlags;
    if (structured.proof) {
      structured.proof.flags = outFlags;
    }

    return structured;
  }

  try {
    window.CS_HallucinationGuard = { analyze: analyze };
  } catch (_) {}
})();