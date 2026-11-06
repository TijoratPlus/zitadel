import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./session", () => ({ loadAccountContext: vi.fn(), selfServices: vi.fn() }));
vi.mock("@/lib/zitadel", () => ({ getLoginSettings: vi.fn(), getPasswordComplexitySettings: vi.fn() }));

import { deviceName } from "./data";

describe("deviceName", () => {
  it("drops the empty and repeated parts of ZITADEL's user agent description", () => {
    expect(deviceName("Chrome Headless, 153.0.8010.12, , , Blink, 153.0.8010.12, , Linux, x86_64, ")).toBe(
      "Chrome Headless, 153.0.8010.12, Blink",
    );
    expect(deviceName(undefined)).toBe("");
  });
});
