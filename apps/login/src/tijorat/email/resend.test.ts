import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailKind } from "./kinds";
import { OutgoingEmail, resendRequestBody, resendTemplateAlias, sendEmail } from "./resend";

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

const OTP: OutgoingEmail = { kind: "otp", locale: "ru", variables: { CODE: "A1" }, idempotencyKey: "k1" };

describe("resendTemplateAlias", () => {
  it("names one template per kind and language, and one generic template", () => {
    expect(resendTemplateAlias("verifyEmail", "ru")).toBe("tj-verify-email-ru");
    expect(resendTemplateAlias("domainClaimed", "uz")).toBe("tj-domain-claimed-uz");
    expect(resendTemplateAlias(undefined, "tg")).toBe("tj-generic");
    expect(new Set(KINDS.map((kind) => resendTemplateAlias(kind, "en"))).size).toBe(KINDS.length);
  });
});

describe("resendRequestBody", () => {
  it("sends a known kind by template alias without overriding its subject", () => {
    expect(resendRequestBody("a@b.tj", "Tijorat+ <no-reply@tijorat.plus>", OTP)).toEqual({
      from: "Tijorat+ <no-reply@tijorat.plus>",
      to: ["a@b.tj"],
      template: { id: "tj-otp-ru", variables: { CODE: "A1" } },
      tags: [{ name: "kind", value: "otp" }],
    });
  });

  it("passes ZITADEL's subject for the generic template", () => {
    const body = resendRequestBody("a@b.tj", "x@tijorat.plus", {
      locale: "ru",
      subject: "New thing",
      variables: { HEADING: "New thing" },
      idempotencyKey: "k2",
    });
    expect(body).toMatchObject({ subject: "New thing", template: { id: "tj-generic" }, tags: [{ value: "generic" }] });
  });
});

describe("sendEmail", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("posts with the API key and the idempotency key", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("TIJORAT_EMAIL_FROM", "Tijorat+ <no-reply@tijorat.plus>");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await sendEmail("a@b.tj", OTP, fetchMock);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_test", "Idempotency-Key": "k1" });
    expect(JSON.parse(init.body).template.id).toBe("tj-otp-ru");
  });

  it("fails with Resend's message so the handler answers 502 and ZITADEL retries", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("TIJORAT_EMAIL_FROM", "x@tijorat.plus");
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"message":"template not published"}', { status: 422 }));
    await expect(sendEmail("a@b.tj", OTP, fetchMock)).rejects.toThrow("Resend answered 422");
  });

  it("refuses to send without a key or a sender", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("TIJORAT_EMAIL_FROM", "x@tijorat.plus");
    await expect(sendEmail("a@b.tj", OTP, vi.fn())).rejects.toThrow("RESEND_API_KEY");
  });
});
