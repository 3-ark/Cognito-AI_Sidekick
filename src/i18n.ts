import { initReactI18next } from 'react-i18next';
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';

const supportedLngs = ['en', 'de', 'es', 'fr', 'hi', 'it', 'ja', 'ko', 'pt', 'zh'];

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    debug: process.env.NODE_ENV === 'development',
    fallbackLng: 'en',
    supportedLngs,
    nonExplicitSupportedLngs: true,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    backend: {
      loadPath: '/_locales/{{lng}}/messages.json',
      parse: (data: string) => {
        const parsedData = JSON.parse(data);
        const result: { [key: string]: string } = {};

        for (const key in parsedData) {
          result[key] = parsedData[key].message;
        }

        return result;
      },
    },
    react: {
      useSuspense: false,
    },
    returnObjects: true,
  });

export default i18n;
