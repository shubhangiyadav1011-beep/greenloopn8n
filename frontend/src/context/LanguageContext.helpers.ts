import { createContext, useContext } from "react";

export type LanguageCode = "en" | "ar" | "es" | "de";

export type Language = {
  code: LanguageCode;
  name: string;
  dir: "ltr" | "rtl";
  flag?: string;
};

export const AVAILABLE_LANGUAGES: Language[] = [
  { code: "en", name: "English", dir: "ltr" },
  { code: "ar", name: "العربية", dir: "rtl" },
  { code: "es", name: "Español", dir: "ltr" },
  { code: "de", name: "Deutsch", dir: "ltr" },
];

export type LanguageContextType = {
  language: LanguageCode;
  currentLanguage: Language;
  dir: "ltr" | "rtl";
  setLanguage: (code: LanguageCode) => void;
  availableLanguages: Language[];
};

export const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
