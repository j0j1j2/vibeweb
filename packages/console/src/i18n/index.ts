import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ko from "./ko.json";
import en from "./en.json";

const savedLang = localStorage.getItem("vibeweb-lang");
const browserLang = navigator.language.startsWith("en") ? "en" : "ko";

i18n.use(initReactI18next).init({
  resources: { ko: { translation: ko }, en: { translation: en } },
  lng: savedLang || browserLang,
  fallbackLng: "ko",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (lng) => {
  localStorage.setItem("vibeweb-lang", lng);
  document.documentElement.lang = lng;
});

export default i18n;
