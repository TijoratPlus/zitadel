import { TIJORAT_LANGS } from "../i18n";
import { EmailKind } from "./kinds";
import en from "./locales/en.json";
import ru from "./locales/ru.json";
import tg from "./locales/tg.json";
import uz from "./locales/uz.json";
import { LOGO_CID, LOGO_HEIGHT, LOGO_WIDTH } from "./logo";

type Texts = typeof en;
const TEXTS: Record<string, Texts> = { en, ru, tg, uz };
export const DEFAULT_EMAIL_LOCALE = "ru";

// tajerp_ui tokens (brand/tijorat.scss), light theme only: mail clients pick their own dark mode.
const C = {
  bg: "#f7f9f8",
  surface: "#ffffff",
  hairline: "#dde8e3",
  ink1: "#0c1e16",
  ink2: "#2d4438",
  ink3: "#557264",
  primary: "#167d55",
  mist: "#e6f5ef",
  deep: "#0d4430",
};
const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** The part of ZITADEL's HTTP email payload the renderer reads (see internal/notification/types). */
export type EmailPayload = {
  templateData?: { subject?: string; title?: string; greeting?: string; text?: string; url?: string; buttonText?: string };
  args?: Record<string, unknown>;
};

export type RenderedEmail = { subject: string; html: string; text: string };

/** Picks the email language from a BCP 47 tag ("ru", "tg-TJ", "uz-Latn"), else the default. */
export function emailLocale(tag: string | undefined): string {
  const base = tag?.toLowerCase().split(/[-_]/)[0];
  return base && TIJORAT_LANGS.some((lang) => lang.code === base) && TEXTS[base] ? base : DEFAULT_EMAIL_LOCALE;
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
 * ZITADEL's own copy (generic fallback) may carry markup; keep its text only. The result is plain
 * text, never HTML: html() escapes it like every other value. Tags are dropped in one pass over
 * the characters, with <br> kept as a line break.
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

/** Only web links become buttons: a javascript: or data: URL from a tampered template is dropped. */
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

function format(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

type Content = {
  subject: string;
  heading: string;
  greeting: string;
  paragraphs: string[];
  code?: string;
  url?: string;
  button?: string;
  showIgnore: boolean;
};

function content(kind: EmailKind | undefined, locale: string, payload: EmailPayload): Content {
  const t = TEXTS[locale] ?? TEXTS[DEFAULT_EMAIL_LOCALE];
  const { args, templateData } = payload;
  const name = arg(args, "firstName") || arg(args, "displayName");
  const greeting = name ? format(t.greeting, { name }) : t.greetingNoName;
  const code = arg(args, "code") || arg(args, "oTP") || undefined;
  const url = safeUrl(templateData?.url);

  if (!kind) {
    const text = plain(templateData?.text);
    return {
      subject: plain(templateData?.subject) || "Tijorat+",
      heading: plain(templateData?.title) || plain(templateData?.subject) || "Tijorat+",
      greeting,
      paragraphs: text ? text.split(/\n+/) : [],
      url,
      button: plain(templateData?.buttonText) || undefined,
      showIgnore: false,
    };
  }

  const appName = arg(args, "applicationName");
  const values = {
    app: appName && appName !== "ZITADEL" ? appName : "Tijorat+",
    domain: arg(args, "domain"),
    username: arg(args, "tempUsername"),
  };
  const copy = t[kind];
  return {
    subject: format(copy.subject, values),
    heading: format(copy.heading, values),
    greeting,
    paragraphs: [format(copy.body, values)],
    code: kind === "passwordChanged" ? undefined : code,
    url,
    button: copy.button,
    showIgnore: kind !== "passwordChanged" && kind !== "domainClaimed",
  };
}

function html(c: Content, locale: string, t: Texts): string {
  const e = escapeHtml;
  const p = (text: string, size = 15, color = C.ink2) =>
    `<p style="margin:0 0 16px;font-size:${size}px;line-height:1.6;color:${color};">${e(text)}</p>`;
  const codeBlock = c.code
    ? `<p style="margin:8px 0 6px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:${C.ink3};">${e(t.codeLabel)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr><td style="background:${C.mist};border-radius:12px;padding:14px 22px;font-family:'SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace;font-size:28px;font-weight:700;letter-spacing:6px;color:${C.deep};">${e(c.code)}</td></tr></table>`
    : "";
  const buttonBlock =
    c.url && c.button
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;"><tr><td style="border-radius:10px;background:${C.primary};">
<a href="${e(c.url)}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px;">${e(c.button)}</a>
</td></tr></table>
${p(t.linkFallback, 13, C.ink3)}<p style="margin:-10px 0 16px;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${e(c.url)}" target="_blank" style="color:${C.primary};">${e(c.url)}</a></p>`
      : "";

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${e(c.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${e(c.heading)}${c.code ? ` · ${e(c.code)}` : ""}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;font-family:${FONT};">
<tr><td style="padding:0 4px 20px;"><img src="cid:${LOGO_CID}" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" alt="Tijorat+" style="display:block;border:0;outline:none;"></td></tr>
<tr><td style="background:${C.surface};border:1px solid ${C.hairline};border-radius:16px;padding:32px 28px;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-.01em;color:${C.ink1};">${e(c.heading)}</h1>
${p(c.greeting)}${c.paragraphs.map((text) => p(text)).join("")}${codeBlock}${buttonBlock}${c.showIgnore ? p(t.ignore, 13, C.ink3) : ""}
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:12px;line-height:1.6;color:${C.ink3};">${e(t.automated)}<br>© ${new Date().getFullYear()} Tijorat+</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function text(c: Content, t: Texts): string {
  return [
    c.heading,
    "",
    c.greeting,
    "",
    ...c.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...(c.code ? [`${t.codeLabel}: ${c.code}`, ""] : []),
    ...(c.url ? [`${c.button ?? ""}: ${c.url}`.replace(/^: /, ""), ""] : []),
    ...(c.showIgnore ? [t.ignore, ""] : []),
    "—",
    t.automated,
    "Tijorat+",
  ].join("\n");
}

/** A Tijorat+ email for `kind`, or for an unknown event, ZITADEL's own texts in the same layout. */
export function renderEmail(kind: EmailKind | undefined, locale: string, payload: EmailPayload): RenderedEmail {
  const lang = TEXTS[locale] ? locale : DEFAULT_EMAIL_LOCALE;
  const t = TEXTS[lang];
  const c = content(kind, lang, payload);
  return { subject: c.subject, html: html(c, lang, t), text: text(c, t) };
}
