"use client";

import { Alert } from "@/components/alert";
import { AutoSubmitForm } from "@/components/auto-submit-form";
import { Button, ButtonVariants } from "@/components/button";
import { Spinner } from "@/components/spinner";
import { Translated } from "@/components/translated";
import { coerceToArrayBuffer, coerceToBase64Url } from "@/helpers/base64";
import { handleServerActionResponse } from "@/lib/client-utils";
import { registerPasskeyLink, verifyPasskeyRegistration } from "@/lib/server/passkeys";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { continueAfterPasskeyOffer } from "./actions";

type Props = {
  sessionId: string;
  requestId?: string;
  organization?: string;
};

type SamlData = { url: string; fields: Record<string, string> };

async function platformAuthenticatorAvailable(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    return false;
  }
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Creates a passkey for the session's user; mirrors the ceremony in components/register-passkey.tsx. */
async function createPasskey(sessionId: string): Promise<boolean> {
  const resp = await registerPasskeyLink({ sessionId });
  if (!resp || ("error" in resp && resp.error) || !("passkeyId" in resp)) {
    return false;
  }

  const options = (resp.publicKeyCredentialCreationOptions as CredentialCreationOptions) ?? {};
  if (!options.publicKey) {
    return false;
  }
  options.publicKey.challenge = coerceToArrayBuffer(options.publicKey.challenge, "challenge");
  options.publicKey.user.id = coerceToArrayBuffer(options.publicKey.user.id, "userid");
  options.publicKey.excludeCredentials?.forEach((cred: any) => {
    cred.id = coerceToArrayBuffer(cred.id as string, "excludeCredentials.id");
  });

  const credentials = (await navigator.credentials.create(options)) as any;
  if (!credentials?.response?.attestationObject || !credentials?.response?.clientDataJSON || !credentials?.rawId) {
    return false;
  }

  await verifyPasskeyRegistration({
    passkeyId: resp.passkeyId,
    publicKeyCredential: {
      id: credentials.id,
      rawId: coerceToBase64Url(credentials.rawId, "rawId"),
      type: credentials.type,
      response: {
        attestationObject: coerceToBase64Url(credentials.response.attestationObject, "attestationObject"),
        clientDataJSON: coerceToBase64Url(credentials.response.clientDataJSON, "clientDataJSON"),
      },
    },
    sessionId,
  });
  return true;
}

export function PasskeyOffer({ sessionId, requestId, organization }: Props) {
  const t = useTranslations("tijorat.passkeyOffer");
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [samlData, setSamlData] = useState<SamlData | null>(null);

  const finish = useCallback(
    async (snooze: boolean) => {
      const response = await continueAfterPasskeyOffer({ sessionId, requestId, organization, snooze });
      handleServerActionResponse(response, router, setSamlData, setError);
    },
    [sessionId, requestId, organization, router],
  );

  // Devices without a built-in authenticator are not asked; the flow simply continues.
  useEffect(() => {
    platformAuthenticatorAvailable().then((available) => {
      if (available) {
        setChecking(false);
      } else {
        finish(false);
      }
    });
  }, [finish]);

  async function enable() {
    setError("");
    setLoading(true);
    try {
      if (await createPasskey(sessionId)) {
        await finish(false);
        return;
      }
      setError(t("failed"));
    } catch {
      // Cancelling the browser dialog lands here too.
      setError(t("failed"));
    } finally {
      setLoading(false);
    }
  }

  async function later() {
    setLoading(true);
    try {
      await finish(true);
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="flex items-center justify-center space-x-2 py-6 text-sm">
        <Spinner className="h-5 w-5" />
        <Translated i18nKey="passkeyOffer.checking" namespace="tijorat" />
      </div>
    );
  }

  return (
    <div className="w-full">
      {error && (
        <div className="py-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="mt-8 flex w-full flex-row items-center">
        <Button type="button" variant={ButtonVariants.Secondary} disabled={loading} onClick={later}>
          <Translated i18nKey="passkeyOffer.later" namespace="tijorat" />
        </Button>
        <span className="flex-grow"></span>
        <Button
          type="button"
          variant={ButtonVariants.Primary}
          disabled={loading}
          onClick={enable}
          data-testid="submit-button"
        >
          {loading && <Spinner className="mr-2 h-5 w-5" />}
          <Translated i18nKey="passkeyOffer.enable" namespace="tijorat" />
        </Button>
      </div>
      {samlData && <AutoSubmitForm url={samlData.url} fields={samlData.fields} />}
    </div>
  );
}
