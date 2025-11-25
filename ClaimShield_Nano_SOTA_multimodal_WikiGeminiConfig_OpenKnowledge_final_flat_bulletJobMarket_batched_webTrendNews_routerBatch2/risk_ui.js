// risk_ui.js
// Renders a summary of risk and grounding information in the popup.

(function () {
  'use strict';

  /**
   * Render the risk section. Creates DOM elements on demand.
   *
   * @param {Object} structured
   */
  function renderRiskSection(structured) {
    try {
      // Acquire the root results container. We try both the new results container
      // (id="results") and the older resultsFormatted container for backward
      // compatibility.
      const resultsEl = document.getElementById('results') || document.getElementById('resultsFormatted');
      if (!resultsEl) return;

      // Create the risk block if it doesn't exist. We insert it at the top
      // of the results container so it appears above the verdict details.
      let block = document.getElementById('cs-risk-block');
      if (!block) {
        block = document.createElement('div');
        block.id = 'cs-risk-block';
        block.style.marginTop = '8px';
        resultsEl.insertBefore(block, resultsEl.firstChild);
      }
      // Create summary and reasons containers if needed
      let summaryEl = document.getElementById('cs-risk-summary');
      if (!summaryEl) {
        summaryEl = document.createElement('div');
        summaryEl.id = 'cs-risk-summary';
        summaryEl.className = 'cs-risk-summary';
        block.appendChild(summaryEl);
      }
      let reasonsEl = document.getElementById('cs-risk-reasons');
      if (!reasonsEl) {
        reasonsEl = document.createElement('div');
        reasonsEl.id = 'cs-risk-reasons';
        reasonsEl.className = 'cs-risk-reasons';
        reasonsEl.style.display = 'none';
        block.appendChild(reasonsEl);
      }

      const risk = structured && structured.risk;
      if (!risk) {
        summaryEl.innerHTML = '';
        reasonsEl.style.display = 'none';
        reasonsEl.innerHTML = '';
        return;
      }

      // Determine label, colors and percentage from the risk object
      const label = (risk.label || 'medium').toLowerCase();
      const score = typeof risk.score === 'number' ? risk.score : null;
      const pct = score != null ? Math.round(score * 100) : null;
      let labelText = 'Medium risk';
      let pillBg = '#fef3c7';
      let pillFg = '#92400e';
      if (label === 'low') {
        labelText = 'Low risk';
        pillBg = '#dcfce7';
        pillFg = '#166534';
      } else if (label === 'high') {
        labelText = 'High risk';
        pillBg = '#fee2e2';
        pillFg = '#b91c1c';
      }
      const scoreText = pct != null ? `(${pct}% risk)` : '';

      // Grounding / hallucination label. We try to read flags on the structured object.
      const flags = structured && structured.flags ? structured.flags : (structured.proof && structured.proof.flags) || {};
      const groundingLabel = flags.hallucinationLabel || 'Grounding unknown';

      // Build summary HTML. We use a column layout: pill + score on the first row
      // and grounding information on the second row. Then we add a toggle link.
      summaryEl.innerHTML =
        `<div style="display:flex;flex-direction:column;gap:2px;">
          <div>
            <span style="display:inline-flex;align-items:center;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:${pillBg};color:${pillFg};">
              ${labelText}
            </span>
            <span style="margin-left:6px;font-size:11px;color:#6b7280;">
              ${scoreText}
            </span>
          </div>
          <div style="font-size:11px;color:#6b7280;">Grounding: ${groundingLabel}</div>
        </div>
        <div id="cs-risk-toggle" class="cs-risk-toggle" style="font-size:11px;color:#2563eb;cursor:pointer;text-decoration:underline;margin-top:4px;">Why this risk?</div>`;

      // Build reasons list into reasonsEl. We cap to 4 reasons for brevity.
      const reasons = Array.isArray(risk.reasons) ? risk.reasons : [];
      if (reasons.length) {
        let listHtml = '<ul style="margin:4px 0 0 18px;padding:0;">';
        reasons.slice(0, 4).forEach((r) => {
          listHtml += `<li>${String(r)}</li>`;
        });
        listHtml += '</ul>';
        reasonsEl.innerHTML = listHtml;
      } else {
        reasonsEl.innerHTML = '<div>No additional risk details.</div>';
      }
      reasonsEl.style.display = 'none';

      // Attach toggle behaviour once
      const toggle = document.getElementById('cs-risk-toggle');
      if (toggle) {
        toggle.addEventListener('click', () => {
          const visible = reasonsEl.style.display !== 'none';
          reasonsEl.style.display = visible ? 'none' : 'block';
        }, { once: true });
      }
    } catch (e) {
      console.warn('[Risk UI] Failed to render risk section:', e);
    }
  }

  // Expose as global function to be called by sources_display_fix.js
  try {
    window.__renderRiskSection = renderRiskSection;
  } catch (_) {
    // ignore if window unavailable
  }
})();