import { Code, ConnectError } from "@connectrpc/connect";

/** Result of an account action: data, an error key under tijorat.account.errors, or a re-auth demand. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { error: AccountErrorKey } | { reauth: true };

export type AccountErrorKey =
  | "sessionExpired"
  | "mfaRequired"
  | "invalidCode"
  | "wrongPassword"
  | "weakPassword"
  | "invalidInput"
  | "notAvailable"
  | "alreadyExists"
  | "cancelled"
  | "generic";

/**
 * Maps a ZITADEL error to a message key. The raw message is never shown: it can name internal
 * ids. `context` narrows InvalidArgument, which ZITADEL uses for wrong codes and passwords alike.
 */
export function accountErrorKey(error: unknown, context?: "code" | "password" | "newPassword"): AccountErrorKey {
  const err = ConnectError.from(error);
  if (isMfaRequired(err)) {
    return "mfaRequired";
  }
  switch (err.code) {
    case Code.Unauthenticated:
    case Code.PermissionDenied:
      return "sessionExpired";
    case Code.AlreadyExists:
      return "alreadyExists";
    case Code.FailedPrecondition:
    case Code.Unimplemented:
      return "notAvailable";
    case Code.InvalidArgument:
      return context === "code"
        ? "invalidCode"
        : context === "password"
          ? "wrongPassword"
          : context === "newPassword"
            ? "weakPassword"
            : "invalidInput";
    default:
      return "generic";
  }
}

/**
 * Once a second factor is set up, ZITADEL refuses the session token until the session also has
 * that factor checked ("mfa required", AUTHZ-Kl3p0). The page then sends the user through the
 * login's /mfa check, which returns to the account page.
 */
export function isMfaRequired(error: unknown): boolean {
  const err = ConnectError.from(error);
  return err.code === Code.PermissionDenied && /mfa required|AUTHZ-Kl3p0/i.test(err.rawMessage);
}
