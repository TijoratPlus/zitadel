import { timestampFromMs } from "@zitadel/client";
import { describe, expect, it } from "vitest";
import { isRecentlyVerified, lastVerifiedAt, REAUTH_MAX_AGE_MS } from "./freshness";

const NOW = 1_800_000_000_000;
const at = (ms: number) => ({ verifiedAt: timestampFromMs(ms) });

describe("lastVerifiedAt", () => {
  it("takes the most recent of all checked factors", () => {
    const session = { factors: { password: at(NOW - 5000), totp: at(NOW - 1000), webAuthN: at(NOW - 9000) } } as never;
    expect(lastVerifiedAt(session)?.getTime()).toBe(NOW - 1000);
  });

  it("is undefined without a checked factor", () => {
    expect(lastVerifiedAt({ factors: {} } as never)).toBeUndefined();
    expect(lastVerifiedAt(undefined)).toBeUndefined();
  });
});

describe("isRecentlyVerified", () => {
  it("accepts a check within ten minutes and refuses an older one", () => {
    expect(isRecentlyVerified({ factors: { password: at(NOW - REAUTH_MAX_AGE_MS) } } as never, NOW)).toBe(true);
    expect(isRecentlyVerified({ factors: { password: at(NOW - REAUTH_MAX_AGE_MS - 1) } } as never, NOW)).toBe(false);
    expect(isRecentlyVerified({ factors: {} } as never, NOW)).toBe(false);
  });
});
