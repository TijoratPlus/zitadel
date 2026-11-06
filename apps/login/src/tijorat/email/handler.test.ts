import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailWebhookDeps, handleEmailWebhook } from "./handler";

const KEY = "signing-key";

function signedRequest(body: unknown, key = KEY, extraHeaders: Record<string, string> = {}): Request {
  const raw = JSON.stringify(body);
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", key).update(`${t}.${raw}`).digest("hex");
  return new Request("http://login/ui/v2/login/tijorat/email", {
    method: "POST",
    body: raw,
    headers: { "content-type": "application/json", "ZITADEL-Signature": `t=${t},v1=${v1}`, ...extraHeaders },
  });
}

const PAYLOAD = {
  contextInfo: { recipientEmailAddress: "user@shop.tj", eventType: "user.human.email.code.added" },
  templateData: { url: "https://id.tijorat.plus/ui/v2/login/verify?code=X1" },
  args: { userID: "42", firstName: "Zarina", code: "X1" },
};

function deps(overrides: Partial<EmailWebhookDeps> = {}): EmailWebhookDeps {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    preferredLanguage: vi.fn().mockResolvedValue("tg"),
    log: vi.fn(),
    ...overrides,
  };
}

describe("handleEmailWebhook", () => {
  beforeEach(() => vi.stubEnv("TIJORAT_EMAIL_SIGNING_KEY", KEY));
  afterEach(() => vi.unstubAllEnvs());

  it("is off without a signing key", async () => {
    vi.stubEnv("TIJORAT_EMAIL_SIGNING_KEY", "");
    const d = deps();
    expect((await handleEmailWebhook(signedRequest(PAYLOAD), d)).status).toBe(404);
    expect(d.send).not.toHaveBeenCalled();
  });

  it("rejects a request signed with another key", async () => {
    const d = deps();
    expect((await handleEmailWebhook(signedRequest(PAYLOAD, "other"), d)).status).toBe(401);
    expect(d.send).not.toHaveBeenCalled();
  });

  it("rejects an oversized body before reading the signature", async () => {
    const d = deps();
    const response = await handleEmailWebhook(signedRequest(PAYLOAD, KEY, { "content-length": String(65 * 1024) }), d);
    expect(response.status).toBe(413);
  });

  it("rejects a payload without a recipient", async () => {
    const d = deps();
    const response = await handleEmailWebhook(signedRequest({ ...PAYLOAD, contextInfo: { eventType: "x" } }), d);
    expect(response.status).toBe(400);
  });

  it("sends the branded email in the user's language", async () => {
    const d = deps();
    expect((await handleEmailWebhook(signedRequest(PAYLOAD), d)).status).toBe(200);
    expect(d.preferredLanguage).toHaveBeenCalledWith("42", PAYLOAD.templateData.url);
    const [to, email] = vi.mocked(d.send).mock.calls[0];
    expect(to).toBe("user@shop.tj");
    expect(email.kind).toBe("verifyEmail");
    expect(email.locale).toBe("tg");
  });

  it("hands over the kind, template variables and a key that is stable across retries", async () => {
    const d = deps();
    await handleEmailWebhook(signedRequest(PAYLOAD), d);
    await handleEmailWebhook(signedRequest(PAYLOAD), d);
    const [first, second] = vi.mocked(d.send).mock.calls.map((call) => call[1]);
    expect(first.kind).toBe("verifyEmail");
    expect(first.locale).toBe("tg");
    expect(first.variables).toEqual({ USER_NAME: "Zarina", CODE: "X1", ACTION_URL: PAYLOAD.templateData.url });
    expect(first.idempotencyKey).toMatch(/^[0-9a-f]{64}$/);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
  });

  it("sends an event without its own template through the generic one with ZITADEL's texts", async () => {
    const d = deps();
    const payload = {
      ...PAYLOAD,
      contextInfo: { ...PAYLOAD.contextInfo, eventType: "user.something.new" },
      templateData: {
        subject: "New thing",
        title: "New thing",
        text: "Line one<br>Line two",
        url: "https://id.tijorat.plus/x",
      },
    };
    expect((await handleEmailWebhook(signedRequest(payload), d)).status).toBe(200);
    const email = vi.mocked(d.send).mock.calls[0][1];
    expect(email.kind).toBeUndefined();
    expect(email.subject).toBe("New thing");
    expect(email.variables).toMatchObject({ HEADING: "New thing", TEXT: "Line one<br>Line two" });
  });

  it("falls back to the default language when the lookup fails", async () => {
    const d = deps({ preferredLanguage: vi.fn().mockRejectedValue(new Error("unavailable")) });
    expect((await handleEmailWebhook(signedRequest(PAYLOAD), d)).status).toBe(200);
    expect(vi.mocked(d.send).mock.calls[0][1].locale).toBe("ru");
  });

  it("answers 502 when SMTP fails, so ZITADEL retries, and logs neither address nor code", async () => {
    const d = deps({ send: vi.fn().mockRejectedValue(new Error("smtp down")) });
    expect((await handleEmailWebhook(signedRequest(PAYLOAD), d)).status).toBe(502);
    const logged = JSON.stringify(vi.mocked(d.log).mock.calls);
    expect(logged).not.toContain("user@shop.tj");
    expect(logged).not.toContain("X1");
  });
});
