import "server-only";

import { Session } from "@zitadel/proto/zitadel/session/v2/session_pb";
import { LoginSettings } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { AuthenticationMethodType } from "@zitadel/proto/zitadel/user/v2/user_service_pb";
import { cookies } from "next/headers";
import { isPasskeyOfferEnabled } from "../config";
import { parseSnoozedUserIds, shouldOfferPasskey } from "./offer-policy";

export const PASSKEY_OFFER_SNOOZE_COOKIE = "tj-passkey-offer-snooze";

export async function getSnoozedUserIds(): Promise<string[]> {
  const cookiesList = await cookies();
  return parseSnoozedUserIds(cookiesList.get(PASSKEY_OFFER_SNOOZE_COOKIE)?.value);
}

/**
 * Called after a password login has passed every check (password change, email verification,
 * MFA). Returns a redirect to the passkey offer when it applies, otherwise undefined and the
 * caller completes the flow as usual.
 */
export async function getPasskeyOfferRedirect({
  session,
  loginSettings,
  authMethods,
  organization,
  requestId,
}: {
  session: Session;
  loginSettings?: LoginSettings;
  authMethods: AuthenticationMethodType[];
  organization?: string;
  requestId?: string;
}): Promise<{ redirect: string } | undefined> {
  if (!isPasskeyOfferEnabled()) {
    return undefined;
  }

  const offer = shouldOfferPasskey({
    enabled: true,
    passkeysType: loginSettings?.passkeysType,
    authMethods,
    userId: session.factors?.user?.id,
    snoozedUserIds: await getSnoozedUserIds(),
  });
  if (!offer) {
    return undefined;
  }

  const params = new URLSearchParams({ sessionId: session.id });
  if (session.factors?.user?.loginName) {
    params.set("loginName", session.factors.user.loginName);
  }
  const org = organization ?? session.factors?.user?.organizationId;
  if (org) {
    params.set("organization", org);
  }
  if (requestId) {
    params.set("requestId", requestId);
  }
  return { redirect: "/passkey/offer?" + params };
}
