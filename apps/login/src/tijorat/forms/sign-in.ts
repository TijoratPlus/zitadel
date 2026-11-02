"use server";

import { sendLoginname } from "@/lib/server/loginname";
import { resetPassword, sendPassword } from "@/lib/server/password";
import { create } from "@zitadel/client";
import { ChecksSchema } from "@zitadel/proto/zitadel/session/v2/session_service_pb";
import { getTranslations } from "next-intl/server";
import { passwordStepFrom, SignInResult } from "./sign-in-step";

type SignInCommand = {
  loginName: string;
  password: string;
  organization?: string;
  defaultOrganization?: string;
  requestId?: string;
  suffix?: string;
};

/**
 * Email/login name and password from one form. The identifier step (sendLoginname) still decides
 * where the user goes: IdP, passkey-only, invite, registration or the anti-enumeration decoy. Only
 * when it lands on the password step is the typed password checked right away with the same
 * sendPassword the /password page uses, so MFA, password change, email verification and the
 * passkey offer all still apply.
 */
export async function signInWithPassword(command: SignInCommand): Promise<SignInResult> {
  const tLogin = await getTranslations("loginname");
  const tPassword = await getTranslations("password");
  const tSignIn = await getTranslations("tijorat.signIn");

  // An unknown login name and a wrong password read the same, so the form does not reveal which
  // accounts exist even when the instance does not ignore unknown usernames.
  const wrongCredentials = { error: tSignIn("wrongCredentials") };
  const genericErrors = new Set([
    tLogin("errors.userNotFound"),
    tPassword("errors.couldNotCreateSessionForUser"),
    tPassword("errors.couldNotVerifyPassword"),
    tPassword("errors.failedToAuthenticateNoLimit"),
  ]);
  const friendly = (result: SignInResult): SignInResult =>
    result && "error" in result && genericErrors.has(result.error) ? wrongCredentials : result;

  const identified = await sendLoginname({
    loginName: command.loginName,
    organization: command.organization,
    defaultOrganization: command.defaultOrganization,
    requestId: command.requestId,
    suffix: command.suffix,
  });

  const step = passwordStepFrom(identified);
  if (!step) {
    return friendly(identified);
  }

  const checked = await sendPassword({
    loginName: step.loginName,
    organization: step.organization ?? command.organization,
    defaultOrganization: command.defaultOrganization,
    requestId: step.requestId ?? command.requestId,
    checks: create(ChecksSchema, { password: { password: command.password } }),
  });
  return friendly(checked);
}

/** "Forgot password?" from the combined form; same behaviour as the /password page's reset link. */
export async function requestPasswordReset(command: {
  loginName: string;
  organization?: string;
  defaultOrganization?: string;
  requestId?: string;
}): Promise<{ error?: string }> {
  const result = await resetPassword(command);
  return result && "error" in result && typeof result.error === "string" ? { error: result.error } : {};
}
