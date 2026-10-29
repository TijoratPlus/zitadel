import { afterEach, describe, expect, test, vi } from "vitest";
import { TIJORAT_COLORS, withTijoratColors } from "./colors";

describe("withTijoratColors", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("leaves branding untouched when the brand is off", () => {
    const policy = { lightTheme: { primaryColor: "#5469d4" } } as any;
    expect(withTijoratColors(policy)).toBe(policy);
  });

  test("replaces missing and stock ZITADEL colours with the Tijorat+ palette", () => {
    vi.stubEnv("NEXT_PUBLIC_TIJORAT_BRAND", "true");
    const result = withTijoratColors({
      lightTheme: { primaryColor: "#5469D4", backgroundColor: "#fafafa", warnColor: "", fontColor: "#000000" },
      darkTheme: { primaryColor: "#2073c4", backgroundColor: "#111827", warnColor: "#ff3b5b", fontColor: "#ffffff" },
    } as any);

    expect(result?.lightTheme).toMatchObject(TIJORAT_COLORS.lightTheme);
    expect(result?.darkTheme).toMatchObject(TIJORAT_COLORS.darkTheme);
  });

  test("keeps colours an admin set deliberately", () => {
    vi.stubEnv("NEXT_PUBLIC_TIJORAT_BRAND", "true");
    const result = withTijoratColors({
      lightTheme: { primaryColor: "#123456", logoUrl: "https://cdn/logo.svg" },
    } as any);

    expect(result?.lightTheme?.primaryColor).toBe("#123456");
    expect(result?.lightTheme?.logoUrl).toBe("https://cdn/logo.svg");
    expect(result?.lightTheme?.backgroundColor).toBe(TIJORAT_COLORS.lightTheme.backgroundColor);
  });

  test("fills a missing policy", () => {
    vi.stubEnv("NEXT_PUBLIC_TIJORAT_BRAND", "true");
    expect(withTijoratColors(undefined)?.lightTheme).toMatchObject(TIJORAT_COLORS.lightTheme);
  });
});
