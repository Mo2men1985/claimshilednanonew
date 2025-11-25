# ClaimShield Nano — SOTA-merged, Store-safe Build (2025-10-13)

- **Evidence Mode:** wired + exported
- **Permissions:** Wikipedia-only, offline-first
- **CSP:** `connect-src 'self' https://en.wikipedia.org`
- **Hybrid:** optional; if you enable it, add `https://generativelanguage.googleapis.com` to CSP
- **UI:** adds a small label “Image analysis (coming soon)”

## SOTA Utilities Included
- `detectClaimTypes(text)`
- `detectAdversarialPatterns(text)`
- `calibrateConfidence(base, flags)`
- `__extractJSONFuzzy(raw)`

Drop this folder into `chrome://extensions` → Load unpacked.
