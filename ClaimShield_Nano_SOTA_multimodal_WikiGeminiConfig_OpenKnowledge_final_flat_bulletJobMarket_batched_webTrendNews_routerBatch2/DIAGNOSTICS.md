# ClaimShield Nano — Evidence Binding Diagnostics

## Quick console checks (popup → DevTools → Console)

```
typeof evidenceRunPipeline                // → "function"
await evidenceFetchSnippets?.("Albert Einstein developed the theory of relativity", 2)
// → Array of Wikipedia items (objects with title/url/summary)
window.__DIAG && window.__DIAG.evidencePipeline
// → { bound: true }
```