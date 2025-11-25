// source_scoring_enhanced.js
// Enhanced authority and recency scoring for evidence sources

(function() {
  'use strict';

  // Domain authority mappings with categories
  const AUTHORITY_MAP = {
    // Government & Official Statistics (0.9-1.0)
    'bls.gov': { score: 1.0, category: 'GOVT', label: 'U.S. Bureau of Labor Statistics' },
    'census.gov': { score: 1.0, category: 'GOVT', label: 'U.S. Census Bureau' },
    'data.gov': { score: 0.95, category: 'GOVT', label: 'U.S. Government Open Data' },
    'europa.eu': { score: 0.95, category: 'GOVT', label: 'European Union' },
    'who.int': { score: 0.95, category: 'IGO', label: 'World Health Organization' },
    'un.org': { score: 0.95, category: 'IGO', label: 'United Nations' },
    'worldbank.org': { score: 0.95, category: 'IGO', label: 'World Bank' },
    
    // Academic & Research (0.8-0.9)
    'edu': { score: 0.85, category: 'EDU', label: 'Educational Institution' },
    'harvard.edu': { score: 0.9, category: 'EDU', label: 'Harvard University' },
    'mit.edu': { score: 0.9, category: 'EDU', label: 'MIT' },
    'stanford.edu': { score: 0.9, category: 'EDU', label: 'Stanford University' },
    'arxiv.org': { score: 0.85, category: 'RESEARCH', label: 'arXiv Preprints' },
    'doi.org': { score: 0.9, category: 'RESEARCH', label: 'DOI (Peer-reviewed)' },
    'pubmed.ncbi.nlm.nih.gov': { score: 0.9, category: 'RESEARCH', label: 'PubMed' },
    
    // Established News & Media (0.7-0.8)
    'reuters.com': { score: 0.8, category: 'NEWS', label: 'Reuters' },
    'apnews.com': { score: 0.8, category: 'NEWS', label: 'Associated Press' },
    'bbc.com': { score: 0.75, category: 'NEWS', label: 'BBC' },
    'nytimes.com': { score: 0.75, category: 'NEWS', label: 'New York Times' },
    
    // Industry & Professional (0.6-0.75)
    'linkedin.com': { score: 0.7, category: 'INDUSTRY', label: 'LinkedIn' },
    'stackoverflow.com': { score: 0.7, category: 'INDUSTRY', label: 'Stack Overflow' },
    'kaggle.com': { score: 0.7, category: 'INDUSTRY', label: 'Kaggle' },
    
    // Reference & Aggregators (0.6-0.7)
    'wikipedia.org': { score: 0.65, category: 'REFERENCE', label: 'Wikipedia' },
    'ourworldindata.org': { score: 0.75, category: 'REFERENCE', label: 'Our World in Data' },
    
    // General Web (0.3-0.5)
    'default': { score: 0.4, category: 'WEB', label: 'General Web Source' }
  };

  /**
   * Score source authority based on domain
   */
  function scoreAuthority(url) {
    try {
      if (!url || typeof url !== 'string') {
        return { score: 0.3, category: 'UNKNOWN', label: 'Unknown source' };
      }

      const hostname = new URL(url).hostname.replace(/^www\./, '');
      
      // Exact match
      if (AUTHORITY_MAP[hostname]) {
        return AUTHORITY_MAP[hostname];
      }
      
      // TLD match (.edu, .gov)
      if (hostname.endsWith('.gov')) {
        return { score: 0.9, category: 'GOVT', label: 'Government source' };
      }
      if (hostname.endsWith('.edu')) {
        return { score: 0.85, category: 'EDU', label: 'Educational institution' };
      }
      
      // Domain suffix match
      for (const [domain, info] of Object.entries(AUTHORITY_MAP)) {
        if (hostname.endsWith(domain)) {
          return info;
        }
      }
      
      return AUTHORITY_MAP.default;
    } catch (e) {
      console.warn('[Source Scoring] Authority scoring failed:', e);
      return AUTHORITY_MAP.default;
    }
  }

  /**
   * Score source recency based on publish date
   * Returns 0-1 where 1 is very recent
   */
  function scoreRecency(publishDate, claimDate = new Date()) {
    try {
      if (!publishDate) return 0.5; // Unknown = neutral
      
      const pubDate = new Date(publishDate);
      const daysSincePublish = Math.floor((claimDate - pubDate) / (1000 * 60 * 60 * 24));
      
      // Scoring curve:
      // 0-30 days: 1.0 (very recent)
      // 30-180 days: 0.9-0.7 (recent)
      // 180-365 days: 0.7-0.5 (moderately recent)
      // 1-3 years: 0.5-0.3 (dated)
      // 3+ years: 0.3-0.1 (old)
      
      if (daysSincePublish < 0) return 1.0; // Future date (likely error)
      if (daysSincePublish <= 30) return 1.0;
      if (daysSincePublish <= 180) return 0.9 - (daysSincePublish - 30) * 0.2 / 150;
      if (daysSincePublish <= 365) return 0.7 - (daysSincePublish - 180) * 0.2 / 185;
      if (daysSincePublish <= 1095) return 0.5 - (daysSincePublish - 365) * 0.2 / 730;
      
      return Math.max(0.1, 0.3 - (daysSincePublish - 1095) * 0.2 / 1095);
    } catch (e) {
      console.warn('[Source Scoring] Recency scoring failed:', e);
      return 0.5;
    }
  }

  /**
   * Assign labels based on scores
   */
  function assignLabels(authScore, recencyScore) {
    const authLabel = authScore >= 0.8 ? 'High authority' :
                      authScore >= 0.6 ? 'Medium authority' :
                      authScore >= 0.4 ? 'Low authority' :
                      'Very low authority';
    
    const recencyLabel = recencyScore >= 0.9 ? 'Recent' :
                         recencyScore >= 0.7 ? 'Moderately recent' :
                         recencyScore >= 0.5 ? 'Dated' :
                         recencyScore >= 0.3 ? 'Old' :
                         'Very old';
    
    return { authLabel, recencyLabel };
  }

  /**
   * Main function: enrich sources with scoring metadata
   */
  function enrichSources(sources, claimDate = new Date()) {
    if (!Array.isArray(sources)) return [];
    
    return sources.map(src => {
      const authInfo = scoreAuthority(src.url);
      const recency = scoreRecency(src.publishDate || src.date, claimDate);
      const labels = assignLabels(authInfo.score, recency);
      
      return {
        ...src,
        authority: authInfo.score,
        authorityLabel: labels.authLabel,
        authorityCategory: authInfo.category,
        recency: recency,
        recencyLabel: labels.recencyLabel,
        ageDays: src.publishDate ? 
          Math.floor((claimDate - new Date(src.publishDate)) / (1000 * 60 * 60 * 24)) : 
          null
      };
    });
  }

  /**
   * Filter sources by minimum quality threshold
   */
  function filterByQuality(sources, minAuthority = 0.5, minRecency = 0.3) {
    return sources.filter(src => 
      (src.authority || 0.5) >= minAuthority &&
      (src.recency || 0.5) >= minRecency
    );
  }

  /**
   * Get category-specific recommendations for job market claims
   */
  function recommendSourcesForCategory(category) {
    const recommendations = {
      'job_market': [
        'bls.gov - Bureau of Labor Statistics',
        'linkedin.com - LinkedIn Workforce Reports',
        'stackoverflow.com - Developer Surveys',
        'kaggle.com - Data Science Surveys'
      ],
      'health': [
        'who.int - World Health Organization',
        'pubmed.ncbi.nlm.nih.gov - PubMed',
        'cdc.gov - Centers for Disease Control'
      ],
      'economics': [
        'worldbank.org - World Bank Data',
        'data.gov - U.S. Government Economic Data',
        'ourworldindata.org - Economic Indicators'
      ]
    };
    
    return recommendations[category] || [];
  }

  // Export to global scope
  try {
    window.CS_SourceScoring = {
      enrichSources,
      filterByQuality,
      scoreAuthority,
      scoreRecency,
      assignLabels,
      recommendSourcesForCategory,
      AUTHORITY_MAP
    };
    
    console.log('✅ [Source Scoring] Enhanced scoring loaded');
  } catch (_) {}
})();
