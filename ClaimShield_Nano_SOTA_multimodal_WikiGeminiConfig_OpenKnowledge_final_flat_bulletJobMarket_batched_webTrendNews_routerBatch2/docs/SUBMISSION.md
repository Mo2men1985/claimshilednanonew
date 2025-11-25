# ClaimShield Nano — Submission Notes (H6 Final)

## Overview

This release packages the **ClaimShield Nano** Chrome extension as a flat MV3 zip suitable for the Chrome Built‑in AI Challenge.  The extension provides a privacy‑first fact‑checking workflow that operates offline using the Chrome on‑device language model, with an optional hybrid mode that can call external models (e.g. Gemini) when a key is provided.  It analyzes user‑selected claims, classifies their veracity, generates structured JSON with citations, and renders a user‑friendly proof card in the popup and export pages.

Key capabilities include:

- **Offline local inference** – uses `chrome.ai.languageModel` or `ai.languageModel` when available.  If those APIs are unavailable, the extension gracefully falls back to an evidence‑only mode without crashing.
- **Hybrid external model support** – by entering a Gemini API key, the user can perform hybrid analysis that blends local inference with cloud‑based summarization and classification.
- **Automatic citation enforcement** – the `H6safe` setter ensures that every structured result includes at least one proof source and populates empty citations.  It attempts to reuse existing proof data, fetch evidence snippets, or, as a last resort, generates a citation from the current page.
- **Sources display everywhere** – both the popup and export pages now render a "Sources" section listing each proof citation with titles, URLs and snippets.  This list updates automatically whenever `LAST.structured` is set.
- **Markdown export** – the export page lets users paste structured JSON or load it from storage and generate a Markdown proof card.  It respects CSP by using an external `export_markdown.js` script.
- **Safety & CSP compliance** – all inline scripts in `export_markdown.html` have been moved to an external script; the extension includes no inline JavaScript and remains Manifest V3 / CSP clean.
- **Extended evidence breadth** – the manifest now grants host permissions to `*.wikipedia.org`, `*.harvard.edu`, `*.edx.org` and the Gemini API for wider evidence collection.

## APIs and Technologies Used

- **Chrome Prompt API**: uses `chrome.ai.languageModel` and `ai.languageModel` for on‑device inference.  The extension checks `availability()` / `capabilities()` and downloads the model if necessary.
- **Summarizer, Writer, Rewriter, Proofreader & Translator**: built‑in AI services used via `Summarizer.create`, `Writer.create`, etc.  These calls are wrapped to enforce an output language and cleaned up after use.
- **Chrome extension APIs**: `contextMenus`, `scripting`, `storage`, `tabs` and `runtime` messaging for UI and inter‑process communication.
- **Web fetch**: remote evidence snippets are fetched from Wikipedia, Harvard, edX and the Gemini API subject to host permissions.

## Problem Statement

The goal of this challenge build was to harden ClaimShield Nano against crashes, enforce consistent citations, satisfy strict content‑security‑policy requirements, and improve evidence visibility—all while preserving the existing runtime.  Specific required patches included:

1. **Kill NUCLEAR throws** – remove any unconditional exceptions related to missing `ai.languageModel` or `chrome.ai.languageModel` and instead soft‑veto to evidence mode.
2. **Safe local‑model creation** – provide a helper that checks `canCreate()`/`capabilities()` and only calls `.create()` when supported.
3. **Always‑cited JSON** – enforce that `LAST.structured.proof.sources` is never empty and that every claim has at least one citation.
4. **Popup Sources section** – visually list sources in the popup and allow the user to click to verify them.
5. **CSP‑safe export page** – move inline scripts to an external file and render sources on the export page.
6. **Extended host permissions** – include additional academic domains to improve evidence breadth.

These notes, along with the compliance matrix and accessibility report, document how the final submission meets each requirement.