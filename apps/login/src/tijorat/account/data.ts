import { getLoginSettings, getPasswordComplexitySettings } from "@/lib/zitadel";
import { timestampDate } from "@zitadel/client";
import { PasskeysType, SecondFactorType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { AuthFactorState } from "@zitadel/proto/zitadel/user/v2/user_pb";
import { AuthenticationMethodType } from "@zitadel/proto/zitadel/user/v2/user_service_pb";
import "server-only";
import { isMfaRequired } from "./errors";
import { isRecentlyVerified } from "./freshness";
import { AccountContext, loadAccountContext, selfServices } from "./session";

/** Plain, serialisable view of the account for the client page (no bigint, no proto messages). */
export type AccountData = {
  user: {
    givenName: string;
    familyName: string;
    displayName: string;
    loginName: string;
    language: string;
    email: string;
    emailVerified: boolean;
    phone: string;
    phoneVerified: boolean;
  };
  hasPassword: boolean;
  hasPasskey: boolean;
  recentlyVerified: boolean;
  passkeys: { id: string; name: string }[];
  u2f: { id: string; name: string }[];
  totp: boolean;
  otpEmail: boolean;
  otpSms: boolean;
  allowed: { passkeys: boolean; totp: boolean; u2f: boolean; otpEmail: boolean; otpSms: boolean };
  complexity: {
    minLength: number;
    lowercase: boolean;
    uppercase: boolean;
    number: boolean;
    symbol: boolean;
  };
  sessions: { id: string; current: boolean; description: string; ip: string; lastActive?: string }[];
};

async function read(ctx: AccountContext): Promise<AccountData> {
  const { users, sessions } = selfServices(ctx);
  const [userResp, methods, factors, passkeys, sessionList, loginSettings, complexity] = await Promise.all([
    users.getUserByID({ userId: ctx.userId }),
    users.listAuthenticationMethodTypes({ userId: ctx.userId }),
    users.listAuthenticationFactors({ userId: ctx.userId }),
    users.listPasskeys({ userId: ctx.userId }),
    sessions
      .listSessions({ queries: [{ query: { case: "userIdQuery", value: { id: ctx.userId } } }] })
      .catch(() => undefined),
    getLoginSettings({ serviceConfig: ctx.serviceConfig, organization: ctx.cookie.organization }),
    getPasswordComplexitySettings({ serviceConfig: ctx.serviceConfig, organization: ctx.cookie.organization }),
  ]);

  const human = userResp.user?.type.case === "human" ? userResp.user.type.value : undefined;
  const ready = factors.result.filter((f) => f.state === AuthFactorState.READY);
  const second = new Set(loginSettings?.secondFactors ?? []);
  const methodTypes = new Set(methods.authMethodTypes);

  return {
    user: {
      givenName: human?.profile?.givenName ?? "",
      familyName: human?.profile?.familyName ?? "",
      displayName: human?.profile?.displayName ?? "",
      loginName: userResp.user?.preferredLoginName ?? "",
      language: human?.profile?.preferredLanguage ?? "",
      email: human?.email?.email ?? "",
      emailVerified: !!human?.email?.isVerified,
      phone: human?.phone?.phone ?? "",
      phoneVerified: !!human?.phone?.isVerified,
    },
    hasPassword: methodTypes.has(AuthenticationMethodType.PASSWORD),
    hasPasskey: methodTypes.has(AuthenticationMethodType.PASSKEY),
    recentlyVerified: isRecentlyVerified(ctx.session),
    passkeys: passkeys.result.filter((p) => p.state === AuthFactorState.READY).map((p) => ({ id: p.id, name: p.name })),
    u2f: ready.flatMap((f) => (f.type.case === "u2f" ? [{ id: f.type.value.id, name: f.type.value.name }] : [])),
    totp: ready.some((f) => f.type.case === "otp"),
    otpEmail: ready.some((f) => f.type.case === "otpEmail"),
    otpSms: ready.some((f) => f.type.case === "otpSms"),
    allowed: {
      passkeys: loginSettings?.passkeysType === PasskeysType.ALLOWED,
      totp: second.has(SecondFactorType.TOTP),
      u2f: second.has(SecondFactorType.U2F),
      otpEmail: second.has(SecondFactorType.OTP_EMAIL),
      otpSms: second.has(SecondFactorType.OTP_SMS),
    },
    complexity: {
      minLength: Number(complexity?.minLength ?? 8),
      lowercase: !!complexity?.requiresLowercase,
      uppercase: !!complexity?.requiresUppercase,
      number: !!complexity?.requiresNumber,
      symbol: !!complexity?.requiresSymbol,
    },
    sessions: (sessionList?.sessions ?? []).map((s) => ({
      id: s.id,
      current: s.id === ctx.cookie.id,
      description: deviceName(s.userAgent?.description),
      ip: s.userAgent?.ip ?? "",
      lastActive: s.changeDate ? timestampDate(s.changeDate).toISOString() : undefined,
    })),
  };
}

/** ZITADEL's user agent description joins header parts with commas and keeps empty ones. */
export function deviceName(description?: string): string {
  const parts = (description ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part, index, all) => part && all.indexOf(part) === index);
  return parts.slice(0, 3).join(", ");
}

export type AccountLoad =
  { kind: "signedOut" } | { kind: "mfaRequired"; params: Record<string, string> } | { kind: "ok"; data: AccountData };

/** The account page's data, or why it cannot be shown (sign-in or second-factor check needed). */
export async function loadAccountData(): Promise<AccountLoad> {
  const ctx = await loadAccountContext();
  if (!ctx) {
    return { kind: "signedOut" };
  }
  try {
    return { kind: "ok", data: await read(ctx) };
  } catch (error) {
    if (isMfaRequired(error)) {
      const params: Record<string, string> = { sessionId: ctx.cookie.id, loginName: ctx.cookie.loginName };
      if (ctx.cookie.organization) {
        params.organization = ctx.cookie.organization;
      }
      return { kind: "mfaRequired", params };
    }
    throw error;
  }
}
