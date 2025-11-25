# ClaimShield Nano – AI-Powered Fact-Checking for the Modern Web

ClaimShield Nano is a **Chrome extension** that turns Chrome’s **Built-in AI** into a **privacy-first fact checker**.

- 🧠 Uses **Chrome Built-in AI APIs** (Summarizer + LanguageModel + Writer/Translator/Proofreader/Rewriter) directly in the browser
- 🌐 Pulls **evidence from Wikipedia** only, plus **safe live-search links** for recent events
- ⏳ **Understands time** – if a claim is about events after the model’s training cutoff, it warns and abstains instead of hallucinating
- 🔒 Works **100% locally by default** (no API keys, no external servers required)
- 🧾 Always shows **real citations** for every verdict

This is the **AI Genesis hackathon** build: a single, hardened, flat MV3 extension folder ready to load in Chrome.

---

## 🚀 What ClaimShield Nano Does

1. **Summarizes** the highlighted text using Chrome’s **Summarizer API**.
2. **Classifies** the summary into claims and assigns a **verdict + confidence**:
   - ✅ OK
   - ⚠️ NEEDS_REVIEW
   - 🚫 ABSTAIN
3. **Retrieves evidence** from:
   - `en.wikipedia.org` (REST + search)
   - For temporal claims with no hits: **pseudo-sources**:
     - Live Wikipedia search link
     - Live Google News search link (click-out only)
4. **Applies temporal reasoning (τ)**:
   - Detects claims that likely refer to **very recent events**
   - Shows a **time-window notice** and **abstains** when outside training data
5. **Renders a proof card**:
   - Summary
   - Verdict & confidence
   - Clear reasons
   - Sources list (clickable links)

---

## 🧩 Built-in AI & Gemini Usage

### Chrome Built-in AI (on-device)

ClaimShield Nano uses multiple **Chrome Built-in AI APIs** on-device:

- `ai.summarizer` – turn long text into short bullet summaries
- `ai.languageModel` – structure the verdict / JSON result (when available)
- `ai.proofreader` – polish short UI strings / messages (optional)
- `ai.translator` – future extension: translate non-English claims to English
- `ai.writer` / `ai.rewriter` – shape human-readable reasons (light use)

All of these run **locally in the browser** when Chrome’s Built-in AI is available.

### Optional Gemini Hybrid Mode

ClaimShield also **optionally** supports a **Hybrid mode**:

- The user **opts in** and provides a **Gemini API key**.
- The extension can then:
  - Call Gemini to **re-check** the claim.
  - Compare Gemini’s verdict with local Chrome Built-in AI.
  - Use Gemini’s structured output as an extra sanity check.
- Even in Hybrid mode:
  - **Wikipedia** stays the primary evidence source.
  - Gemini is treated as an **advisor**, not a source of citations.

This hybrid path is wired via `ai_local.js` and clearly marked in the UI as **Hybrid (Gemini)**.

---

## 🧱 Key Features

### Privacy by Design

- **Local-first**: All verification runs on-device by default.
- **No analytics**: No telemetry, no tracking, no third-party analytics.
- **Tight CSP**: Content Security Policy restricts all external calls to:
  - `https://en.wikipedia.org`
  - `https://*.wikipedia.org`
  - `https://news.google.com` (link-only, no scraping)
  - `https://generativelanguage.googleapis.com` (only if hybrid is enabled by the user)

### Honest AI

- **Abstains when uncertain** instead of guessing.
- **Temporal awareness (τ)**:
  - Checks if the claim likely refers to **events after June 2024**.
  - When true and evidence is thin, it clearly says:
    - “⏳ Time-window notice: this appears to be a recent event outside my training data…”
- **Transparent evidence**:
  - Every verdict has at least one **real, clickable citation**.
  - For recent events, the system shows safe **live-search links** instead of fake references.

### Technical Highlights

- ✅ MV3 extension, **flat folder**, ready for `chrome://extensions → Load unpacked`
- ✅ On-device **Summarizer API** integration
- ✅ **LangGuard “soft-veto” pattern** around `LanguageModel.create()` for robust error handling
- ✅ **Sanitized Wikipedia fetcher** with bullet-point query normalization
- ✅ **Temporal pseudo-source fallback**:
  - If the claim looks temporal and Wikipedia has zero hits:
    - Add a **live Wikipedia search URL**
    - Add a **live Google News search URL**
- ✅ **Sources panel** that de-duplicates and renders all evidence

---

## 📦 Folder Structure (AI Genesis Build)

```text
ClaimShield_Nano_AI_Genesis_Final/
  manifest.json
  popup.html
  popup.css
  popup.js

  background.js       # MV3 service worker (context menus, keyboard shortcut)
  content.js          # Handles selected text from web pages

  ai_local.js         # Core pipeline: summarize → classify → evidence → proof card
  preload.js          # Wraps built-in AI APIs early (outputLanguage guard)
  lang_guard_nuclear.js
                      # Robust guard for LanguageModel, Summarizer, etc.
  query_guard.js      # Deduplicates queries, prevents rapid double fires
  request_sanitizer.js
                      # Filters/controls fetch targets; enforces CSP-like allowlist
  wikipedia_fetch_fix.js
                      # Wikipedia + temporal pseudo-source + live search links
  sources_display_fix.js
                      # Unified rendering of citations in the popup

  diagnostics.html    # (Optional) small diagnostics view
  diagnostics.js
  export_markdown.html
  export_markdown.js  # Export proof card as Markdown
  INSTALL.md          # Simple run instructions
  README.md           # This file
