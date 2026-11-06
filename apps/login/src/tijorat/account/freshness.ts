import { timestampDate } from "@zitadel/client";
import { Session } from "@zitadel/proto/zitadel/session/v2/session_pb";

/** Sensitive account changes need a factor checked within this window (re-auth otherwise). */
export const REAUTH_MAX_AGE_MS = 10 * 60 * 1000;

/** The most recent time any factor of the session was checked, or undefined. */
export function lastVerifiedAt(session: Partial<Session> | undefined): Date | undefined {
  const factors = session?.factors;
  const times = [
    factors?.password?.verifiedAt,
    factors?.webAuthN?.verifiedAt,
    factors?.intent?.verifiedAt,
    factors?.totp?.verifiedAt,
    factors?.otpSms?.verifiedAt,
    factors?.otpEmail?.verifiedAt,
  ]
    .filter((t) => !!t)
    .map((t) => timestampDate(t!).getTime());
  return times.length ? new Date(Math.max(...times)) : undefined;
}

export function isRecentlyVerified(session: Partial<Session> | undefined, now = Date.now()): boolean {
  const at = lastVerifiedAt(session);
  return !!at && now - at.getTime() <= REAUTH_MAX_AGE_MS;
}
