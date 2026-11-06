import { createHash } from "node:crypto";
import { emailKindFor } from "./kinds";
import { emailLocale, EmailPayload, renderEmail, templateVariables } from "./render";
import { OutgoingEmail } from "./resend";
import { SIGNATURE_HEADER, verifyZitadelSignature } from "./signature";

const MAX_BODY_BYTES = 64 * 1024;

type Payload = EmailPayload & { contextInfo?: { recipientEmailAddress?: unknown; eventType?: unknown } };

export type EmailWebhookDeps = {
  send: (to: string, email: OutgoingEmail) => Promise<void>;
  preferredLanguage: (userId: string, url: string | undefined) => Promise<string | undefined>;
  log: (level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) => void;
};

function status(code: number): Response {
  return new Response(null, { status: code });
}

/**
 * Receives ZITADEL's HTTP email provider call and sends the Tijorat+ email, over SMTP or through
 * Resend templates (send.ts).
 * Off (404) unless TIJORAT_EMAIL_SIGNING_KEY holds the provider's signing key. A non-2xx answer
 * makes ZITADEL retry the notification, so only a failed send returns 502.
 * Logs never carry the address or the code.
 */
export async function handleEmailWebhook(request: Request, deps: EmailWebhookDeps): Promise<Response> {
  const key = process.env.TIJORAT_EMAIL_SIGNING_KEY;
  if (!key) {
    return status(404);
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return status(413);
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
    return status(413);
  }
  if (!verifyZitadelSignature(raw, request.headers.get(SIGNATURE_HEADER), key)) {
    deps.log("warn", "rejected email webhook with an invalid signature");
    return status(401);
  }

  let payload: Payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return status(400);
  }
  const recipient = payload.contextInfo?.recipientEmailAddress;
  if (typeof recipient !== "string" || !recipient.includes("@")) {
    return status(400);
  }

  const eventType = payload.contextInfo?.eventType;
  const kind = emailKindFor(eventType);
  const userId = typeof payload.args?.userID === "string" ? payload.args.userID : "";
  let language: string | undefined;
  try {
    language = await deps.preferredLanguage(userId, payload.templateData?.url);
  } catch (error) {
    deps.log("warn", "could not read the recipient's language, using the default", { userId, error: String(error) });
  }
  const locale = emailLocale(language);

  try {
    await deps.send(recipient, {
      kind,
      locale,
      rendered: renderEmail(kind, locale, payload),
      variables: kind ? templateVariables(kind, payload) : {},
      // ZITADEL re-signs a retry but sends the same body, so the body identifies the notification.
      idempotencyKey: createHash("sha256").update(raw).digest("hex"),
    });
  } catch (error) {
    deps.log("error", "sending email failed", { kind: kind ?? eventType, userId, error: String(error) });
    return status(502);
  }
  deps.log("info", "email sent", { kind: kind ?? eventType, locale, userId });
  return status(200);
}
