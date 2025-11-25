// ===== TEST VERIFICATION WITH MOCK SOURCES =====
// Run this in console to see sources display in action

(async function testSourcesDisplay() {
  console.log('🧪 Running test verification with sources...');
  
  // Create mock structured data with sources
  const mockStructured = {
    summary: "The demand for skilled data science practitioners is increasing across industry, academia, and government.",
    claims: [
      {
        text: "The demand for data science practitioners is increasing",
        confidence: 0.95,
        status: "checked",
        citations: [1, 2, 3]
      }
    ],
    proof: {
      verdict: "OK",
      confidence: 0.95,
      tau: 0.95,
      abstain: false,
      abstain_reason: "ok",
      reasons: [
        "Multiple industry reports confirm growing demand for data scientists [S1][S2][S3]",
        "Academic institutions are expanding data science programs [S2]",
        "Government agencies report increased hiring in analytics roles [S3]"
      ],
      spans: [],
      flags: {
        hasUrls: false,
        hasCitations: true
      },
      sources: [
        {
          id: 1,
          title: "HarvardX: Data Science Professional Certificate",
          url: "https://courses.edx.org/courses/course-v1:HarvardX+PH125.1x+1T2020/",
          domain: "courses.edx.org",
          snippet: "The demand for skilled data science practitioners in industry, academia, and government is rapidly growing. The HarvardX Data Science program prepares learners with the necessary skills."
        },
        {
          id: 2,
          title: "Data Science - Wikipedia",
          url: "https://en.wikipedia.org/wiki/Data_science",
          domain: "en.wikipedia.org",
          snippet: "Data science is an interdisciplinary field that uses scientific methods, processes, algorithms and systems to extract knowledge and insights from structured and unstructured data."
        },
        {
          id: 3,
          title: "Bureau of Labor Statistics - Data Scientists",
          url: "https://www.bls.gov/ooh/math/data-scientists.htm",
          domain: "bls.gov",
          snippet: "Employment of data scientists is projected to grow 36 percent from 2021 to 2031, much faster than the average for all occupations."
        }
      ]
    }
  };
  
  // Set as LAST result
  window.LAST = {
    mode: "hybrid",
    input_chars: 107,
    structured: mockStructured,
    timestamp: new Date().toISOString(),
    improved: null,
    translation: null,
    apis: {
      prompt: true,
      summarizer: true,
      hybrid: true
    }
  };
  
  console.log('✅ Mock data created:', window.LAST);
  
  // Trigger all rendering functions
  if (typeof window.formatResults === 'function') {
    window.formatResults(window.LAST);
    console.log('✅ formatResults called');
  }
  
  if (typeof window.renderSources === 'function') {
    window.renderSources(mockStructured);
    console.log('✅ renderSources called');
  } else if (typeof window.__renderSourcesNow === 'function') {
    window.__renderSourcesNow(mockStructured);
    console.log('✅ __renderSourcesNow called');
  }
  
  // Update JSON display
  const jsonOutput = document.getElementById('resultsRaw');
  if (jsonOutput) {
    jsonOutput.textContent = JSON.stringify(window.LAST, null, 2);
    console.log('✅ JSON output updated');
  }
  
  // Show results section
  const results = document.getElementById('results');
  if (results) {
    results.classList.remove('hidden');
    results.style.display = 'block';
    console.log('✅ Results section shown');
  }
  
  // Scroll to sources
  setTimeout(() => {
    const sourcesRoot = document.getElementById('sources-root');
    if (sourcesRoot) {
      sourcesRoot.scrollIntoView({ behavior: 'smooth', block: 'center' });
      console.log('✅ Scrolled to sources');
    }
  }, 500);
  
  console.log('🎉 Test verification complete! Sources should now be visible.');
  console.log('💡 Look for the "📚 Sources" section below the results.');
})();
