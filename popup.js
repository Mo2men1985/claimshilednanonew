(function () {
  function renderResult(result) {
    const resultEl = document.getElementById('cs-result');
    const flag = result.proof.flags || {};
    const sources = result.proof.sources || [];
    const reasons = result.proof.reasons || [];
    const parts = [];
    parts.push(`<div><strong>Verdict:</strong> ${result.proof.verdict}</div>`);
    if (reasons.length > 0) {
      parts.push('<div><strong>Reasons:</strong></div>');
      parts.push('<ul>' + reasons.map((r) => `<li>${r}</li>`).join('') + '</ul>');
    }
    if (sources.length > 0) {
      parts.push('<div><strong>Sources:</strong></div>');
      parts.push(
        '<ul>' +
          sources
            .map(
              (s) =>
                `<li>[${s.sourceType}] <a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.title || s.url}</a> - ${s.snippet || ''}</li>`
            )
            .join('') +
          '</ul>'
      );
    }
    resultEl.innerHTML = parts.join('\n');

    document.getElementById('cs-router-category').textContent = flag.routerCategory || '';
    document.getElementById('cs-router-evidence-mode').textContent = flag.routerEvidenceMode || '';
    document.getElementById('cs-router-is-temporal').textContent = flag.routerIsTemporal === true ? 'true' : 'false';
    document.getElementById('cs-router-web-used').textContent = flag.web_search_used ? 'true' : 'false';
  }

  async function runCheck() {
    const claim = document.getElementById('cs-claim-input').value;
    const wikiHits = [
      { pageid: 10, title: 'Data science', snippet: 'Data science is an interdisciplinary field.' },
      { pageid: 11, title: 'Education in the Philippines', snippet: 'Unrelated snippet' }
    ];
    const result = await classifyWithGemini(claim, { wikiHits });
    renderResult(result);
  }

  document.getElementById('cs-check-btn').addEventListener('click', runCheck);
})();
