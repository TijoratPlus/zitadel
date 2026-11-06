import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailKind } from "./kinds";
import { renderEmail, templateVariables } from "./render";
import { OutgoingEmail, resendRequestBody, resendTemplateAlias, sendViaResend } from "./resend";

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

function email(kind: EmailKind | undefined): OutgoingEmail {
  return {
    kind,
    locale: "ru",
    rendered: renderEmail(kind, "ru", { args: { code: "A1" } }),
    variables: { CODE: "A1" },
    idempotencyKey: "k1",
  };
}

describe("resendTemplateAlias", () => {
  it("names one template per kind and language", () => {
    expect(resendTemplateAlias("verifyEmail", "ru")).toBe("tj-verify-email-ru");
    expect(resendTemplateAlias("domainClaimed", "uz")).toBe("tj-domain-claimed-uz");
    expect(new Set(KINDS.map((kind) => resendTemplateAlias(kind, "en"))).size).toBe(KINDS.length);
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

  it("passes the claimed domain and new username only for that kind", () => {
    const payload = { args: { domain: "shop.tj", tempUsername: "u1" } };
    expect(templateVariables("domainClaimed", payload)).toEqual({ CLAIMED_DOMAIN: "shop.tj", NEW_USERNAME: "u1" });
    expect(templateVariables("otp", payload)).toEqual({});
  });
});

describe("resendRequestBody", () => {
  it("sends a known kind as a template by alias", () => {
    expect(resendRequestBody("a@b.tj", "Tijorat+ <no-reply@tijorat.plus>", email("verifyEmail"))).toEqual({
      from: "Tijorat+ <no-reply@tijorat.plus>",
      to: ["a@b.tj"],
      template: { id: "tj-verify-email-ru", variables: { CODE: "A1" } },
      tags: [{ name: "kind", value: "verifyEmail" }],
    });
  });

  it("sends an unknown event as the fork's own HTML with the inline logo", () => {
    const body = resendRequestBody("a@b.tj", "x@tijorat.plus", email(undefined));
    expect(body.template).toBeUndefined();
    expect(body.html).toContain("cid:tijorat-logo");
    expect(body.attachments).toEqual([expect.objectContaining({ content_id: "tijorat-logo" })]);
  });
});

describe("sendViaResend", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("posts with the API key and the idempotency key", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("TIJORAT_EMAIL_FROM", "Tijorat+ <no-reply@tijorat.plus>");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await sendViaResend("a@b.tj", email("otp"), fetchMock);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_test", "Idempotency-Key": "k1" });
    expect(JSON.parse(init.body).template.id).toBe("tj-otp-ru");
  });

  it("fails with Resend's message so the handler answers 502 and ZITADEL retries", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("TIJORAT_EMAIL_FROM", "x@tijorat.plus");
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"message":"template not published"}', { status: 422 }));
    await expect(sendViaResend("a@b.tj", email("otp"), fetchMock)).rejects.toThrow("Resend answered 422");
  });

  it("refuses to send without a key", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(sendViaResend("a@b.tj", email("otp"), vi.fn())).rejects.toThrow("RESEND_API_KEY");
  });
});
