import { describe, expect, it } from "vitest";
import { EmailKind, emailKindFor } from "./kinds";
import en from "./locales/en.json";
import ru from "./locales/ru.json";
import tg from "./locales/tg.json";
import uz from "./locales/uz.json";
import { emailLocale, renderEmail, safeUrl } from "./render";

const KINDS: EmailKind[] = [
  "verifyEmail",
  "passwordReset",
  "initCode",
  "invite",
  "otp",
  "passkeyLink",
  "passwordChanged",
  "domainClaimed",
];
const LOCALES = { en, ru, tg, uz };
const URL_ = "https://id.tijorat.plus/ui/v2/login/verify?userId=1&code=AB12CD";

function keys(value: unknown, prefix = ""): string[] {
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("email locales", () => {
  it("have the same keys in every language", () => {
    for (const messages of Object.values(LOCALES)) {
      expect(keys(messages).sort()).toEqual(keys(en).sort());
    }
  });

  it("cover every kind", () => {
    for (const kind of KINDS) {
      expect(en[kind]).toBeDefined();
    }
  });
});

describe("emailKindFor", () => {
  it("maps ZITADEL's triggering events", () => {
    expect(emailKindFor("user.human.email.code.added")).toBe("verifyEmail");
    expect(emailKindFor("user.human.password.code.added")).toBe("passwordReset");
    expect(emailKindFor("session.otp.email.challenged")).toBe("otp");
    expect(emailKindFor("user.human.passwordless.initialization.code.requested")).toBe("passkeyLink");
    expect(emailKindFor("user.something.new")).toBeUndefined();
    expect(emailKindFor(42)).toBeUndefined();
  });
});

describe("emailLocale", () => {
  it("takes the base language of a supported tag and falls back to ru", () => {
    expect(emailLocale("tg")).toBe("tg");
    expect(emailLocale("uz-Latn-UZ")).toBe("uz");
    expect(emailLocale("en_US")).toBe("en");
    expect(emailLocale("de")).toBe("ru");
    expect(emailLocale(undefined)).toBe("ru");
  });
});

describe("safeUrl", () => {
  it("keeps web links only", () => {
    expect(safeUrl(URL_)).toBe(URL_);
    expect(safeUrl("http://localhost:3000/x")).toBe("http://localhost:3000/x");
    expect(safeUrl("http://evil.example/x")).toBeUndefined();
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeUrl("not a url")).toBeUndefined();
  });
});

describe("renderEmail", () => {
  const payload = {
    templateData: { url: URL_ },
    args: { firstName: "Алишер", code: "AB12CD", userID: "1" },
  };

  it.each(KINDS.flatMap((kind) => Object.keys(LOCALES).map((locale) => [kind, locale] as const)))(
    "%s in %s has no placeholder left",
    (kind, locale) => {
      const email = renderEmail(kind, locale, {
        ...payload,
        args: { ...payload.args, domain: "shop.tj", tempUsername: "u1" },
      });
      for (const part of [email.subject, email.html, email.text]) {
        expect(part).not.toMatch(/\{(name|app|domain|username)\}/);
      }
      expect(email.html).toContain(`lang="${locale}"`);
      expect(email.html).toContain("cid:tijorat-logo");
    },
  );

  it("shows the code, the button and the greeting", () => {
    const email = renderEmail("verifyEmail", "ru", payload);
    expect(email.subject).toBe("Подтвердите email — Tijorat+");
    expect(email.html).toContain("Здравствуйте, Алишер!");
    expect(email.html).toContain(">AB12CD<");
    expect(email.html).toContain('href="https://id.tijorat.plus/ui/v2/login/verify?userId=1&amp;code=AB12CD"');
    expect(email.text).toContain("Ваш код: AB12CD");
    expect(email.text).toContain(URL_);
  });

  it("escapes user data once, after undoing ZITADEL's escaping", () => {
    const email = renderEmail("verifyEmail", "en", {
      args: { firstName: "&lt;script&gt;x&lt;/script&gt; &amp; Co", code: "1" },
    });
    expect(email.html).toContain("Hello &lt;script&gt;x&lt;/script&gt; &amp; Co,");
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("&amp;lt;");
    expect(email.text).toContain("Hello <script>x</script> & Co,");
  });

  it("drops a button whose link is not a web URL", () => {
    const email = renderEmail("passwordReset", "en", { templateData: { url: "javascript:alert(1)" }, args: {} });
    expect(email.html).not.toContain("javascript:");
    expect(email.html).not.toContain("Set a new password</a>");
  });

  it("names the inviting app, but not ZITADEL", () => {
    expect(renderEmail("invite", "en", { args: { applicationName: "Tijorat Kassa" } }).subject).toBe(
      "You are invited to Tijorat Kassa",
    );
    expect(renderEmail("invite", "en", { args: { applicationName: "ZITADEL" } }).subject).toBe(
      "You are invited to Tijorat+",
    );
  });

  it("puts ZITADEL's own texts into the layout for an unknown event", () => {
    const email = renderEmail(undefined, "en", {
      templateData: {
        subject: "Something new",
        title: "New thing",
        text: "Line one<br>Line <b>two</b>",
        buttonText: "Open",
        url: URL_,
      },
      args: {},
    });
    expect(email.subject).toBe("Something new");
    expect(email.html).toContain(">New thing</h1>");
    expect(email.html).toContain("Line two");
    expect(email.html).not.toContain("<b>");
    expect(email.html).toContain("Open</a>");
  });

  it("uses the default language for an unknown locale", () => {
    expect(renderEmail("otp", "de", { args: { oTP: "123456" } }).subject).toBe("Код для входа — Tijorat+");
  });
});
