(function () {
  const STORAGE_KEY = 'strevio_lang';
  const DEFAULT_LANG = 'en';
  const SUPPORTED = ['en', 'tr', 'es', 'pt', 'de'];
  const LANG_NAMES = { en: 'English', tr: 'Türkçe', es: 'Español', pt: 'Português', de: 'Deutsch' };

  let _langData = null;
  let _currentLang = localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;

  function getCurrentLang() { return _currentLang; }

  function setLang(lang) {
    if (!SUPPORTED.includes(lang)) lang = DEFAULT_LANG;
    _currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
  }

  async function loadLang(lang) {
    if (!SUPPORTED.includes(lang)) lang = DEFAULT_LANG;
    try {
      const res = await fetch(`/api/i18n/${lang}`);
      const data = await res.json();
      if (data.success) {
        _langData = data.data;
        _currentLang = lang;
        localStorage.setItem(STORAGE_KEY, lang);
        return _langData;
      }
    } catch (e) {
      console.warn('[i18n] Failed to load language:', lang, e);
    }
    return null;
  }

  function t(key, replacements) {
    if (!_langData) return key;
    const parts = key.split('.');
    let val = _langData;
    for (const p of parts) {
      if (val && typeof val === 'object' && p in val) {
        val = val[p];
      } else {
        return key;
      }
    }
    if (typeof val === 'string' && replacements) {
      for (const [k, v] of Object.entries(replacements)) {
        val = val.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
      }
    }
    return val;
  }

  function applyTranslations() {
    if (!_langData) return;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const val = t(key);
      if (val !== key) el.textContent = val;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const val = t(key);
      if (val !== key) el.placeholder = val;
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      const val = t(key);
      if (val !== key) el.innerHTML = val;
    });
  }

  function createLangSelector(onChange) {
    const select = document.createElement('select');
    select.className = 'form-input';
    select.id = 'langSelector';
    for (const lang of SUPPORTED) {
      const opt = document.createElement('option');
      opt.value = lang;
      opt.textContent = LANG_NAMES[lang];
      if (lang === _currentLang) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener('change', async () => {
      await loadLang(select.value);
      applyTranslations();
      if (onChange) onChange(select.value);
    });
    return select;
  }

  window.i18n = {
    getCurrentLang,
    setLang,
    loadLang,
    t,
    applyTranslations,
    createLangSelector,
    SUPPORTED,
    LANG_NAMES,
  };
})();
