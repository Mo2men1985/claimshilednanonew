document.addEventListener('DOMContentLoaded', () => {
  const runBtn = document.getElementById('run');
  const out = document.getElementById('out');
  if (!runBtn || !out) return;

  runBtn.addEventListener('click', async () => {
    try {
      out.textContent = 'Running...';
      const report = { exports: {}, apis: {}, tests: {} };
      const names = [
        'ensureLanguageModelReady',
        'createPromptSession',
        'summarize',
        'checkAvailability',
        'translate',
        'writerDraft',
        'checkVisionSupport',
        'analyzeImageInput'
      ];
      for (const n of names) {
        report.exports[n] = typeof window[n] === 'function';
      }
      ['LanguageModel', 'Summarizer', 'Translator', 'Writer', 'Rewriter', 'Proofreader']
        .forEach(k => { report.apis[k] = (k in self); });
      try {
        const s = await (window.summarize?.('Harvard University is located in Cambridge, Massachusetts.') || {});
        report.tests.summarize = s && s.ok === true;
      } catch (e) {
        report.tests.summarize = 'error:' + (e && e.message || e);
      }
      out.textContent = JSON.stringify(report, null, 2);
    } catch (e) {
      out.textContent = 'Self-test error: ' + (e && e.message || e);
    }
  });
});
