export type SignInResult =
  | { redirect: string }
  | { error: string }
  | { samlData: { url: string; fields: Record<string, string> } }
  | undefined
  | null;

export type PasswordStep = { loginName: string; organization?: string; requestId?: string };

/**
 * Reads sendLoginname's answer: returns the password step's parameters when the user may sign in
 * with a password, null when they must go elsewhere (IdP, passkey only, invite, register, error).
 * A passkey redirect with altPassword=true means the user has a password too, so the typed
 * password is used instead of asking for the passkey.
 */
export function passwordStepFrom(result: SignInResult): PasswordStep | null {
  if (!result || !("redirect" in result) || typeof result.redirect !== "string") {
    return null;
  }
  const redirect = result.redirect;
  // Absolute URLs are IdP or callback redirects, never the password step.
  if (!redirect.startsWith("/")) {
    return null;
  }
  const url = new URL(redirect, "http://login.invalid");
  const isPassword = url.pathname === "/password";
  const isPasskeyWithPassword = url.pathname === "/passkey" && url.searchParams.get("altPassword") === "true";
  const loginName = url.searchParams.get("loginName");
  if (!(isPassword || isPasskeyWithPassword) || !loginName) {
    return null;
  }
  return {
    loginName,
    organization: url.searchParams.get("organization") ?? undefined,
    requestId: url.searchParams.get("requestId") ?? undefined,
  };
}
