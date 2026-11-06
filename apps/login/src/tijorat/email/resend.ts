import { EmailKind } from "./kinds";
import { LOGO_CID, LOGO_PNG_BASE64 } from "./logo";
import { RenderedEmail } from "./render";

const RESEND_API = "https://api.resend.com/emails";

// Template aliases in Resend are tj-<slug>-<locale>, one per kind and language. The templates
// themselves are edited in the Resend dashboard; only their aliases and variables live here.
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

export function resendTemplateAlias(kind: EmailKind, locale: string): string {
  return `tj-${SLUGS[kind]}-${locale}`;
}

export type OutgoingEmail = {
  /** Undefined for an event the fork has no template for: then `rendered` is sent as is. */
  kind?: EmailKind;
  locale: string;
  rendered: RenderedEmail;
  variables: Record<string, string>;
  /** Stable for retries of one ZITADEL notification, so Resend sends it once. */
  idempotencyKey: string;
};

export function resendRequestBody(to: string, from: string, email: OutgoingEmail): Record<string, unknown> {
  const tags = [{ name: "kind", value: email.kind ?? "generic" }];
  if (email.kind) {
    return {
      from,
      to: [to],
      template: { id: resendTemplateAlias(email.kind, email.locale), variables: email.variables },
      tags,
    };
  }
  return {
    from,
    to: [to],
    subject: email.rendered.subject,
    html: email.rendered.html,
    text: email.rendered.text,
    attachments: [{ filename: "tijorat.png", content: LOGO_PNG_BASE64, content_id: LOGO_CID }],
    tags,
  };
}

export async function sendViaResend(to: string, email: OutgoingEmail, fetchImpl: typeof fetch = fetch): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.TIJORAT_EMAIL_FROM || process.env.TIJORAT_SMTP_FROM;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY and TIJORAT_EMAIL_FROM must be set to send email through Resend");
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
