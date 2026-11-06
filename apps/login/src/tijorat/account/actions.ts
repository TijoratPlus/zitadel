"use server";

import { getAllSessionCookieIds, setLanguageCookie } from "@/lib/cookies";
import { getPublicHost, getPublicHostWithProtocol } from "@/lib/server/host";
import { clearSession, updateOrCreateSession } from "@/lib/server/session";
import { getLoginSettings } from "@/lib/zitadel";
import { create, JsonObject } from "@zitadel/client";
import { RequestChallengesSchema, UserVerificationRequirement } from "@zitadel/proto/zitadel/session/v2/challenge_pb";
import { ChecksSchema } from "@zitadel/proto/zitadel/session/v2/session_service_pb";
import { headers } from "next/headers";
import { TIJORAT_LANGS } from "../i18n";
import { accountErrorKey, ActionResult } from "./errors";
import { isRecentlyVerified } from "./freshness";
import { AccountContext, loadAccountContext, selfServices } from "./session";

type Run<T> = (ctx: AccountContext) => Promise<ActionResult<T>>;

/** Every action needs a valid session; `sensitive` ones also a factor checked in the last 10 minutes. */
async function withAccount<T>(run: Run<T>, sensitive = false): Promise<ActionResult<T>> {
  const ctx = await loadAccountContext();
  if (!ctx) {
    return { error: "sessionExpired" };
  }
  if (sensitive && !isRecentlyVerified(ctx.session)) {
    return { reauth: true };
  }
  return run(ctx);
}

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

async function hostname(): Promise<string> {
  const [name] = getPublicHost(await headers()).split(":");
  return name;
}

// ---- profile -------------------------------------------------------------------------------

export async function updateProfile(input: {
  givenName: string;
  familyName: string;
  language: string;
}): Promise<ActionResult> {
  const givenName = input.givenName.trim();
  const familyName = input.familyName.trim();
  const language = TIJORAT_LANGS.some((lang) => lang.code === input.language) ? input.language : undefined;
  if (!givenName || !familyName || givenName.length > 200 || familyName.length > 200) {
    return { error: "invalidInput" };
  }
  return withAccount(async (ctx) => {
    try {
      await selfServices(ctx).users.updateHumanUser({
        userId: ctx.userId,
        profile: { givenName, familyName, displayName: `${givenName} ${familyName}`, preferredLanguage: language },
      });
      if (language) {
        await setLanguageCookie(language);
      }
      return ok(undefined);
    } catch (error) {
      return { error: accountErrorKey(error) };
    }
  });
}

// ---- email and phone -----------------------------------------------------------------------

export async function startEmailChange(email: string): Promise<ActionResult> {
  const value = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 200) {
    return { error: "invalidInput" };
  }
  return withAccount(async (ctx) => {
    const _headers = await headers();
    const base = `${getPublicHostWithProtocol(_headers)}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}`;
    try {
      await selfServices(ctx).users.setEmail({
        userId: ctx.userId,
        email: value,
        verification: {
          case: "sendCode",
          value: { urlTemplate: `${base}/verify?code={{.Code}}&userId={{.UserID}}&organization={{.OrgID}}` },
        },
      });
      return ok(undefined);
    } catch (error) {
      return { error: accountErrorKey(error) };
    }
  }, true);
}

export async function confirmEmail(code: string): Promise<ActionResult> {
  return withAccount(async (ctx) => {
    try {
      await selfServices(ctx).users.verifyEmail({ userId: ctx.userId, verificationCode: code.trim() });
      return ok(undefined);
    } catch (error) {
      return { error: accountErrorKey(error, "code") };
    }
  });
}

export async function resendEmailCode(): Promise<ActionResult> {
  return withAccount(async (ctx) => {
    try {
      await selfServices(ctx).users.resendEmailCode({ userId: ctx.userId });
      return ok(undefined);
    } catch (error) {
      return { error: accountErrorKey(error) };
    }
  });
}

export async function startPhoneChange(phone: string): Promise<ActionResult> {
  const value = phone.replace(/[\s()-]/g, "");
  if (!/^\+?[0-9]{7,15}$/.test(value)) {
    return { error: "invalidInput" };
  }
  return withAccount(async (ctx) => {
    try {
      await selfServices(ctx).users.setPhone({
        userId: ctx.userId,
        phone: value,
        verification: { case: "sendCode", value: {} },
      });
      return ok(undefined);
    } catch (error) {
      return { error: accountErrorKey(error) };
    }
  }, true);
}

export async function confirmPhone(code: string): Promise<ActionResult> {
  return withAccount(async (ctx) => {
    try {
      await selfServices(ctx).users.verifyPhone({ userId: ctx.userId, verificationCode: code.trim() });
      return ok(undefined);
    } catch (error) {
      return { error: accountErrorKey(error, "code") };
    }
  });
}

