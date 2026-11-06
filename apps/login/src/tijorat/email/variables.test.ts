import { describe, expect, it } from "vitest";
import { emailKindFor } from "./kinds";
import { emailLocale, genericEmail, safeUrl, templateVariables } from "./variables";

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
    expect(safeUrl("https://id.tijorat.plus/x")).toBe("https://id.tijorat.plus/x");
    expect(safeUrl("http://localhost:3000/x")).toBe("http://localhost:3000/x");
    expect(safeUrl("http://evil.example/x")).toBeUndefined();
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeUrl("not a url")).toBeUndefined();
  });
});

describe("templateVariables", () => {
  it("escapes values once, drops empty ones and hides ZITADEL as app name", () => {
    expect(
      templateVariables("invite", {
        templateData: { url: "https://id.tijorat.plus/x?a=1&b=2" },
        args: { firstName: "&lt;b&gt;Ali&lt;/b&gt;", applicationName: "ZITADEL", code: "" },
      }),
    ).toEqual({ USER_NAME: "&lt;b&gt;Ali&lt;/b&gt;", ACTION_URL: "https://id.tijorat.plus/x?a=1&amp;b=2" });
  });

  it("drops a link that is not a web URL", () => {
    expect(templateVariables("passwordReset", { templateData: { url: "javascript:alert(1)" }, args: {} })).toEqual({});
  });

  it("passes the OTP as CODE and the claimed domain only for that kind", () => {
    expect(templateVariables("otp", { args: { oTP: "123456", domain: "shop.tj" } })).toEqual({ CODE: "123456" });
    expect(templateVariables("domainClaimed", { args: { domain: "shop.tj", tempUsername: "u1" } })).toEqual({
      CLAIMED_DOMAIN: "shop.tj",
      NEW_USERNAME: "u1",
    });
  });
});

describe("genericEmail", () => {
  it("keeps ZITADEL's texts as escaped plain text, never as markup", () => {
    const { subject, variables } = genericEmail({
      templateData: { subject: "Hi", title: "<script>x</script>", text: "<<b>b>one</b><br>&lt;img src=x&gt;" },
    });
    expect(subject).toBe("Hi");
    expect(variables.HEADING).toBe("x");
    expect(variables.TEXT).not.toMatch(/<script|<img|<b>/i);
    expect(variables.TEXT).toContain("&lt;img src=x&gt;");
    expect(variables.TEXT).toContain("<br>");
  });

  it("falls back to the subject, then to the brand, for the heading", () => {
    expect(genericEmail({ templateData: { subject: "Subject" } }).variables.HEADING).toBe("Subject");
    expect(genericEmail({}).variables.HEADING).toBe("Tijorat+");
  });
});
