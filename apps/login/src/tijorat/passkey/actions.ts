"use server";

import { completeFlowOrGetUrl } from "@/lib/client";
import { getSessionCookieById } from "@/lib/cookies";
import { getServiceConfig } from "@/lib/service-url";
import { getLoginSettings, getSession } from "@/lib/zitadel";
import { cookies, headers } from "next/headers";
import { getSnoozedUserIds, PASSKEY_OFFER_SNOOZE_COOKIE } from "./offer";
import { addSnoozedUserId, PASSKEY_OFFER_SNOOZE_DAYS } from "./offer-policy";

/**
 * Leaves the passkey offer, either after a passkey was registered or because the user declined
 * (`snooze`). The session still carries the verified password, so the flow completes without a
 * second sign-in; completing an OIDC/SAML request re-validates the session as usual.
 */
export async function continueAfterPasskeyOffer({
  sessionId,
  requestId,
  organization,
  snooze,
}: {
  sessionId: string;
  requestId?: string;
  organization?: string;
  snooze: boolean;
}): Promise<{ redirect: string } | { error: string } | { samlData: { url: string; fields: Record<string, string> } }> {
  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  // Only sessions held in this browser's signed session cookie can be continued.
  const sessionCookie = await getSessionCookieById({ sessionId });
  if (!sessionCookie) {
    return { error: "Could not find session" };
  }
  const { session } = await getSession({ serviceConfig, sessionId: sessionCookie.id, sessionToken: sessionCookie.token });
  const user = session?.factors?.user;
  if (!session || !user?.id) {
    return { error: "Could not find session" };
  }

  if (snooze) {
    const cookiesList = await cookies();
    cookiesList.set({
      name: PASSKEY_OFFER_SNOOZE_COOKIE,
      value: addSnoozedUserId(await getSnoozedUserIds(), user.id).join(","),
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: PASSKEY_OFFER_SNOOZE_DAYS * 24 * 60 * 60,
    });
  }

  const org = organization ?? user.organizationId;
  const loginSettings = await getLoginSettings({ serviceConfig, organization: org });

  if (requestId) {
    return completeFlowOrGetUrl({ sessionId: session.id, requestId, organization: org }, loginSettings?.defaultRedirectUri);
  }
  return completeFlowOrGetUrl({ loginName: user.loginName, organization: org }, loginSettings?.defaultRedirectUri);
}
