import { TIJORAT_LANGS } from "../i18n";
import { EmailKind } from "./kinds";

export const DEFAULT_EMAIL_LOCALE = "ru";

/** The part of ZITADEL's HTTP email payload the login reads (see internal/notification/types). */
export type EmailPayload = {
  templateData?: { subject?: string; title?: string; text?: string; url?: string; buttonText?: string };
  args?: Record<string, unknown>;
};

/** Picks the email language from a BCP 47 tag ("ru", "tg-TJ", "uz-Latn"), else the default. */
export function emailLocale(tag: string | undefined): string {
  const base = tag?.toLowerCase().split(/[-_]/)[0];
  return base && TIJORAT_LANGS.some((lang) => lang.code === base) ? base : DEFAULT_EMAIL_LOCALE;
}

// ZITADEL HTML-escapes string args before sending them (sanitizeArgsForHTML); undo that so every
// value is escaped exactly once, here.
function unescapeHtml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#3[49];/g, (m) => (m === "&#34;" ? '"' : "'"))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function arg(args: Record<string, unknown> | undefined, key: string): string {
  const value = args?.[key];
  return typeof value === "string" ? unescapeHtml(value).trim() : "";
}

/**
 * ZITADEL's own copy may carry markup; keep its text only. Tags are dropped in one pass over the
 * characters, with <br> kept as a line break. The result is plain text and is escaped before use.
 */
function plain(value: string | undefined): string {
  let text = "";
  let tag: string | undefined;
  for (const char of value ?? "") {
    if (tag !== undefined) {
      if (char === ">") {
        if (/^br\b/i.test(tag.trim())) {
          text += "\n";
        }
        tag = undefined;
      } else {
        tag += char;
      }
    } else if (char === "<") {
      tag = "";
    } else {
      text += char;
    }
  }
  return unescapeHtml(text.trim());
}

/** Only web links reach a button: a javascript: or data: URL from a tampered template is dropped. */
export function safeUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
      return url.toString();
    }
  } catch {
    // not a URL
  }
  return undefined;
}

// Resend inserts values unescaped ({{{…}}}), so each one is HTML-escaped here, once. Empty values
// are left out, so the template's fallback applies.
function escaped(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value)
      .map(([key, value]) => [key, escapeHtml(value)]),
  );
}

/** Variables of the Resend template for `kind` (tj-<kind>-<locale>, see resend.ts). */
export function templateVariables(kind: EmailKind, payload: EmailPayload): Record<string, string> {
  const { args, templateData } = payload;
  const appName = arg(args, "applicationName");
  return escaped({
    USER_NAME: arg(args, "firstName") || arg(args, "displayName"),
    CODE: arg(args, "code") || arg(args, "oTP"),
    ACTION_URL: safeUrl(templateData?.url) ?? "",
    APP_NAME: appName && appName !== "ZITADEL" ? appName : "",
    CLAIMED_DOMAIN: kind === "domainClaimed" ? arg(args, "domain") : "",
    NEW_USERNAME: kind === "domainClaimed" ? arg(args, "tempUsername") : "",
  });
}

/**
 * Variables of the generic template (tj-generic) for an event the fork has no template for, so an
 * upstream update never drops an email. The texts are ZITADEL's own, already translated by it.
 */
export function genericEmail(payload: EmailPayload): { subject: string; variables: Record<string, string> } {
  const { templateData } = payload;
  const heading = plain(templateData?.title) || plain(templateData?.subject) || "Tijorat+";
  const variables = escaped({
    HEADING: heading,
    TEXT: plain(templateData?.text),
    ACTION_URL: safeUrl(templateData?.url) ?? "",
  });
  if (variables.TEXT) {
    variables.TEXT = variables.TEXT.replace(/\n+/g, "<br>");
  }
  return { subject: plain(templateData?.subject) || heading, variables };
}
