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
    expect(email.subject).toBe("Email-ро тасдиқ кунед — Tijorat+");
    expect(email.html).toContain("Салом, Zarina!");
  });

  it("falls back to the default language when the lookup fails", async () => {
    const d = deps({ preferredLanguage: vi.fn().mockRejectedValue(new Error("unavailable")) });
    expect((await handleEmailWebhook(signedRequest(PAYLOAD), d)).status).toBe(200);
    expect(vi.mocked(d.send).mock.calls[0][1].subject).toBe("Подтвердите email — Tijorat+");
  });

  it("answers 502 when SMTP fails, so ZITADEL retries, and logs neither address nor code", async () => {
    const d = deps({ send: vi.fn().mockRejectedValue(new Error("smtp down")) });
    expect((await handleEmailWebhook(signedRequest(PAYLOAD), d)).status).toBe(502);
    const logged = JSON.stringify(vi.mocked(d.log).mock.calls);
    expect(logged).not.toContain("user@shop.tj");
    expect(logged).not.toContain("X1");
  });
});