export async function removePhone(): Promise<ActionResult> {
  return withAccount(async (ctx) => {
    try {
      await selfServices(ctx).users.removePhone({ userId: ctx.userId });
      return ok(undefined);
    } catch (error) {
      return { error: accountErrorKey(error) };
    }
  }, true);
}

// ---- password ------------------------------------------------------------------------------

/** The current password is the check here, so no separate re-auth is needed. */
export async function changePassword(input: { currentPassword: string; newPassword: string }): Promise<ActionResult> {
  if (!input.currentPassword || !input.newPassword) {
    return { error: "invalidInput" };
  }
  return withAccount(async (ctx) => {
    try {
      await selfServices(ctx).users.setPassword({
        userId: ctx.userId,
        newPassword: { password: input.newPassword, changeRequired: false },
        verification: { case: "currentPassword", value: input.currentPassword },
      });
    } catch (error) {
      return { error: accountErrorKey(error, "password") };
    }
    // ZITADEL ends the session's password check on a change; check the new password right away
    // (or open a new session) so the user stays signed in, as the upstream change form does.
    await updateOrCreateSession({
      sessionId: ctx.cookie.id,
      loginName: ctx.cookie.loginName,
      organization: ctx.cookie.organization,
      checks: create(ChecksSchema, { password: { password: input.newPassword } }),
      lifetime: await checkLifetime(ctx, "password"),
    }).catch(() => undefined);
    return ok(undefined);
  });
}

// ---- passkeys and security keys (WebAuthn) -------------------------------------------------

export async function beginPasskey(): Promise<ActionResult<{ id: string; options: JsonObject }>> {
  return withAccount(async (ctx) => {
    try {
      const resp = await selfServices(ctx).users.registerPasskey({ userId: ctx.userId, domain: await hostname() });
      return ok({ id: resp.passkeyId, options: (resp.publicKeyCredentialCreationOptions ?? {}) as JsonObject });
    } catch (error) {
      return { error: accountErrorKey(error) };
    }
  }, true);
}

export async function finishPasskey(input: { id: string; name: string; credential: JsonObject }): Promise<ActionResult> {
  return withAccount(async (ctx) => {
    try {
      await selfServices(ctx).users.verifyPasskeyRegistration({
        userId: ctx.userId,
        passkeyId: input.id,
        passkeyName: input.name.slice(0, 200),
        publicKeyCredential: input.credential,
      });
      return ok(undefined);
    } catch (error) {
      return { error: accountErrorKey(error) };
    }
  });
}

export async function removePasskey(passkeyId: string): Promise<ActionResult> {
  return withAccount(async (ctx) => {
    try {
      await selfServices(ctx).users.removePasskey({ userId: ctx.userId, passkeyId });
      return ok(undefined);
    } catch (error) {
      return { error: accountErrorKey(error) };
    }
  }, true);
}

export async function beginU2F(): Promise<ActionResult<{ id: string; options: JsonObject }>> {
  return withAccount(async (ctx) => {
    try {
      const resp = await selfServices(ctx).users.registerU2F({ userId: ctx.userId, domain: await hostname() });
      return ok({ id: resp.u2fId, options: (resp.publicKeyCredentialCreationOptions ?? {}) as JsonObject });
    } catch (error) {
      return { error: accountErrorKey(error) };
    }
  }, true);
}

export async function finishU2F(input: { id: string; name: string; credential: JsonObject }): Promise<ActionResult> {
  return withAccount(async (ctx) => {
    try {
      await selfServices(ctx).users.verifyU2FRegistration({
        userId: ctx.userId,
        u2fId: input.id,
        tokenName: input.name.slice(0, 200),
        publicKeyCredential: input.credential,
      });
      return ok(undefined);
    } catch (error) {
      return { error: accountErrorKey(error) };
    }
  });
}

export async function removeU2F(u2fId: string): Promise<ActionResult> {
  return withAccount(async (ctx) => {
    try {
      await selfServices(ctx).users.removeU2F({ userId: ctx.userId, u2fId });
      return ok(undefined);
    } catch (error) {
      return { error: accountErrorKey(error) };
    }
  }, true);
}

// ---- one-time codes ------------------------------------------------------------------------

export async function beginTotp(): Promise<ActionResult<{ uri: string; secret: string }>> {
  return withAccount(async (ctx) => {
    try {
      const resp = await selfServices(ctx).users.registerTOTP({ userId: ctx.userId });
      return ok({ uri: resp.uri, secret: resp.secret });
    } catch (error) {
      return { error: accountErrorKey(error) };
    }
  }, true);
}

export async function finishTotp(code: string): Promise<ActionResult> {
  return withAccount(async (ctx) => {
    try {
      await selfServices(ctx).users.verifyTOTPRegistration({ userId: ctx.userId, code: code.trim() });
    } catch (error) {
      return { error: accountErrorKey(error, "code") };
    }
    // With a second factor set up, ZITADEL wants it checked on the session; the code just entered
    // is still valid, so check it right away and the user stays on the page.
    await updateOrCreateSession({
      sessionId: ctx.cookie.id,
      checks: create(ChecksSchema, { totp: { code: code.trim() } }),
      lifetime: await checkLifetime(ctx, "webAuthN"),
    }).catch(() => undefined);
    return ok(undefined);
  });
}

