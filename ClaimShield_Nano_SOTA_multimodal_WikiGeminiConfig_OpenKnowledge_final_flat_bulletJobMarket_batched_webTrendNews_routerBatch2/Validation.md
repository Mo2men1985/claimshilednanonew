# ClaimShield Nano – Validation Notes

This document outlines how the **ClaimShield Nano Perfect Build** operates across its three modes (Local, Hybrid and Evidence), how the major components interact and why the logic is considered correct and MV3‑compliant.

## 1. Load order and initialization

1. When the extension is installed, the MV3 `service_worker` (`background.js`) registers keyboard shortcuts and context‑menu items.  These trigger the popup or perform quick verifications.
2. When a user clicks the extension icon or activates the keyboard shortcut, Chrome loads `popup.html`.  The HTML includes:
   - A translator language selector (`select#translatorLang`) with English, Spanish and Japanese options;
   - A textarea where users paste or select text;
   - Tabs for formatted results, raw JSON, history and examples;
   - Buttons for “Verify”, “Run Evidence Check”, “Save Report (.md)” and diagnostics.
3. `popup.js` runs in the context of the popup.  It immediately ensures that core functions (`ensureLanguageModelReady` and `createPromptSession`) exist, defaulting to the implementations exported from `ai_local.js`.  It retrieves saved user settings (`CLAIMSHIELD_LANG`, hybrid mode state, API key and history) from `chrome.storage.local`.
4. `ai_local.js` is loaded.  It defines helper functions for summarization, structured classification, proofreading, rewriting, translation, writer drafting, image analysis and the Evidence Mode pipeline.  It also exports these functions onto `window` and `globalThis`, making them available to the popup.

## 2. Local Mode

1. **User input**: the user enters or selects a claim in the textarea.
2. **Model warm‑up**: clicking “Verify” triggers `ensureLanguageModelReady()` with a progress callback.  This function detects whichever language‑model API is available (`ai.languageModel` or `LanguageModel`), checks readiness via `availability()`/`capabilities()`, optionally downloads the model and creates/destroys a session if necessary.
3. **Prompt session**: `createPromptSession()` opens a prompt session with the model using the user’s chosen output language (`CLAIMSHIELD_LANG`).  A timeout guards against hanging downloads.
4. **Structured classification**: `classifyWithStructuredOutput()` sends a templated prompt to the language model asking it to categorise the claim as `OK`, `NEEDS_REVIEW` or `ABSTAIN`, produce a confidence score, reasons and spans of suspicious text.  Heuristics adjust the confidence upward when URLs, citations or multiple languages are detected.
5. **Summary**: `summarize()` produces a short key‑point summary of the input for display.
6. **Proofreading / translation**: if the user checks the “Improve quality” or “Translate” boxes (via the UI), `proofread()` and `translate()` are called.  These use the Proofreader and Translator APIs if available, falling back to the Rewriter API or a no‑op translation when necessary.
7. **Output & history**: `popup.js` merges the summary, verdict and reasoning into an object which is stored in the history list (capped at 20 entries) and displayed on the “Formatted” and “JSON” tabs.  The verdict determines the action‑bar badge colour.

## 3. Hybrid Mode

Hybrid mode is toggled via a checkbox in the popup.  When enabled and supplied with a valid Gemini API key, `popup.js` will call `classifyWithGemini()` instead of `classifyWithStructuredOutput()` after the local summary.  Gemini returns a similarly structured JSON object.  The extension still performs local summarization and can optionally proof‑read and translate.  Hybrid results are clearly labelled in the UI.

## 4. Evidence Mode (trusted‑lite)

Evidence Mode can be activated either explicitly via the “Run Evidence Check” button or implicitly when the local verdict is `ABSTAIN` or has low confidence (evidence fallback).  The flow is as follows:

1. **Claim extraction**: `evidenceExtractClaims()` uses the on‑device summarizer to extract up to three concise claims from the input text.  It falls back to splitting on punctuation when Summarizer is unavailable.
2. **Snippet retrieval**: `evidenceFetchSnippets()` searches Wikipedia for each claim.  It first queries the MediaWiki `action=query` API for search results and then calls the REST `page/summary` endpoint to retrieve short extracts.  If this fails, it falls back to the `w/rest.php/v1/search/title` endpoint.  Only the domain “en.wikipedia.org” is accessed, complying with the host permissions declared in `manifest.json`.
3. **Claim comparison**: `evidenceCompareClaim()` calls the on‑device language model to compare each claim with its snippets.  It returns a strict JSON object containing a verdict (`OK`, `NO_EVIDENCE` or `NEEDS_REVIEW`), a confidence score, a list of citation indices and a short rationale.  The JSON is parsed with a robust extractor to handle occasional formatting glitches.
4. **Aggregation**: `evidenceRunPipeline()` orchestrates the above steps, returning an array of claims with verdicts and a deduplicated list of sources.  In fallback mode, the best evidence verdict (with citations and rationale) is merged into the local result if the local verdict was inconclusive.
5. **Rendering & export**: the popup displays evidence results under the Evidence tab.  Each snippet shows its domain badge (e.g., GOV, WIKI, DOI).  Users can click “Save Report (.md)” to generate a markdown file summarizing the claim, the local verdict and the evidence snippets with citations.

## 5. Offline‑first, privacy and MV3 compliance

* All on‑device inference uses Chrome’s built‑in AI APIs.  No user text is sent to external servers unless Hybrid Mode is explicitly enabled and an API key is provided.
* Wikipedia fetches occur only when the user requests Evidence Mode or when fallback triggers, and are restricted to the declared `host_permissions` (`https://en.wikipedia.org/*`).
* The extension is manifest‑v3 compliant: it uses a service worker (`background.js`), declares all permissions up front, avoids inline scripts, and stores user preferences via `chrome.storage.local`.
* The new `ensureLanguageModelReady()` implementation handles both current and future Chrome APIs (`LanguageModel` and `ai.languageModel`), ensuring the extension remains functional as the Prompt API evolves.

## 6. Known limitations and future improvements

* Evidence Mode relies exclusively on English Wikipedia; incorporating multi‑lingual sources (e.g., local language Wikipedias or structured data sets) could improve coverage for non‑English claims.
* The summarizer and claim extractor may sometimes miss nuanced statements, particularly in very long or technical documents.  Increasing the maximum claim count or allowing the user to mark key sentences could mitigate this.
* The current UI includes a diagnostics panel primarily for hackathon judging.  It could be hidden or moved to a developer settings screen in production.

## Conclusion

The perfect build preserves the privacy‑centric, offline‑first ethos of ClaimShield Nano while incorporating robust evidence retrieval, flexible language settings, hybrid AI support and a polished user interface.  Each mode – local, hybrid and evidence – has been carefully tested to ensure deterministic JSON outputs, graceful error handling and adherence to Chrome extension best practices.