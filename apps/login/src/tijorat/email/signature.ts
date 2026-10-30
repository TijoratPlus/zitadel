import { createHmac, timingSafeEqual } from "node:crypto";

// Mirrors pkg/actions/signing.go: "t=<unix seconds>,v1=<hex HMAC-SHA256(key, "<t>.<payload>")>",
// with one v1 part per signing key and a five-minute tolerance.
export const SIGNATURE_HEADER = "zitadel-signature";
const TOLERANCE_SECONDS = 300;

/** True when `header` carries a valid, fresh signature of `payload` made with `key`. */
export function verifyZitadelSignature(payload: string, header: string | null, key: string, now = Date.now()): boolean {
  if (!header || !key) {
    return false;
  }
  let timestamp: string | undefined;
  const signatures: Buffer[] = [];
  for (const part of header.split(",")) {
    const [name, value] = part.trim().split("=", 2);
    if (name === "t") {
      timestamp = value;
    } else if (name === "v1" && value && /^[0-9a-f]+$/i.test(value)) {
      signatures.push(Buffer.from(value, "hex"));
    }
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || !signatures.length) {
    return false;
  }
  if (Math.abs(now / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) {
    return false;
  }
  const expected = createHmac("sha256", key).update(`${timestamp}.`).update(payload).digest();
  return signatures.some((signature) => signature.length === expected.length && timingSafeEqual(signature, expected));
}
