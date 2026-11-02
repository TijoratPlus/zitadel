import nodemailer, { Transporter } from "nodemailer";
import "server-only";
import { LOGO_CID, LOGO_PNG_BASE64 } from "./logo";
import { RenderedEmail } from "./render";

let transporter: Transporter | undefined;

// SMTP settings live on the login container (TIJORAT_SMTP_*); with the HTTP email provider active,
// ZITADEL core no longer talks to the mail server itself.
function smtp(): Transporter {
  if (!transporter) {
    const host = process.env.TIJORAT_SMTP_HOST;
    if (!host || !process.env.TIJORAT_SMTP_FROM) {
      throw new Error("TIJORAT_SMTP_HOST and TIJORAT_SMTP_FROM must be set to send email");
    }
    const secure = process.env.TIJORAT_SMTP_SECURE === "true";
    const user = process.env.TIJORAT_SMTP_USER;
    transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.TIJORAT_SMTP_PORT) || (secure ? 465 : 587),
      secure,
      requireTLS: !secure,
      auth: user ? { user, pass: process.env.TIJORAT_SMTP_PASSWORD ?? "" } : undefined,
    });
  }
  return transporter;
}

export async function sendEmail(to: string, email: RenderedEmail): Promise<void> {
  await smtp().sendMail({
    from: process.env.TIJORAT_SMTP_FROM,
    to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    attachments: [{ filename: "tijorat.png", content: LOGO_PNG_BASE64, encoding: "base64", cid: LOGO_CID }],
  });
}
