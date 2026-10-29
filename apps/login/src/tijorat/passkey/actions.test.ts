import { beforeEach, describe, expect, test, vi } from "vitest";
import { continueAfterPasskeyOffer } from "./actions";
import { PASSKEY_OFFER_SNOOZE_COOKIE } from "./offer";

const setCookie = vi.fn();
const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: (name: string) => (cookieStore.has(name) ? { name, value: cookieStore.get(name) } : undefined),
    set: setCookie,
  })),
}));

vi.mock("@/lib/service-url", () => ({
  getServiceConfig: vi.fn(() => ({ serviceConfig: { baseUrl: "https://id.tijorat.plus" } })),
}));

const getSessionCookieById = vi.fn();
vi.mock("@/lib/cookies", () => ({
  getSessionCookieById: (...args: unknown[]) => getSessionCookieById(...args),
}));

const getSession = vi.fn();
const getLoginSettings = vi.fn();
vi.mock("@/lib/zitadel", () => ({
  getSession: (...args: unknown[]) => getSession(...args),
  getLoginSettings: (...args: unknown[]) => getLoginSettings(...args),
}));

const completeFlowOrGetUrl = vi.fn();
vi.mock("@/lib/client", () => ({
  completeFlowOrGetUrl: (...args: unknown[]) => completeFlowOrGetUrl(...args),
}));

describe("continueAfterPasskeyOffer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieStore.clear();
    getSessionCookieById.mockResolvedValue({ id: "session-1", token: "token" });
    getSession.mockResolvedValue({
      session: {
        id: "session-1",
        factors: { user: { id: "user-1", loginName: "aziz@tijorat.plus", organizationId: "org-1" } },
      },
    });
    getLoginSettings.mockResolvedValue({ defaultRedirectUri: "https://app.tijorat.plus" });
    completeFlowOrGetUrl.mockResolvedValue({ redirect: "https://app.tijorat.plus/callback" });
  });

  test("completes the OIDC request with the existing session", async () => {
    const result = await continueAfterPasskeyOffer({ sessionId: "session-1", requestId: "oidc_1", snooze: false });

    expect(result).toEqual({ redirect: "https://app.tijorat.plus/callback" });
    expect(completeFlowOrGetUrl).toHaveBeenCalledWith(
      { sessionId: "session-1", requestId: "oidc_1", organization: "org-1" },
      "https://app.tijorat.plus",
    );
    expect(setCookie).not.toHaveBeenCalled();
  });

  test("continues by login name without an auth request", async () => {
    await continueAfterPasskeyOffer({ sessionId: "session-1", organization: "org-2", snooze: false });

    expect(completeFlowOrGetUrl).toHaveBeenCalledWith(
      { loginName: "aziz@tijorat.plus", organization: "org-2" },
      "https://app.tijorat.plus",
    );
  });

  test("remembers the decline for this user", async () => {
    cookieStore.set(PASSKEY_OFFER_SNOOZE_COOKIE, "user-0");

    await continueAfterPasskeyOffer({ sessionId: "session-1", snooze: true });

    expect(setCookie).toHaveBeenCalledWith(
      expect.objectContaining({ name: PASSKEY_OFFER_SNOOZE_COOKIE, value: "user-1,user-0", httpOnly: true }),
    );
  });

  test("refuses a session that is not in this browser's cookie", async () => {
    getSessionCookieById.mockResolvedValue(undefined);

    const result = await continueAfterPasskeyOffer({ sessionId: "foreign", requestId: "oidc_1", snooze: true });

    expect(result).toEqual({ error: "Could not find session" });
    expect(getSession).not.toHaveBeenCalled();
    expect(completeFlowOrGetUrl).not.toHaveBeenCalled();
  });
});