export type OtpKind = "totp" | "otpEmail" | "otpSms";

export async function enableOtp(kind: Exclude<OtpKind, "totp">): Promise<ActionResult> {
  return withAccount(async (ctx) => {
    const users = selfServices(ctx).users;
    try {
      if (kind === "otpEmail") {
        await users.addOTPEmail({ userId: ctx.userId });
      } else {
        await users.addOTPSMS({ userId: ctx.userId });
      }
      return ok(undefined);
    } catch (error) {
      return { error: accountErrorKey(error) };
    }
  }, true);
}

export async function disableOtp(kind: OtpKind): Promise<ActionResult> {
  return withAccount(async (ctx) => {
    const users = selfServices(ctx).users;
    try {
      if (kind === "totp") {
        await users.removeTOTP({ userId: ctx.userId });
      } else if (kind === "otpEmail") {
        await users.removeOTPEmail({ userId: ctx.userId });
      } else {
        await users.removeOTPSMS({ userId: ctx.userId });
      }
      return ok(undefined);
    } catch (error) {
      return { error: accountErrorKey(error) };
    }
  }, true);
}

// ---- re-authentication ---------------------------------------------------------------------

async function checkLifetime(ctx: AccountContext, kind: "password" | "webAuthN") {
  const settings = await getLoginSettings({ serviceConfig: ctx.serviceConfig, organization: ctx.cookie.organization });
  return kind === "password" ? settings?.passwordCheckLifetime : settings?.multiFactorCheckLifetime;
}

export async function reauthWithPassword(password: string): Promise<ActionResult> {
  return withAccount(async (ctx) => {
    const result = await updateOrCreateSession({
      sessionId: ctx.cookie.id,
      checks: create(ChecksSchema, { password: { password } }),
      lifetime: await checkLifetime(ctx, "password"),
    }).catch(() => undefined);
    return result && !("error" in result) ? ok(undefined) : { error: "wrongPassword" };
  });
}

export async function beginReauthPasskey(): Promise<ActionResult<{ options: JsonObject }>> {
  return withAccount(async (ctx) => {
    const result = await updateOrCreateSession({
      sessionId: ctx.cookie.id,
      challenges: create(RequestChallengesSchema, {
        webAuthN: { domain: "", userVerificationRequirement: UserVerificationRequirement.REQUIRED },
      }),
    }).catch(() => undefined);
    const options =
      result && !("error" in result) ? result.challenges?.webAuthN?.publicKeyCredentialRequestOptions : undefined;
    return options ? ok({ options: options as JsonObject }) : { error: "generic" };
  });
}

export async function finishReauthPasskey(assertion: JsonObject): Promise<ActionResult> {
  return withAccount(async (ctx) => {
    const result = await updateOrCreateSession({
      sessionId: ctx.cookie.id,
      checks: create(ChecksSchema, { webAuthN: { credentialAssertionData: assertion } }),
      lifetime: await checkLifetime(ctx, "webAuthN"),
    }).catch(() => undefined);
    return result && !("error" in result) ? ok(undefined) : { error: "cancelled" };
  });
}

// ---- sessions ------------------------------------------------------------------------------

/** Ends every other session of the user; this browser stays signed in. */
export async function signOutOtherSessions(): Promise<ActionResult<{ count: number }>> {
  return withAccount(async (ctx) => {
    const { sessions } = selfServices(ctx);
    try {
      const list = await sessions.listSessions({
        queries: [{ query: { case: "userIdQuery", value: { id: ctx.userId } } }],
      });
      const others = list.sessions.filter((s) => s.id !== ctx.cookie.id);
      await Promise.all(others.map((s) => sessions.deleteSession({ sessionId: s.id })));
      return ok({ count: others.length });
    } catch (error) {
      return { error: accountErrorKey(error) };
    }
  }, true);
}

/**
 * Signs this user out of this browser: every session of theirs in the cookie, not only the most
 * recent one (a re-check can leave an older session of the same user that would keep the page open).
 */
export async function signOut(): Promise<ActionResult> {
  return withAccount(async (ctx) => {
    const own = await selfServices(ctx)
      .sessions.listSessions({ queries: [{ query: { case: "userIdQuery", value: { id: ctx.userId } } }] })
      .then((list) => new Set(list.sessions.map((s) => s.id)))
      .catch(() => new Set<string>());
    own.add(ctx.cookie.id);
    const ids = (await getAllSessionCookieIds()).filter((id) => own.has(id));
    for (const sessionId of ids) {
      await clearSession({ sessionId }).catch(() => undefined);
    }
    return ok(undefined);
  });
}
