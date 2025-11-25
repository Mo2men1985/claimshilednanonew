// cs_settings.js
// Centralized settings helper for ClaimShield Nano.

(function () {
  'use strict';

  const DEFAULTS = {
    enableImageOCR: true,
    enableWebSearch: false,
    strictRiskMode: false,
    showDebugPanel: false,
    wikipediaBaseUrl: 'https://en.wikipedia.org',
    enableGeminiImageMode: false
  };

  function cloneDefaults() {
    return {
      enableImageOCR: !!DEFAULTS.enableImageOCR,
      enableWebSearch: !!DEFAULTS.enableWebSearch,
      strictRiskMode: !!DEFAULTS.strictRiskMode,
      showDebugPanel: !!DEFAULTS.showDebugPanel,
      wikipediaBaseUrl: String(DEFAULTS.wikipediaBaseUrl || 'https://en.wikipedia.org'),
      enableGeminiImageMode: !!DEFAULTS.enableGeminiImageMode
    };
  }

  function csLoadSettings() {
    return new Promise((resolve) => {
      try {
        if (!chrome || !chrome.storage || !chrome.storage.sync) {
          console.warn('[ClaimShield] chrome.storage.sync unavailable, using defaults');
          return resolve(cloneDefaults());
        }

        chrome.storage.sync.get({ csSettings: DEFAULTS }, (items) => {
          const raw = items && items.csSettings ? items.csSettings : {};
          const merged = Object.assign(cloneDefaults(), raw || {});
          try {
            if (typeof window !== 'undefined') {
              window.__CS_SETTINGS__ = merged;
            }
          } catch (_) {}
          resolve(merged);
        });
      } catch (e) {
        console.warn('[ClaimShield] Failed to load settings:', e);
        resolve(cloneDefaults());
      }
    });
  }

  function csSaveSettings(partial) {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome || !chrome.storage || !chrome.storage.sync) {
          console.warn('[ClaimShield] chrome.storage.sync unavailable, cannot save');
          return resolve();
        }

        chrome.storage.sync.get({ csSettings: DEFAULTS }, (items) => {
          const raw = items && items.csSettings ? items.csSettings : {};
          const merged = Object.assign(cloneDefaults(), raw || {}, partial || {});
          chrome.storage.sync.set({ csSettings: merged }, () => {
            try {
              if (typeof window !== 'undefined') {
                window.__CS_SETTINGS__ = merged;
              }
            } catch (_) {}
            resolve();
          });
        });
      } catch (e) {
        console.warn('[ClaimShield] Failed to save settings:', e);
        reject(e);
      }
    });
  }

  try {
    if (typeof window !== 'undefined') {
      window.CS_SETTINGS_DEFAULTS = cloneDefaults();
      window.csLoadSettings = csLoadSettings;
      window.csSaveSettings = csSaveSettings;
    }
  } catch (_) {}
})();
