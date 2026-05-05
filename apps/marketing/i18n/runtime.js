import { messages as enMessages } from './en.js';
import { messages as frCAMessages } from './fr-CA.js';

const DEFAULT_LOCALE = 'en';
const STORAGE_KEY = 'envoi.locale';
const messages = {
  en: enMessages,
  'fr-CA': frCAMessages,
};

function normalizeLocale(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace('_', '-');
  if (normalized === 'en' || normalized === 'en-ca' || normalized === 'en-us') return 'en';
  if (normalized === 'fr' || normalized === 'fr-ca' || normalized === 'fr-fr') return 'fr-CA';
  return null;
}

function readQueryLocale() {
  return normalizeLocale(new URLSearchParams(window.location.search).get('lang'));
}

function readStoredLocale() {
  try {
    return normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function readBrowserLocale() {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const language of languages) {
    const locale = normalizeLocale(language);
    if (locale) return locale;
  }
  return null;
}

function t(locale, key) {
  return messages[locale]?.[key] ?? messages[DEFAULT_LOCALE][key] ?? key;
}

function applyText(locale) {
  const otherLocale = locale === 'fr-CA' ? 'en' : 'fr-CA';
  document.documentElement.lang = t(locale, 'htmlLang');
  document.title = t(locale, 'meta.title');

  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.getAttribute('data-i18n');
    if (key) element.textContent = t(locale, key);
  });

  document.querySelectorAll('[data-i18n-html]').forEach((element) => {
    const key = element.getAttribute('data-i18n-html');
    if (key) element.innerHTML = t(locale, key);
  });

  document.querySelectorAll('[data-i18n-attr]').forEach((element) => {
    const pairs = element.getAttribute('data-i18n-attr')?.split(';') ?? [];
    for (const pair of pairs) {
      const [attribute, key] = pair.split(':').map((part) => part.trim());
      if (attribute && key) element.setAttribute(attribute, t(locale, key));
    }
  });

  document.querySelectorAll('[data-locale-toggle]').forEach((button) => {
    button.textContent = t(locale, otherLocale === 'fr-CA' ? 'language.french' : 'language.english');
    button.setAttribute('data-locale-next', otherLocale);
  });
}

function setLocale(locale, persist) {
  applyText(locale);
  if (persist) {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Ignore storage failures; the current view still changes language.
    }
  }
}

const activeLocale = readQueryLocale() ?? readStoredLocale() ?? readBrowserLocale() ?? DEFAULT_LOCALE;
setLocale(activeLocale, false);

document.querySelectorAll('[data-locale-toggle]').forEach((button) => {
  button.addEventListener('click', () => {
    setLocale(normalizeLocale(button.getAttribute('data-locale-next')) ?? DEFAULT_LOCALE, true);
  });
});
