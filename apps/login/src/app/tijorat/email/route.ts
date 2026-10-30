// Tijorat+ fork: branded emails from ZITADEL's HTTP email provider (src/tijorat/email, TIJORAT_FORK.md).
import { createLogger } from "@/lib/logger";
import { handleEmailWebhook } from "@/tijorat/email/handler";
import { preferredLanguage } from "@/tijorat/email/language";
import { sendEmail } from "@/tijorat/email/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const logger = createLogger("tijorat-email");

export async function POST(request: Request) {
  return handleEmailWebhook(request, {
    send: sendEmail,
    preferredLanguage,
    log: (level, message, meta) => logger[level](message, meta),
  });
}
