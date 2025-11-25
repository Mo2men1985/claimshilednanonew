# Accessibility & Internationalization Report

## Tab Order & Focus Management

- **Logical tab order:**  Interactive elements in the popup (buttons, inputs and checkboxes) are arranged in a logical DOM order and therefore receive keyboard focus in the intended sequence.  The added "Sources" list is appended at the end of the document, after the existing controls, so tabbing through the popup still focuses core controls first before moving to the citation links.
- **Keyboard operability:**  All controls in the popup and export pages are native HTML buttons, inputs or links, ensuring they can be operated via keyboard alone.  The sources list uses `<ol>` and `<li>` elements with anchor tags, which are focusable and announce their destination.
- **Focus retention:**  The extension does not programmatically shift focus except when updating form values.  When sources are re‑rendered, the list content is replaced but the user’s focus remains on the previously selected control.  No unexpected focus jumps occur.

## Screen Reader Considerations

- **Semantic markup:**  Headings (`<h2>`, `<h3>`), lists (`<ol>`/`<li>`), paragraphs and buttons are used appropriately.  This provides a clear hierarchy for screen readers.  The “Sources” list includes descriptive link text followed by a paragraph containing the snippet, giving users enough context before opening the citation.
- **Live updates:**  The `window.LAST.structured` setter triggers the sources renderer asynchronously.  Because it simply replaces the contents of an ordered list, screen readers will announce the updated list when focus enters the section.  There are no ARIA live regions, so updates are non‑intrusive.

## Internationalization

- **Supported languages:**  The extension respects the global `CLAIMSHIELD_LANG` variable and clamps output to English (`en`), Spanish (`es`) or Japanese (`ja`).  It uses the user’s `navigator.language` to pick a default.  All AI API calls pass `outputLanguage` accordingly.
- **Character handling:**  Text inputs and outputs handle arbitrary UTF‑8 content.  The demo examples include Arabic and Chinese characters.  The export page escapes backticks and quotes when building Markdown to ensure multi‑language content is preserved.
- **Locale‑neutral UI:**  Labels within the UI are provided in English, which matches the competition guidelines.  The extension does not hard‑code any date or number formats and relies on the browser’s locale for display when necessary.

## Future Improvements

- Incorporating a language picker in the popup would allow users to override the detected language and tailor the output.
- Adding ARIA labels to interactive icons (e.g. the evidence button) could further improve screen reader support.