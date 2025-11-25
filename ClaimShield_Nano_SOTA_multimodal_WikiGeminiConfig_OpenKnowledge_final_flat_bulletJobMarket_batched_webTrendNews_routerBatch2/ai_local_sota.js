
// === Wiki helpers (Rev 2.9.3) ===
function __wikiSummaryUrl(q){
  const title = (q||'').trim().replace(/\s+/g,'_');
  return `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
}
function __wikiPageUrlFromSummary(js, fallbackQuery){
  const rest = js?.content_urls?.desktop?.page || js?.content_urls?.mobile?.page;
  if (rest) return rest;
  const title = (js?.titles?.normalized || js?.title || fallbackQuery || '').trim().replace(/\s+/g,'_');
  return title ? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}` : '';
}
async function __fetchJson(url, timeoutMs=5000){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), timeoutMs);
  try{
    const r = await fetch(url, { signal: ctrl.signal });
    if(!r.ok) throw new Error(`HTTP ${r.status} @ ${url}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

function detectClaimTypes(text) {
  const types = [];
  let score = 0;
  
  for (const [type, pattern] of Object.entries(CLAIM_PATTERNS)) {
    if (pattern.test(text)) {
      types.push(type);
      score += type === 'statistical' ? 3 : 
               type === 'expert' ? 2 : 
               type === 'universal' ? 2 : 1;
    }
  }
  
  return { types, score };
}

function detectAdversarialPatterns(text) {
  const patterns = {
    emotionalManipulation: /\b(shocking|unbelievable|they don't want you to know|wake up|truth revealed)\b/gi,
    urgency: /\b(breaking|urgent|act now|limited time|hurry)\b/gi,
    sourceObfuscation: /\b(anonymous source|insider|leaked|confidential)\b/gi,
    hedging: /\b(some say|many believe|it's been reported|allegedly)\b/gi,
    memeFormat: /\d+ facts? (they|the government|big tech)/gi
  };
  
  const detected = {};
  let riskScore = 0;
  
  for (const [pattern, regex] of Object.entries(patterns)) {
    const matches = text.match(regex);
    if (matches) {
      detected[pattern] = matches.length;
      riskScore += matches.length * (pattern === 'emotionalManipulation' ? 2 : 1);
    }
  }
  
  return {
    hasAdversarialPatterns: riskScore > 0,
    riskScore,
    detectedPatterns: detected,
    recommendation: riskScore > 3 ? 'High risk - apply strict verification' : 
                   riskScore > 1 ? 'Moderate risk - cross-reference sources' :
                   'Low risk - standard verification'
  };
}

function calibrateConfidence(rawConfidence, context = {}) {
  let adjusted = rawConfidence;
  
  // Temporal recency boost
  if (context.hasRecentDate) {
    const ageInDays = context.sourceAgeInDays || 365;
    const recencyBonus = Math.max(0, 0.15 - (ageInDays / 365) * 0.15);
    adjusted += recencyBonus;
  }
  
  // Source diversity boost
  const uniqueSources = new Set(context.sources?.map(s => s.domain) || []).size;
  if (uniqueSources > 1) {
    adjusted += Math.min(0.20, uniqueSources * 0.05);
  }
  
  // High-quality source boost
  const hasGovSource = context.sources?.some(s => s.domain?.includes('.gov'));
  const hasEduSource = context.sources?.some(s => s.domain?.includes('.edu'));
  if (hasGovSource) adjusted += 0.10;
  if (hasEduSource) adjusted += 0.08;
  
  // Contradiction penalty
  if (context.hasContradictingSources) {
    adjusted *= 0.7;
  }
  
  // Claim type adjustments
  if (context.claimTypes?.includes('universal')) {
    adjusted *= 0.9; // Universal claims are harder to verify
  }
  if (context.claimTypes?.includes('statistical')) {
    adjusted += 0.05; // Statistical claims easier with data
  }
  
  return Math.max(0.1, Math.min(0.98, adjusted));
}

function __extractJSONFuzzy(text) {
  if (!text) return null;
  // Plain JSON
  try { return JSON.parse(text); } catch {}
  // ```json ... ``` or ``` ... ```
  const m = text.match(/```json\s*([\s\S]*?)\s*```/i) || text.match(/```\s*([\s\S]*?)\s*```/i);
  if (m) {
    const inner = m[1].trim();
    try { return JSON.parse(inner); } catch {}
    let fixed = inner.replace(/'(.*?)'/g, '"$1"').replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(fixed); } catch {}
  }
  // Slice between first { and last }
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s !== -1 && e !== -1 && e > s) {
    const slice = text.slice(s, e+1);
    try { return JSON.parse(slice); } catch {}
  }
  return null;
}


try {
  if (typeof window !== "undefined") {
    Object.assign(window, {
      ensureLanguageModelReady,
      createPromptSession,
      summarize,
      classifyWithStructuredOutput,
      classifyWithGemini,
      proofread,
      translate,
      writerDraft,
      checkVisionSupport,
      analyzeImageInput
    });
  }
} catch(_) {}
