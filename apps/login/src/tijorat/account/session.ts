import { Cookie, getMostRecentSessionCookie } from "@/lib/cookies";
import { getServiceConfig } from "@/lib/service-url";
import { hasVerifiedPrimaryFactor } from "@/lib/session";
import { createServerTransport, getSession, ServiceConfig } from "@/lib/zitadel";
import { createSessionServiceClient, createUserServiceClient } from "@zitadel/client/v2";
import { Session } from "@zitadel/proto/zitadel/session/v2/session_pb";
import { headers } from "next/headers";
import "server-only";

export type AccountContext = {
  serviceConfig: ServiceConfig;
  cookie: Cookie;
  session: Session;
  userId: string;
};

/**
 * The signed-in user of the account page: the most recent session in the signed `sessions`
 * cookie, checked with ZITADEL (GetSession with its token) and required to carry a verified
 * primary factor. An identify-only or expired session gives undefined.
 */
export async function loadAccountContext(): Promise<AccountContext | undefined> {
  const { serviceConfig } = getServiceConfig(await headers());
  const cookie = await getMostRecentSessionCookie();
  if (!cookie) {
    return undefined;
  }
  const response = await getSession({ serviceConfig, sessionId: cookie.id, sessionToken: cookie.token }).catch(
    () => undefined,
  );
  const session = response?.session;
  const userId = session?.factors?.user?.id;
  if (!session || !userId || !hasVerifiedPrimaryFactor(session).valid) {
    return undefined;
  }
  return { serviceConfig, cookie, session, userId };
}

/**
 * ZITADEL clients that act as the user: the session token is the bearer, so ZITADEL itself only
 * allows changes to that user ("self", internal/command/permission_checks.go). The login's own
 * service credentials are never used for account changes.
 */
export function selfServices({ cookie, serviceConfig }: AccountContext) {
  const transport = createServerTransport(cookie.token, serviceConfig);
  return { users: createUserServiceClient(transport), sessions: createSessionServiceClient(transport) };
}
