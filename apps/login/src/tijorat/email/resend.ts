import { EmailKind } from "./kinds";

const RESEND_API = "https://api.resend.com/emails";

// Templates live in Resend, one per kind and language, aliased tj-<slug>-<locale>; they are
// edited in the Resend dashboard. Only their aliases and variables are known here.
const SLUGS: Record<EmailKind, string> = {
  verifyEmail: "verify-email",
  passwordReset: "password-reset",
  initCode: "init-code",
  invite: "invite",
  otp: "otp",
  passkeyLink: "passkey-link",
  passwordChanged: "password-changed",
  domainClaimed: "domain-claimed",
};

/** Template for events without their own: one for all languages, as ZITADEL sends the texts. */
export const GENERIC_TEMPLATE = "tj-generic";

export function resendTemplateAlias(kind: EmailKind | undefined, locale: string): string {
  return kind ? `tj-${SLUGS[kind]}-${locale}` : GENERIC_TEMPLATE;
}

export type OutgoingEmail = {
  kind?: EmailKind;
  locale: string;
  variables: Record<string, string>;
  /** Only for the generic template, whose subject comes from ZITADEL. */
  subject?: string;
  /** Stable for retries of one ZITADEL notification, so Resend sends it once. */
  idempotencyKey: string;
};

export function resendRequestBody(to: string, from: string, email: OutgoingEmail): Record<string, unknown> {
  return {
    from,
    to: [to],
    ...(email.subject && { subject: email.subject }),
    template: { id: resendTemplateAlias(email.kind, email.locale), variables: email.variables },
    tags: [{ name: "kind", value: email.kind ?? "generic" }],
  };
}

export async function sendEmail(to: string, email: OutgoingEmail, fetchImpl: typeof fetch = fetch): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.TIJORAT_EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY and TIJORAT_EMAIL_FROM must be set to send email");
  }
  const response = await fetchImpl(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": email.idempotencyKey,
    },
    body: JSON.stringify(resendRequestBody(to, from, email)),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    // Resend's error body names the problem (e.g. an unpublished template), never the recipient.
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend answered ${response.status}: ${detail.slice(0, 300)}`);
  }
}
