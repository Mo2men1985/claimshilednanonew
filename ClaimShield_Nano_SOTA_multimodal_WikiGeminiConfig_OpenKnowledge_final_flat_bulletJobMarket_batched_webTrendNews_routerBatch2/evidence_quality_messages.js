// evidence_quality_messages.js
// Generate user-friendly explanations for evidence quality

(function() {
  'use strict';

  /**
   * Analyze why evidence is weak and suggest improvements
   */
  function analyzeEvidenceQuality(structured) {
    const issues = [];
    const suggestions = [];
    
    const proof = structured?.proof || {};
    const sources = proof.sources || [];
    const flags = proof.flags || {};
    const claim = structured?.summary || structured?.text || '';
    
    // Issue 1: No sources
    if (sources.length === 0) {
      issues.push('No external evidence sources available');
      suggestions.push('Try rephrasing your claim to be more specific');
      suggestions.push('Check if this is about very recent events (past few days)');
    }
    
    // Issue 2: Only one source
    if (sources.length === 1) {
      issues.push('Only one external source available');
      suggestions.push('Multiple independent sources strengthen verification');
    }
    
    // Issue 3: Low authority sources
    const avgAuthority = sources.reduce((sum, s) => sum + (s.authority || 0.5), 0) / (sources.length || 1);
    if (avgAuthority < 0.6) {
      issues.push('Evidence is mostly from low or unknown authority sources');
      
      // Detect claim type and suggest appropriate sources
      if (/\b(job|employment|hiring|demand|salary|occupation)\b/i.test(claim)) {
        suggestions.push('For job market claims, try: Bureau of Labor Statistics (bls.gov), LinkedIn reports');
      }
      if (/\b(health|disease|vaccine|medical|treatment)\b/i.test(claim)) {
        suggestions.push('For health claims, try: WHO (who.int), PubMed, CDC');
      }
      if (/\b(economic|GDP|inflation|unemployment|market)\b/i.test(claim)) {
        suggestions.push('For economic claims, try: World Bank, data.gov, OECD');
      }
    }
    
    // Issue 4: Sources don't match claim topic
    const claimKeywords = extractKeywords(claim);
    const sourceKeywords = sources.map(s => 
      extractKeywords(s.title + ' ' + s.snippet)
    ).flat();
    
    const overlap = claimKeywords.filter(k => sourceKeywords.includes(k)).length;
    const relevance = overlap / Math.max(claimKeywords.length, 1);
    
    if (relevance < 0.3) {
      issues.push('Sources appear tangentially related rather than directly addressing the claim');
      suggestions.push('Try making your claim more specific with proper nouns, dates, or locations');
      
      // Show what sources ARE about vs what claim is about
      const sourceTopics = inferTopics(sources);
      const claimTopics = inferTopics([{ snippet: claim }]);
      
      if (sourceTopics.length > 0 && claimTopics.length > 0) {
        issues.push(`Found sources about: ${sourceTopics.join(', ')} | Claim is about: ${claimTopics.join(', ')}`);
      }
    }
    
    // Issue 5: Temporal mismatch
    if (flags.isTemporal || flags.outdated_model) {
      const hasRecentSources = sources.some(s => (s.recency || 0) > 0.8);
      if (!hasRecentSources) {
        issues.push('Time-sensitive claim, but evidence appears old or stale');
        suggestions.push('For current events, check recent news sources directly');
        suggestions.push('Wikipedia often lags behind breaking news by hours or days');
      }
    }
    
    // Issue 6: Definitional sources instead of empirical
    const hasDefinitions = sources.some(s => 
      /wikipedia\.org.*wiki\/((?!Timeline|History|Statistics).)*$/i.test(s.url) &&
      !/(data|statistics|report|survey|study)/i.test(s.snippet)
    );
    
    if (hasDefinitions && /(growing|increasing|demand|trend|rise|decline)/i.test(claim)) {
      issues.push('Sources mostly define the topic rather than provide empirical data on trends');
      suggestions.push('For trend claims, look for: statistics, surveys, reports, time-series data');
    }
    
    return {
      hasIssues: issues.length > 0,
      issues,
      suggestions,
      relevanceScore: relevance,
      averageAuthority: avgAuthority
    };
  }

  /**
   * Extract meaningful keywords from text
   */
  function extractKeywords(text) {
    const stopwords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'are', 'was', 'were', 'be', 'been', 'being']);
    
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopwords.has(w))
      .slice(0, 10); // Top 10 keywords
  }

  /**
   * Infer topics from sources
   */
  function inferTopics(sources) {
    const topics = new Set();
    
    sources.forEach(src => {
      const text = ((src.title || '') + ' ' + (src.snippet || '')).toLowerCase();
      
      // Topic patterns
      if (/\b(data scien|machine learn|artificial intel|AI)\b/i.test(text)) {
        topics.add('Data Science/AI');
      }
      if (/\b(iran|tehran|persian)\b/i.test(text)) {
        topics.add('Iran');
      }
      if (/\b(economy|economic|GDP|trade|market)\b/i.test(text)) {
        topics.add('Economics');
      }
      if (/\b(university|education|academic|student)\b/i.test(text)) {
        topics.add('Education');
      }
      if (/\b(job|employment|hiring|occupation|workforce)\b/i.test(text)) {
        topics.add('Employment');
      }
    });
    
    return Array.from(topics);
  }

  /**
   * Generate user-friendly explanation
   */
  function generateExplanation(analysis) {
    if (!analysis.hasIssues) {
      return null;
    }
    
    let explanation = '**Why this verification is uncertain:**\n\n';
    
    analysis.issues.forEach((issue, i) => {
      explanation += `${i + 1}. ${issue}\n`;
    });
    
    if (analysis.suggestions.length > 0) {
      explanation += '\n**Suggestions to improve verification:**\n\n';
      analysis.suggestions.forEach((sug, i) => {
        explanation += `• ${sug}\n`;
      });
    }
    
    return explanation;
  }

  // Export to global scope
  try {
    window.CS_EvidenceQuality = {
      analyzeEvidenceQuality,
      generateExplanation,
      extractKeywords,
      inferTopics
    };
    
    console.log('✅ [Evidence Quality] Analysis module loaded');
  } catch (_) {}
})();

// Auto-attach to verification flow
document.addEventListener('DOMContentLoaded', () => {
  try {
    // Hook into formatResults to add explanation
    const originalFormat = window.formatResults;
    if (typeof originalFormat === 'function') {
      window.formatResults = function(data) {
        originalFormat.apply(this, arguments);
        
        // Add evidence quality explanation
        try {
          const analysis = window.CS_EvidenceQuality.analyzeEvidenceQuality(data?.structured);
          if (analysis && analysis.hasIssues) {
            const explanation = window.CS_EvidenceQuality.generateExplanation(analysis);
            
            // Insert explanation after verdict
            const resultsDiv = document.getElementById('resultsFormatted');
            if (resultsDiv && explanation) {
              const explDiv = document.createElement('div');
              explDiv.className = 'evidence-quality-explanation';
              explDiv.style.cssText = `
                background: #fef3c7;
                border: 1px solid #f59e0b;
                border-radius: 8px;
                padding: 12px;
                margin: 12px 0;
                font-size: 13px;
                line-height: 1.6;
              `;
              explDiv.innerHTML = explanation.replace(/\n/g, '<br>');
              resultsDiv.appendChild(explDiv);
            }
          }
        } catch (e) {
          console.warn('[Evidence Quality] Failed to add explanation:', e);
        }
      };
    }
  } catch (_) {}
});
