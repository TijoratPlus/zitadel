import { afterEach, describe, expect, test, vi } from "vitest";
import upstreamEn from "../../../locales/en.json";
import en from "./en.json";
import { getTijoratMessages } from "./index";
import ru from "./ru.json";

function leafKeys(value: unknown, prefix = ""): string[] {
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key));
  }
  return [prefix];
}

describe("Tijorat+ locale overlay", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Fails after an upstream merge renames or drops a key we reword, instead of silently
  // shipping the stock text.
  test.each([
    ["en", en],
    ["ru", ru],
  ])("every reworded %s key exists upstream", (_lang, overlay) => {
    const upstreamKeys = new Set(leafKeys(upstreamEn));
    const reworded = leafKeys(overlay).filter((key) => !key.startsWith("tijorat."));
    expect(reworded.filter((key) => !upstreamKeys.has(key))).toEqual([]);
  });

  test("ru defines every tijorat key that en defines", () => {
    expect(leafKeys(ru.tijorat).sort()).toEqual(leafKeys(en.tijorat).sort());
  });

  test("only the tijorat namespace when the brand is off", () => {
    const messages = getTijoratMessages("ru");
    expect(Object.keys(messages)).toEqual(["tijorat"]);
    expect(messages).toMatchObject({ tijorat: { passkeyOffer: { enable: "Включить" } } });
  });

  test("rewords upstream copy when the brand is on", () => {
    vi.stubEnv("NEXT_PUBLIC_TIJORAT_BRAND", "true");
    expect(getTijoratMessages("ru")).toMatchObject({ common: { title: "Вход в Tijorat+" } });
  });

  test("replaces the stock text the API returns", () => {
    vi.stubEnv("NEXT_PUBLIC_TIJORAT_BRAND", "true");
    const stock = { loginname: { title: "С возвращением!" } };
    const messages = getTijoratMessages("ru", stock, { loginname: { title: "С возвращением!" } });
    expect(messages).toMatchObject({ loginname: { title: "Вход в Tijorat+" } });
  });

  test("keeps a text the admin customised via the API", () => {
    vi.stubEnv("NEXT_PUBLIC_TIJORAT_BRAND", "true");
    const stock = { loginname: { title: "С возвращением!", register: "Зарегистрировать нового пользователя" } };
    const custom = { loginname: { title: "Добро пожаловать в магазин", register: stock.loginname.register } };

    const messages = getTijoratMessages("ru", stock, custom) as any;

    expect(messages.loginname.title).toBeUndefined();
    expect(messages.loginname.register).toBe("Создать аккаунт");
  });

  test("other locales keep upstream copy but get English tijorat keys", () => {
    vi.stubEnv("NEXT_PUBLIC_TIJORAT_BRAND", "true");
    const messages = getTijoratMessages("de");
    expect(Object.keys(messages)).toEqual(["tijorat"]);
    expect(messages).toMatchObject({ tijorat: { passkeyOffer: { enable: "Turn on" } } });
  });
});
