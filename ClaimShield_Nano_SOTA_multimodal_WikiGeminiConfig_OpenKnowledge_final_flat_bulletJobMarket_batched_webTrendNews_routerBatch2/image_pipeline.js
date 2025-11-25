// image_pipeline.js
// Builds a text block that combines the user's claim with image context,
// and returns detailed image flags for risk/UI.

(function () {
  'use strict';

  function getSettings() {
    try {
      return (typeof window !== 'undefined' && window.__CS_SETTINGS__) || {};
    } catch (_) {
      return {};
    }
  }

  async function runLocalOcrStub(imageInfo) {
    return {
      text: '',
      success: false,
      mode: 'none'
    };
  }

  function buildFlags(imageInfo, ocrResult, settings) {
    if (!imageInfo) return { image: null };

    const width = Number(imageInfo.width || 0) || 0;
    const height = Number(imageInfo.height || 0) || 0;
    const alt = (imageInfo.alt || '').trim();

    const ocrEnabled = settings.enableImageOCR !== false;
    const ocrAttempted = !!ocrResult;
    const ocrSuccess = !!(ocrResult && ocrResult.success && ocrResult.text && ocrResult.text.trim().length > 0);
    const ocrText = (ocrResult && ocrResult.text) ? String(ocrResult.text) : '';
    const ocrMode = (ocrResult && ocrResult.mode) || (ocrEnabled ? 'local' : 'none');

    return {
      image: {
        present: true,
        src: imageInfo.src || '',
        width,
        height,
        hasAlt: alt.length > 0,
        altLength: alt.length,
        ocrEnabled,
        ocrAttempted,
        ocrSuccess,
        ocrChars: ocrText.length,
        ocrMode
      }
    };
  }

  function buildBaseImageText(imageInfo) {
    if (!imageInfo) return '';
    const parts = [];
    const width = Number(imageInfo.width || 0) || 0;
    const height = Number(imageInfo.height || 0) || 0;
    const alt = (imageInfo.alt || '').trim();

    parts.push(`[Image context: ${width}x${height}]`);

    if (alt) {
      parts.push(`Alt text: "${alt}"`);
    } else {
      parts.push('Alt text: (none)');
    }

    return parts.join(' ');
  }

  function buildCompositeText(baseText, imageInfo, ocrResult, settings) {
    const trimmed = (baseText || '').trim();
    if (!imageInfo) {
      return trimmed;
    }

    const lines = [];
    if (trimmed) {
      lines.push(trimmed);
    }

    const metaLine = buildBaseImageText(imageInfo);
    if (metaLine) lines.push(metaLine);

    if (settings.enableImageOCR !== false && ocrResult && ocrResult.text) {
      const ocrText = ocrResult.text.trim();
      if (ocrText) {
        lines.push('[OCR text extracted from image]');
        lines.push(ocrText);
      }
    }

    return lines.join('\n\n');
  }

  async function buildTextWithImageAsync(imageInfo, baseText) {
    const settings = getSettings();
    if (!imageInfo) {
      return {
        text: (baseText || '').trim(),
        flags: { image: null }
      };
    }

    let ocrResult = null;
    const useGeminiImage =
      settings && settings.enableGeminiImageMode === true &&
      typeof window !== 'undefined' &&
      window.CS_GeminiImage &&
      typeof window.CS_GeminiImage.analyze === 'function';

    if (useGeminiImage) {
      try {
        ocrResult = await window.CS_GeminiImage.analyze(imageInfo);
      } catch (e) {
        console.warn('[ClaimShield] Gemini image analysis failed, falling back to local OCR:', e);
        ocrResult = null;
      }
    }

    if (!ocrResult && settings.enableImageOCR !== false) {
      try {
        ocrResult = await runLocalOcrStub(imageInfo);
      } catch (e) {
        console.warn('[ClaimShield] OCR stub failed:', e);
        ocrResult = { text: '', success: false, mode: 'error' };
      }
    }

    const text = buildCompositeText(baseText, imageInfo, ocrResult, settings);
    const flags = buildFlags(imageInfo, ocrResult, settings);
    return { text, flags };
  }

  function buildTextWithImageSync(imageInfo, baseText) {
    const settings = getSettings();
    const text = buildCompositeText(baseText, imageInfo, null, settings);
    const flags = buildFlags(imageInfo, null, settings);
    return { text, flags };
  }

  const api = {
    buildTextWithImage: buildTextWithImageAsync,
    buildTextWithImageSync
  };

  try {
    if (typeof window !== 'undefined') {
      window.CS_ImagePipeline = api;
    }
  } catch (_) {}
})();
