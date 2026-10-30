// Which branded email a ZITADEL notification becomes, keyed by the event that triggered it
// (contextInfo.eventType, see internal/notification/handlers/user_notifier.go).
export type EmailKind =
  "verifyEmail" | "passwordReset" | "initCode" | "invite" | "otp" | "passkeyLink" | "passwordChanged" | "domainClaimed";

const KINDS: Record<string, EmailKind> = {
  "user.human.email.code.added": "verifyEmail",
  "user.human.password.code.added": "passwordReset",
  "user.human.initialization.code.added": "initCode",
  "user.human.invite.code.added": "invite",
  "user.human.mfa.otp.email.code.added": "otp",
  "session.otp.email.challenged": "otp",
  "user.human.passwordless.initialization.code.added": "passkeyLink",
  "user.human.passwordless.initialization.code.requested": "passkeyLink",
  "user.human.password.changed": "passwordChanged",
  "user.domain.claimed": "domainClaimed",
};

/**
 * The branded kind, or undefined for an event this fork has no copy for: such mail still goes
 * out in the Tijorat+ layout with ZITADEL's own texts, so an upstream update never drops one.
 */
export function emailKindFor(eventType: unknown): EmailKind | undefined {
  return typeof eventType === "string" ? KINDS[eventType] : undefined;
}
