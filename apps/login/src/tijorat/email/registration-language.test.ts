import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({ getLocale: vi.fn().mockResolvedValue("tg") }));

import { tijoratRegistrationLanguage } from "./registration-language";

describe("tijoratRegistrationLanguage", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("stores the login language with the Tijorat+ brand", async () => {
    vi.stubEnv("NEXT_PUBLIC_TIJORAT_BRAND", "true");
    expect(await tijoratRegistrationLanguage()).toBe("tg");
  });

  it("leaves upstream registration unchanged without the brand", async () => {
    vi.stubEnv("NEXT_PUBLIC_TIJORAT_BRAND", "false");
    expect(await tijoratRegistrationLanguage()).toBeUndefined();
  });
});
