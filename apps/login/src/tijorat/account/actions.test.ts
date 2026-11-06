import { timestampFromMs } from "@zitadel/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const users = {
  updateHumanUser: vi.fn().mockResolvedValue({}),
  setEmail: vi.fn().mockResolvedValue({}),
  verifyEmail: vi.fn().mockResolvedValue({}),
  setPassword: vi.fn().mockResolvedValue({}),
  removePasskey: vi.fn().mockResolvedValue({}),
  removeTOTP: vi.fn().mockResolvedValue({}),
  removePhone: vi.fn().mockResolvedValue({}),
};
const sessions = {
  listSessions: vi.fn().mockResolvedValue({ sessions: [{ id: "current" }, { id: "other-1" }, { id: "other-2" }] }),
  deleteSession: vi.fn().mockResolvedValue({}),
};
const loadAccountContext = vi.fn();

vi.mock("./session", () => ({
  loadAccountContext: () => loadAccountContext(),
  selfServices: () => ({ users, sessions }),
}));
const getAllSessionCookieIds = vi.fn();
vi.mock("@/lib/cookies", () => ({
  setLanguageCookie: vi.fn(),
  getAllSessionCookieIds: () => getAllSessionCookieIds(),
}));
const clearSession = vi.fn().mockResolvedValue(undefined);
const updateOrCreateSession = vi.fn().mockResolvedValue({});
vi.mock("@/lib/server/session", () => ({
  clearSession: (...a: unknown[]) => clearSession(...a),
  updateOrCreateSession: (...a: unknown[]) => updateOrCreateSession(...a),
}));
vi.mock("@/lib/server/host", () => ({
  getPublicHost: () => "id.tijorat.plus",
  getPublicHostWithProtocol: () => "https://id.tijorat.plus",
}));
vi.mock("@/lib/zitadel", () => ({ getLoginSettings: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));

import * as actions from "./actions";

function context(verifiedMsAgo: number) {
  return {
    serviceConfig: { baseUrl: "http://api" },
    cookie: { id: "current", token: "session-token" },
    session: { factors: { password: { verifiedAt: timestampFromMs(Date.now() - verifiedMsAgo) } } },
    userId: "user-1",
  };
}

describe("account actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadAccountContext.mockResolvedValue(context(1000));
  });

  it("refuse everything without a signed-in session", async () => {
    loadAccountContext.mockResolvedValue(undefined);
    expect(await actions.updateProfile({ givenName: "A", familyName: "B", language: "ru" })).toEqual({
      error: "sessionExpired",
    });
    expect(users.updateHumanUser).not.toHaveBeenCalled();
  });

  it("change only the signed-in user's own profile", async () => {
    expect(await actions.updateProfile({ givenName: " Ali ", familyName: "Valiev", language: "tg" })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(users.updateHumanUser).toHaveBeenCalledWith({
      userId: "user-1",
      profile: { givenName: "Ali", familyName: "Valiev", displayName: "Ali Valiev", preferredLanguage: "tg" },
    });
  });

  it("ignore a language the fork does not offer", async () => {
    await actions.updateProfile({ givenName: "A", familyName: "B", language: "de" });
    expect(users.updateHumanUser.mock.calls[0][0].profile.preferredLanguage).toBeUndefined();
  });

  it("demand a fresh sign-in before sensitive changes", async () => {
    loadAccountContext.mockResolvedValue(context(11 * 60 * 1000));
    expect(await actions.startEmailChange("new@shop.tj")).toEqual({ reauth: true });
    expect(await actions.removePasskey("pk-1")).toEqual({ reauth: true });
    expect(await actions.disableOtp("totp")).toEqual({ reauth: true });
    expect(await actions.signOutOtherSessions()).toEqual({ reauth: true });
    expect(users.setEmail).not.toHaveBeenCalled();
    expect(users.removePasskey).not.toHaveBeenCalled();
    expect(sessions.deleteSession).not.toHaveBeenCalled();
  });

  it("send the email code with a link back to the login's verify page", async () => {
    await actions.startEmailChange("new@shop.tj");
    expect(users.setEmail).toHaveBeenCalledWith({
      userId: "user-1",
      email: "new@shop.tj",
      verification: {
        case: "sendCode",
        value: { urlTemplate: expect.stringContaining("https://id.tijorat.plus") },
      },
    });
  });

  it("reject malformed input before calling ZITADEL", async () => {
    expect(await actions.startEmailChange("not-an-email")).toEqual({ error: "invalidInput" });
    expect(await actions.startPhoneChange("abc")).toEqual({ error: "invalidInput" });
    expect(users.setEmail).not.toHaveBeenCalled();
  });

  it("change the password with the current one as the check", async () => {
    await actions.changePassword({ currentPassword: "old", newPassword: "New-Passw0rd!" });
    expect(users.setPassword).toHaveBeenCalledWith({
      userId: "user-1",
      newPassword: { password: "New-Passw0rd!", changeRequired: false },
      verification: { case: "currentPassword", value: "old" },
    });
    // the new password is checked into the session right away so the user stays signed in
    expect(updateOrCreateSession.mock.calls[0][0].checks.password.password).toBe("New-Passw0rd!");
  });

  it("end every other session of the user but keep this one", async () => {
    expect(await actions.signOutOtherSessions()).toEqual({ ok: true, data: { count: 2 } });
    expect(sessions.deleteSession.mock.calls.map((call) => call[0].sessionId)).toEqual(["other-1", "other-2"]);
  });

  it("sign out every session of this user in the browser, not another user's", async () => {
    getAllSessionCookieIds.mockResolvedValue(["older-of-user", "current", "someone-else"]);
    sessions.listSessions.mockResolvedValueOnce({ sessions: [{ id: "current" }, { id: "older-of-user" }] });
    expect(await actions.signOut()).toEqual({ ok: true, data: undefined });
    expect(clearSession.mock.calls.map((call) => call[0].sessionId)).toEqual(["older-of-user", "current"]);
  });
});
