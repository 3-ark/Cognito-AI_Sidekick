import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    // Best practice: only show debug logs in development mode
    debug: process.env.NODE_ENV === 'development',
    // Define the order in which to try different Chinese language codes.
    // This ensures "zh" falls back to "zh_CN" if available.
    fallbackLng: {
      'zh': ['zh_CN', 'zh_TW'], // Fallback for generic "zh"
      'default': ['en'] // Explicitly set the final fallback
    },
    interpolation: {
      escapeValue: false,
    },
    backend: {
      // This function converts standard codes (e.g., "zh-CN")
      // to your folder structure (e.g., "zh_CN") before fetching.
      loadPath: (lngs: string[]) => {
        const lang = lngs[0];
        const finalLang = lang.replace('-', '_');
        return `/_locales/${finalLang}/messages.json`;
      },
    },
      react: {
      useSuspense: false,
    },
    returnObjects: true,
  });

export default i18n;
