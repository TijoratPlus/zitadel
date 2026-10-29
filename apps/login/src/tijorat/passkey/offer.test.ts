import { PasskeysType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { AuthenticationMethodType } from "@zitadel/proto/zitadel/user/v2/user_service_pb";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getPasskeyOfferRedirect, PASSKEY_OFFER_SNOOZE_COOKIE } from "./offer";

const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (cookieStore.has(name) ? { name, value: cookieStore.get(name) } : undefined),
  })),
}));

const session = {
  id: "session-1",
  factors: { user: { id: "user-1", loginName: "aziz@tijorat.plus", organizationId: "org-1" } },
} as any;

const args = {
  session,
  loginSettings: { passkeysType: PasskeysType.ALLOWED } as any,
  authMethods: [AuthenticationMethodType.PASSWORD],
};

describe("getPasskeyOfferRedirect", () => {
  beforeEach(() => {
    cookieStore.clear();
    vi.stubEnv("TIJORAT_PASSKEY_OFFER", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("redirects to the offer with the flow context", async () => {
    const result = await getPasskeyOfferRedirect({ ...args, requestId: "oidc_123" });
    expect(result?.redirect.startsWith("/passkey/offer?")).toBe(true);

    const params = new URLSearchParams(result!.redirect.split("?")[1]);
    expect(params.get("sessionId")).toBe("session-1");
    expect(params.get("loginName")).toBe("aziz@tijorat.plus");
    expect(params.get("organization")).toBe("org-1");
    expect(params.get("requestId")).toBe("oidc_123");
  });

  test("prefers the organization from the login context", async () => {
    const result = await getPasskeyOfferRedirect({ ...args, organization: "org-ctx" });
    expect(new URLSearchParams(result!.redirect.split("?")[1]).get("organization")).toBe("org-ctx");
  });

  test("does nothing when the switch is off", async () => {
    vi.stubEnv("TIJORAT_PASSKEY_OFFER", "");
    expect(await getPasskeyOfferRedirect(args)).toBeUndefined();
  });

  test("does nothing for a user who declined on this device", async () => {
    cookieStore.set(PASSKEY_OFFER_SNOOZE_COOKIE, "user-1");
    expect(await getPasskeyOfferRedirect(args)).toBeUndefined();
  });
});
