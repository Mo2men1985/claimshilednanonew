const { classifyWithGemini } = require('../ai_local');
const { csFilterWikiHitsByOverlap } = require('../wikipedia_fetch_fix');
const csSettings = require('../cs_settings');
const { csFetchWebSearch } = require('../open_web_fetch_google');

// Provide stub web search with predictable result
async function stubFetchWebSearch(query) {
  return [
    {
      id: 'web-0',
      title: 'Tech sector needs more data scientists',
      url: 'https://example.com/data-science-demand',
      domain: 'example.com',
      snippet: 'Reports indicate rising demand for data science professionals in 2024.',
      publishDate: '2024-01-02T00:00:00Z',
      ageDays: 100,
      sourceType: 'web',
      evidenceCategory: 'core_evidence'
    }
  ];
}

async function main() {
  csSettings.set('useWebSearch', true);
  csSettings.set('googleApiKey', 'fake-key');
  csSettings.set('googleSearchEngineId', 'fake-cx');
  global.csFilterWikiHitsByOverlap = csFilterWikiHitsByOverlap;
  global.csSettings = csSettings;
  global.csFetchWebSearch = csFetchWebSearch;

  const claim =
    'The demand for skilled data science practitioners is increasing across various sectors. Industry, academia, and government all require more professionals with data science expertise.';
  const wikiHits = [
    { pageid: 100, title: 'Data science', snippet: 'Data science is an interdisciplinary academic field.' },
    { pageid: 101, title: 'Education in the Philippines', snippet: 'Random education article.' }
  ];

  const result = await classifyWithGemini(claim, { wikiHits, fetchWebSearch: stubFetchWebSearch });
  console.log('routerCategory:', result.routingPolicy.routerCategory);
  console.log('routerEvidenceMode:', result.routingPolicy.evidenceMode);
  console.log('routerIsTemporal:', result.routingPolicy.routerIsTemporal);
  console.log('web_sources:', result.proof.sources.filter((s) => s.sourceType === 'web').length);
  console.log('wiki_sources:', result.proof.sources.filter((s) => s.sourceType === 'wiki').length);
  console.log('flags:', result.proof.flags);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
