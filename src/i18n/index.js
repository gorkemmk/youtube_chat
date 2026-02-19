const langs = {
  en: require('./en.json'),
  tr: require('./tr.json'),
  es: require('./es.json'),
  pt: require('./pt.json'),
  de: require('./de.json'),
};

const defaultLang = 'en';
const supportedLangs = Object.keys(langs);

function t(lang, key, replacements = {}) {
  const dict = langs[lang] || langs[defaultLang];
  let val = key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : null), dict);
  if (val === null) {
    val = key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : null), langs[defaultLang]);
  }
  if (val === null) return key;
  for (const [k, v] of Object.entries(replacements)) {
    val = val.replace(new RegExp(`{{${k}}}`, 'g'), v);
  }
  return val;
}

function getLangData(lang) {
  return langs[lang] || langs[defaultLang];
}

module.exports = { t, getLangData, supportedLangs, defaultLang };
