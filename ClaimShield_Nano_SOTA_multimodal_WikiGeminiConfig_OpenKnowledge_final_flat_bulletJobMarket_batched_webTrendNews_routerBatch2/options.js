// options.js – binds the options UI to cs_settings.js

(function () {
  'use strict';

  function byId(id) {
    return document.getElementById(id);
  }

  function showStatus(msg) {
    const el = byId('saveStatus');
    if (!el) return;
    el.textContent = msg || '';
    if (!msg) return;
    setTimeout(() => {
      if (el.textContent === msg) {
        el.textContent = '';
      }
    }, 2000);
  }

  async function loadIntoForm() {
    try {
      const settings =
        (typeof csLoadSettings === 'function')
          ? await csLoadSettings()
          : (window.CS_SETTINGS_DEFAULTS || {});

      byId('enableImageOCR').checked = !!settings.enableImageOCR;
      byId('enableWebSearch').checked = !!settings.enableWebSearch;
      byId('strictRiskMode').checked = !!settings.strictRiskMode;
      byId('showDebugPanel').checked = !!settings.showDebugPanel;
      const wikiInput = byId('csWikipediaBaseUrl');
      if (wikiInput) {
        wikiInput.value = settings.wikipediaBaseUrl || 'https://en.wikipedia.org';
      }
      const gemImg = byId('csEnableGeminiImageMode');
      if (gemImg) {
        gemImg.checked = !!settings.enableGeminiImageMode;
      }
    } catch (e) {
      console.warn('[ClaimShield] Failed to load settings into form:', e);
    }
  }

  function wireEvents() {
    const fields = [
      'enableImageOCR',
      'enableWebSearch',
      'strictRiskMode',
      'showDebugPanel',
      'csWikipediaBaseUrl',
      'csEnableGeminiImageMode'
    ];

    fields.forEach((id) => {
      const el = byId(id);
      if (!el) return;
      el.addEventListener('change', async () => {
        try {
          const partial = {};
          if (el.type === 'checkbox') {
            partial[id === 'csEnableGeminiImageMode' ? 'enableGeminiImageMode' : id] = !!el.checked;
          } else {
            const key = (id === 'csWikipediaBaseUrl') ? 'wikipediaBaseUrl' : id;
            partial[key] = (el.value || '').trim();
          }
          if (typeof csSaveSettings === 'function') {
            await csSaveSettings(partial);
            showStatus('Saved');
          }
        } catch (e) {
          console.warn('[ClaimShield] Failed to save setting', id, e);
          showStatus('Save failed');
        }
      });
    });

    const btnReset = byId('btnReset');
    if (btnReset) {
      btnReset.addEventListener('click', async () => {
        try {
          if (window.CS_SETTINGS_DEFAULTS && typeof csSaveSettings === 'function') {
            await csSaveSettings(window.CS_SETTINGS_DEFAULTS);
          }
          await loadIntoForm();
          showStatus('Reset to defaults');
        } catch (e) {
          console.warn('[ClaimShield] Reset failed:', e);
          showStatus('Reset failed');
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await loadIntoForm();
    wireEvents();
  });
})();
