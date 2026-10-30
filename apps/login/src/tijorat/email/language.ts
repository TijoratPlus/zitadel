import { getUserByID } from "@/lib/zitadel";
import "server-only";

/**
 * The recipient's preferred language. ZITADEL's email payload does not carry it, so it is read
 * with the login's own service credentials. The instance is the one the link in the email points
 * to, unless TIJORAT_EMAIL_INSTANCE_HOST pins it.
 */
export async function preferredLanguage(userId: string, url: string | undefined): Promise<string | undefined> {
  const baseUrl = process.env.ZITADEL_API_URL;
  let host = process.env.TIJORAT_EMAIL_INSTANCE_HOST;
  if (!host && url) {
    try {
      host = new URL(url).host;
    } catch {
      // no usable link; fall through to the instance ZITADEL_API_URL resolves to
    }
  }
  if (!baseUrl || !userId) {
    return undefined;
  }
  const { user } = await getUserByID({
    serviceConfig: { baseUrl, ...(host && { instanceHost: host, publicHost: host }) },
    userId,
  });
  return user?.type.case === "human" ? user.type.value.profile?.preferredLanguage : undefined;
}
