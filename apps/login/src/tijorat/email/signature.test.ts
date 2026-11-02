import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyZitadelSignature } from "./signature";

const KEY = "98KmsU67";
const PAYLOAD = '{"contextInfo":{"eventType":"user.human.email.code.added"}}';
const NOW = 1_800_000_000_000;

// Same construction as pkg/actions/signing.go ComputeSignatureHeader.
function header(payload: string, key: string, seconds = NOW / 1000): string {
  const mac = createHmac("sha256", key).update(`${seconds}.${payload}`).digest("hex");
  return `t=${seconds},v1=${mac}`;
}

describe("verifyZitadelSignature", () => {
  it("accepts a header made the way ZITADEL makes it", () => {
    expect(verifyZitadelSignature(PAYLOAD, header(PAYLOAD, KEY), KEY, NOW)).toBe(true);
  });

  it("accepts one valid signature among several keys", () => {
    const other = header(PAYLOAD, "old-key").split(",")[1];
    expect(verifyZitadelSignature(PAYLOAD, `${header(PAYLOAD, KEY)},${other}`, KEY, NOW)).toBe(true);
  });

  it("rejects another key, a changed payload, a missing or malformed header", () => {
    expect(verifyZitadelSignature(PAYLOAD, header(PAYLOAD, "wrong"), KEY, NOW)).toBe(false);
    expect(verifyZitadelSignature(PAYLOAD + " ", header(PAYLOAD, KEY), KEY, NOW)).toBe(false);
    expect(verifyZitadelSignature(PAYLOAD, null, KEY, NOW)).toBe(false);
    expect(verifyZitadelSignature(PAYLOAD, "v1=abcd", KEY, NOW)).toBe(false);
    expect(verifyZitadelSignature(PAYLOAD, `t=${NOW / 1000},v1=zz`, KEY, NOW)).toBe(false);
    expect(verifyZitadelSignature(PAYLOAD, header(PAYLOAD, ""), "", NOW)).toBe(false);
  });

  it("rejects a signature older or newer than five minutes", () => {
    expect(verifyZitadelSignature(PAYLOAD, header(PAYLOAD, KEY, NOW / 1000 - 301), KEY, NOW)).toBe(false);
    expect(verifyZitadelSignature(PAYLOAD, header(PAYLOAD, KEY, NOW / 1000 + 301), KEY, NOW)).toBe(false);
    expect(verifyZitadelSignature(PAYLOAD, header(PAYLOAD, KEY, NOW / 1000 - 299), KEY, NOW)).toBe(true);
  });
});
