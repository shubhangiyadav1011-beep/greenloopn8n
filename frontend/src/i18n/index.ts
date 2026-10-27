import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "../locales/en/common.json";

import esCommon from "../locales/es/common.json";
import deCommon from "../locales/de/common.json";
import arCommon from "../locales/ar/common.json";

export const resources = {
  es: { common: esCommon },
  de: { common: deCommon },
  ar: { common: arCommon },
  en: {
    common: enCommon,
  },
} as const;

export const defaultNS = "common";
export const fallbackLng = "en";

const savedLng =
  typeof window !== "undefined"
    ? localStorage.getItem("i18nextLng") || localStorage.getItem("language")
    : null;
const browserLng =
  typeof window !== "undefined"
    ? navigator.language.split("-")[0]
    : fallbackLng;
const initialLng =
  savedLng ||
  (resources[browserLng as keyof typeof resources] ? browserLng : fallbackLng);

function normalizeBraces<T>(obj: T): T {
  if (typeof obj === "string") {
    return obj.replace(/\{+([a-zA-Z0-9_]+)\}+/g, "{{$1}}") as unknown as T;
  }
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> | unknown[] = Array.isArray(obj) ? [] : {};
    for (const [k, v] of Object.entries(obj)) {
      (out as Record<string, unknown>)[k] = normalizeBraces(v);
    }
    return out as T;
  }
  return obj;
}

i18n.use(initReactI18next).init({
  resources: normalizeBraces(resources),
  lng: initialLng,
  fallbackLng,
  defaultNS,
  ns: ["common"],
  interpolation: {
    escapeValue: false, // React already escapes values
  },
});

export default i18n;
