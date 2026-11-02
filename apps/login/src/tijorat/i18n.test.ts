import { afterEach, describe, expect, test, vi } from "vitest";
import { TIJORAT_LANGS, tijoratAllowedLanguages } from "./i18n";

describe("Tijorat+ languages", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test("LANGS is en, ru, tg and uz with the brand on", async () => {
    vi.stubEnv("NEXT_PUBLIC_TIJORAT_BRAND", "true");
    vi.resetModules();
    const { LANGS } = await import("@/lib/i18n");
    expect(LANGS.map((l) => l.code).sort()).toEqual(["en", "ru", "tg", "uz"]);
  });

  test("LANGS stays upstream's list with the brand off", async () => {
    vi.stubEnv("NEXT_PUBLIC_TIJORAT_BRAND", "");
    vi.resetModules();
    const { LANGS } = await import("@/lib/i18n");
    expect(LANGS.map((l) => l.code)).toContain("de");
    expect(LANGS.map((l) => l.code)).not.toContain("tg");
  });

  test("the backend's allowed list is replaced only with the brand on", () => {
    expect(tijoratAllowedLanguages(["en", "de"])).toEqual(["en", "de"]);
    vi.stubEnv("NEXT_PUBLIC_TIJORAT_BRAND", "true");
    expect(tijoratAllowedLanguages(["en", "de"])).toEqual(["ru", "tg", "uz", "en"]);
    expect(tijoratAllowedLanguages([{ name: "English", code: "en" }])).toEqual(TIJORAT_LANGS);
  });
});
