import { isTijoratBrand } from "./config";

// Same shape as Lang in src/lib/i18n.ts; not imported from there because that file imports this one.
type Lang = { name: string; code: string };

/** The languages Tijorat+ ships, in switcher order. tg and uz exist only in this fork (src/tijorat/locales). */
export const TIJORAT_LANGS: Lang[] = [
  { name: "Русский", code: "ru" },
  { name: "Тоҷикӣ", code: "tg" },
  { name: "O‘zbekcha", code: "uz" },
  { name: "English", code: "en" },
];

/** Short labels for the pill switcher, as in tajerp_ui (TJ for Tajik). */
export const TIJORAT_LANG_LABELS: Record<string, string> = { ru: "RU", tg: "TJ", uz: "UZ", en: "EN" };

/**
 * Languages offered by the login. ZITADEL core cannot list tg or uz as allowed languages (it only
 * knows its own translations), so with the Tijorat+ brand the fork's list replaces the backend's.
 */
export function tijoratAllowedLanguages<T extends string | Lang>(backendAllowed: T[]): T[] {
  if (!isTijoratBrand()) {
    return backendAllowed;
  }
  const byCode = typeof backendAllowed[0] === "string" || backendAllowed.length === 0;
  return (byCode ? TIJORAT_LANGS.map((l) => l.code) : TIJORAT_LANGS) as T[];
}
