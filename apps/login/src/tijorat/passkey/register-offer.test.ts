import { registerUser } from "@/lib/server/register";
import { beforeEach, describe, expect, test, vi } from "vitest";

// Covers the TIJORAT hook in src/lib/server/register.ts: the passkey offer after registration.

const getPasskeyOfferRedirect = vi.fn();
const completeFlowOrGetUrl = vi.fn();

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/lib/service-url", () => ({ getServiceConfig: () => ({ serviceConfig: {} }) }));
vi.mock("@/lib/zitadel", () => ({
  getLoginSettings: vi.fn(async () => ({ allowRegister: true, allowLocalAuthentication: true })),
  addHumanUser: vi.fn(async () => ({ userId: "user-1" })),
  getUserByID: vi.fn(async () => ({ user: { type: { case: "human", value: { email: { isVerified: true } } } } })),
  addIDPLink: vi.fn(),
  listAuthenticationMethodTypes: vi.fn(),
}));
vi.mock("@/lib/server/cookie", () => ({
  createSessionAndUpdateCookie: vi.fn(async () => ({
    session: { id: "session-1", factors: { user: { id: "user-1", loginName: "aziz@tijorat.tj", organizationId: "org-1" } } },
  })),
  createSessionForIdpAndUpdateCookie: vi.fn(),
}));
vi.mock("@/lib/verify-helper", () => ({ checkEmailVerification: vi.fn(async () => undefined), checkMFAFactors: vi.fn() }));
vi.mock("@/lib/verification-check", () => ({ setUserVerificationCheckCookie: vi.fn() }));
vi.mock("@/lib/client", () => ({ completeFlowOrGetUrl: (...a: unknown[]) => completeFlowOrGetUrl(...a) }));
vi.mock("@/tijorat/passkey/offer", () => ({ getPasskeyOfferRedirect: (...a: unknown[]) => getPasskeyOfferRedirect(...a) }));

const command = {
  email: "aziz@tijorat.tj",
  firstName: "Азиз",
  lastName: "Каримов",
  password: "Kassa2026",
  organization: "org-1",
  requestId: "oidc_1",
};

describe("registerUser with a password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    completeFlowOrGetUrl.mockResolvedValue({ redirect: "https://app.tijorat.plus/callback" });
  });

  test("offers a passkey before completing the flow", async () => {
    getPasskeyOfferRedirect.mockResolvedValue({ redirect: "/passkey/offer?sessionId=session-1" });

    expect(await registerUser(command)).toEqual({ redirect: "/passkey/offer?sessionId=session-1" });
    expect(getPasskeyOfferRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "oidc_1", session: expect.objectContaining({ id: "session-1" }) }),
    );
    expect(completeFlowOrGetUrl).not.toHaveBeenCalled();
  });

  test("completes the flow when there is no offer", async () => {
    getPasskeyOfferRedirect.mockResolvedValue(undefined);

    expect(await registerUser(command)).toEqual({ redirect: "https://app.tijorat.plus/callback" });
    expect(completeFlowOrGetUrl).toHaveBeenCalledWith(
      { sessionId: "session-1", requestId: "oidc_1", organization: "org-1" },
      undefined,
    );
  });
});
