(function (global) {
  const settings = {
    useWebSearch: false,
    googleApiKey: null,
    googleSearchEngineId: null
  };

  const csSettings = {
    get(key) {
      return settings[key];
    },
    set(key, value) {
      settings[key] = value;
    },
    loadFromStorage(storageObj) {
      if (!storageObj) return;
      Object.keys(settings).forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(storageObj, key)) {
          settings[key] = storageObj[key];
        }
      });
    },
    dump() {
      return { ...settings };
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = csSettings;
  } else {
    global.csSettings = csSettings;
  }
})(typeof window !== 'undefined' ? window : globalThis);
