import { beforeEach, describe, expect, test, vi } from "vitest";
import { requestPasswordReset, signInWithPassword } from "./sign-in";

const sendLoginname = vi.fn();
const sendPassword = vi.fn();
const resetPassword = vi.fn();

vi.mock("@/lib/server/loginname", () => ({ sendLoginname: (...a: unknown[]) => sendLoginname(...a) }));
vi.mock("@/lib/server/password", () => ({
  sendPassword: (...a: unknown[]) => sendPassword(...a),
  resetPassword: (...a: unknown[]) => resetPassword(...a),
}));
vi.mock("@zitadel/client", () => ({ create: (_schema: unknown, data: unknown) => data }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (namespace: string) => (key: string) => `${namespace}.${key}`),
}));

const base = { loginName: "aziz@tijorat.tj", password: "Secret-123", requestId: "oidc_1", defaultOrganization: "def" };

describe("signInWithPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendPassword.mockResolvedValue({ redirect: "https://app.tijorat.plus/callback" });
  });

  test("checks the password right away when the user signs in with a password", async () => {
    sendLoginname.mockResolvedValue({
      redirect: "/password?loginName=aziz%40tijorat.tj&organization=org-1&requestId=oidc_1",
    });

    const result = await signInWithPassword(base);

    expect(sendLoginname).toHaveBeenCalledWith(
      expect.objectContaining({ loginName: "aziz@tijorat.tj", requestId: "oidc_1" }),
    );
    expect(sendPassword).toHaveBeenCalledWith({
      loginName: "aziz@tijorat.tj",
      organization: "org-1",
      defaultOrganization: "def",
      requestId: "oidc_1",
      checks: { password: { password: "Secret-123" } },
    });
    expect(result).toEqual({ redirect: "https://app.tijorat.plus/callback" });
  });

  test("unknown users get the decoy password step and the generic error", async () => {
    sendLoginname.mockResolvedValue({ redirect: "/password?loginName=nobody%40x.tj&requestId=oidc_1" });
    sendPassword.mockResolvedValue({ error: "password.errors.failedToAuthenticateNoLimit" });

    expect(await signInWithPassword({ ...base, loginName: "nobody@x.tj" })).toEqual({
      error: "tijorat.signIn.wrongCredentials",
    });
  });

  test("an unknown user and a wrong password read the same", async () => {
    sendLoginname.mockResolvedValue({ error: "loginname.errors.userNotFound" });
    const unknown = await signInWithPassword(base);

    sendLoginname.mockResolvedValue({ redirect: "/password?loginName=aziz" });
    sendPassword.mockResolvedValue({ error: "password.errors.couldNotCreateSessionForUser" });
    const wrongPassword = await signInWithPassword(base);

    expect(unknown).toEqual({ error: "tijorat.signIn.wrongCredentials" });
    expect(wrongPassword).toEqual(unknown);
  });

  test("keeps the lockout message, which tells the user how many attempts are left", async () => {
    sendLoginname.mockResolvedValue({ redirect: "/password?loginName=aziz" });
    sendPassword.mockResolvedValue({ error: "Failed to authenticate. You had 2 of 5 password attempts." });

    expect(await signInWithPassword(base)).toEqual({ error: "Failed to authenticate. You had 2 of 5 password attempts." });
  });

  test.each([
    ["IdP", { redirect: "https://idp.example/authorize" }],
    ["passkey only", { redirect: "/passkey?loginName=aziz&altPassword=false" }],
    ["invite", { redirect: "/verify?invite=true" }],
    ["error", { error: "User is not active." }],
  ])("%s: follows the identifier step and ignores the password", async (_name, identified) => {
    sendLoginname.mockResolvedValue(identified);

    expect(await signInWithPassword(base)).toEqual(identified);
    expect(sendPassword).not.toHaveBeenCalled();
  });
});

describe("requestPasswordReset", () => {
  test("hides the outcome unless there is an error", async () => {
    resetPassword.mockResolvedValue({ details: {} });
    expect(await requestPasswordReset({ loginName: "aziz" })).toEqual({});

    resetPassword.mockResolvedValue({ error: "Password reset is not allowed." });
    expect(await requestPasswordReset({ loginName: "aziz" })).toEqual({ error: "Password reset is not allowed." });
  });
});
