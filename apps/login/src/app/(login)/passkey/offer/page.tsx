// TIJORAT: passkey offer shown after a password login, see src/tijorat/passkey.
import { Alert } from "@/components/alert";
import { DynamicTheme } from "@/components/dynamic-theme";
import { Translated } from "@/components/translated";
import { UserAvatar } from "@/components/user-avatar";
import { getServiceConfig } from "@/lib/service-url";
import { loadMostRecentSession } from "@/lib/session";
import { getBrandingSettings } from "@/lib/zitadel";
import { PasskeyOffer } from "@/tijorat/passkey/passkey-offer";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tijorat.passkeyOffer");
  return { title: t("title") };
}

export default async function Page(props: { searchParams: Promise<Record<string | number | symbol, string | undefined>> }) {
  const searchParams = await props.searchParams;
  const { loginName, organization, requestId } = searchParams;

  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  const session = loginName
    ? await loadMostRecentSession({ serviceConfig, sessionParams: { loginName, organization } })
    : undefined;
  const branding = await getBrandingSettings({ serviceConfig, organization });

  return (
    <DynamicTheme branding={branding}>
      <div className="flex flex-col space-y-4">
        <h1>
          <Translated i18nKey="passkeyOffer.title" namespace="tijorat" />
        </h1>
        <p className="ztdl-p mb-6 block">
          <Translated i18nKey="passkeyOffer.description" namespace="tijorat" />
        </p>
        {session && (
          <UserAvatar
            loginName={loginName ?? session.factors?.user?.loginName}
            displayName={session.factors?.user?.displayName}
            showDropdown={false}
            searchParams={searchParams}
          />
        )}
      </div>

      <div className="w-full">
        {session?.id ? (
          <PasskeyOffer sessionId={session.id} requestId={requestId} organization={organization} />
        ) : (
          <Alert>
            <Translated i18nKey="sessionExpired" namespace="error" />
          </Alert>
        )}
      </div>
    </DynamicTheme>
  );
}
