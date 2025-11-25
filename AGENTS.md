# Agent instructions for ClaimShield Nano

This repo is a Chrome Manifest V3 extension called **ClaimShield Nano**.

Core goals:
- Local-first fact-checking firewall using Chrome's Built-in AI (Gemini Nano Prompt + Summarizer).
- Evidence-first: Wikipedia + optional web search + image flags.
- Very strict on **safety & abstain**. When in doubt, prefer `NEEDS_REVIEW` or explicit abstain.

Important constraints:
- Extension is **MV3**. `manifest.json` must stay MV3-compliant.
- **No remote <script> tags.** CSP is `script-src 'self' ...`. Do NOT load JS from CDNs (e.g. transformers.js).
- Do NOT introduce a bundler (no webpack/rollup/vite). Keep plain JS modules.

Key files:
- `ai_local.js`: main verification pipeline (summarize → classify → build proof object).
- `wikipedia_fetch_fix.js`: Wikipedia + temporal/job-market heuristics.
- `open_web_fetch_google.js`: Google Custom Search / web evidence helper.
- `sources_display_fix.js`, `enhanced_source_scoring.js`: display + authority/recency scoring.
- `cs_settings.js`: user settings, including `useWebSearch`, API keys, etc.
- `popup.html` / `popup.js`: UI and debug panel.

Known issues to prioritize:
1. **CSP violation**: `popup.html` still tries to load transformers.js from CDN, blocked by `script-src 'self'`.
2. **Router flags**: job-market claims show `routerCategory: "other_or_ambiguous"` and `routerEvidenceMode: "wiki-first"` instead of `job_market_or_employment` + `web-first`.
3. **Wikipedia noise**: `wikipedia_fetch_fix.js` can return tangential pages (e.g., “Education in the Philippines”) for job-market claims.
4. **Temporal + web search**:
   - When `proof.flags.outdated_model` or `future_event` is true AND Wikipedia evidence is weak,
     we should **escalate to web search**, using `open_web_fetch_google.js`, and mark `sourceType: 'web'`.
   - Web sources should be merged into `structured.proof.sources` and scored by domain + recency.

Testing:
- For now, just run Node-based checks and lint:
  - `npm test` (if present) OR `npm run lint`.
  - Otherwise, run a simple sanity script if you create it, e.g. `node tools/smoke_test.js`.

Style:
- Keep code small and surgical.
- Don’t rename public/global functions like `window.evidenceFetchSnippets`, `window.csFetchWebSearch`, etc.
- Log with `[ClaimShield] ...` tags when helpful.
