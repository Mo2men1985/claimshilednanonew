# Demo Script (≈3 Minutes)

This script outlines a demonstration of the ClaimShield Nano extension as delivered for the Chrome Built‑in AI Challenge.  It shows local and evidence modes, an optional hybrid mode, and the new Sources display and export features.

## Preparation

1. Install the extension unpacked in Chrome (Extensions → Load unpacked → select the folder).  Ensure only the H6 build is enabled.
2. Pin the extension icon for quick access.
3. (Optional) Obtain a Gemini API key if you want to demo hybrid mode.  Enter it in the popup’s Hybrid section.

## Local verification

1. Open any webpage containing a factual claim (e.g. an article about a recent acquisition).
2. Select a sentence to verify and click the ClaimShield icon.  The popup opens with the selection preloaded.
3. Click **Verify**.  The extension uses the on‑device language model to classify the claim and generate a proof card.
4. Observe that the result appears under the **ProofCard** tab.  Under the JSON tab you can see `LAST.structured` populated with a `proof.sources` array and that each claim includes a `citations` field (the H6safe setter ensures this).
5. Scroll down to the new **Sources** section.  It lists the citations with titles, URLs and snippets.  Click a source to open it in a new tab.

## Evidence fallback

1. To simulate a missing language model, disable network access or run the extension on a profile without the on‑device model installed.
2. Perform the same verification.  The console shows a `[LangGuard VETO]` warning instead of a “[LangGuard NUCLEAR]” error, and the extension routes to evidence mode.
3. The banner in the popup indicates that the built‑in AI is unavailable and evidence mode is being used.  The Sources list still appears, populated either from the last hybrid proof or from the evidence snippet fallback.

## Hybrid mode (optional)

1. In the **Hybrid** tab, paste your Gemini API key and toggle **Hybrid Mode** on.
2. Verify a claim again.  The extension sends the text to both the local model and Gemini, combining the results.  Observe the classification and citations returned.
3. The Sources list updates to show citations from both modes.

## Delta & Export

1. After verifying multiple claims, use the history dropdown to compare old and new proof cards (delta view).  The H6safe setter ensures both have sources.
2. Click **Export** in the popup to open the export page in a new tab.
3. On the export page, click **Load from storage** or paste the JSON from the popup.  Click **Generate Markdown**.  The generated markdown includes a citations section matching the Sources list.
4. Scroll to the bottom of the export page to see the **Sources** section, which mirrors the popup’s list.  Clicking any link opens the source for further review.

This demonstration covers local inference, safe fallback to evidence mode, optional hybrid integration, proof card comparison and exporting with citations.