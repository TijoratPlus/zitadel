"use client";

import { Alert, AlertType } from "@/components/alert";
import { AutoSubmitForm } from "@/components/auto-submit-form";
import { Spinner } from "@/components/spinner";
import { handleServerActionResponse } from "@/lib/client-utils";
import { sendLoginname } from "@/lib/server/loginname";
import { LoginSettings } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { TjButton, TjLinkButton } from "../ui/button";
import { TjField } from "../ui/field";
import { requestPasswordReset, signInWithPassword } from "./sign-in";

type Inputs = { loginName: string; password: string };

type Props = {
  loginName: string | undefined;
  requestId: string | undefined;
  loginSettings: LoginSettings | undefined;
  organization?: string;
  defaultOrganization?: string;
  suffix?: string;
  submit: boolean;
  allowRegister: boolean;
};

/**
 * Tijorat+ sign-in: login name and password on one screen, with a visible "Create account"
 * button. Replaces UsernameForm on /loginname (hook in src/app/(login)/loginname/page.tsx).
 */
export function TijoratSignInForm({
  loginName,
  requestId,
  loginSettings,
  organization,
  defaultOrganization,
  suffix,
  submit,
  allowRegister,
}: Props) {
  const t = useTranslations("tijorat.signIn");
  const tLogin = useTranslations("loginname");
  const router = useRouter();
  const { register, handleSubmit, getValues, setFocus, formState } = useForm<Inputs>({
    mode: "onChange",
    defaultValues: { loginName: loginName ?? "", password: "" },
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [samlData, setSamlData] = useState<{ url: string; fields: Record<string, string> } | null>(null);

  // A login hint with submit=true keeps the upstream behaviour: identify the user right away.
  useEffect(() => {
    if (submit && loginName) {
      sendLoginname({ loginName, organization, defaultOrganization, requestId, suffix })
        .then((res) => handleServerActionResponse(res, router, setSamlData, setError))
        .catch(() => setError(tLogin("errors.internalError")));
    }
  }, [submit, loginName, organization, defaultOrganization, requestId, suffix, router, tLogin]);

  useEffect(() => {
    if (loginName) {
      setFocus("password");
    }
  }, [loginName, setFocus]);

  async function signIn(values: Inputs) {
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const res = await signInWithPassword({
        loginName: values.loginName.trim(),
        password: values.password,
        organization,
        defaultOrganization,
        requestId,
        suffix,
      });
      handleServerActionResponse(res, router, setSamlData, setError);
    } catch {
      setError(tLogin("errors.internalError"));
    } finally {
      setLoading(false);
    }
  }

  async function forgotPassword() {
    setError("");
    setInfo("");
    const value = getValues("loginName").trim();
    if (!value) {
      setError(t("forgotNeedsLogin"));
      setFocus("loginName");
      return;
    }
    setLoading(true);
    try {
      const res = await requestPasswordReset({ loginName: value, organization, defaultOrganization, requestId });
      if (res.error) {
        setError(res.error);
      } else {
        setInfo(t("resetSent"));
      }
    } catch {
      setError(tLogin("errors.internalError"));
    } finally {
      setLoading(false);
    }
  }

  function goToRegister() {
    const params = new URLSearchParams();
    if (organization) params.set("organization", organization);
    if (requestId) params.set("requestId", requestId);
    const typed = getValues("loginName").trim();
    if (typed.includes("@")) params.set("email", typed);
    router.push("/register?" + params);
  }

  let loginLabel = tLogin("labels.loginname");
  if (loginSettings?.disableLoginWithEmail && loginSettings?.disableLoginWithPhone) {
    loginLabel = tLogin("labels.username");
  } else if (loginSettings?.disableLoginWithEmail) {
    loginLabel = tLogin("labels.usernameOrPhoneNumber");
  } else if (loginSettings?.disableLoginWithPhone) {
    loginLabel = tLogin("labels.usernameOrEmail");
  }

  return (
    <>
      {samlData && <AutoSubmitForm url={samlData.url} fields={samlData.fields} />}
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(signIn)} noValidate>
        <TjField
          label={loginLabel}
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={!loginName}
          placeholder={t("loginPlaceholder")}
          data-testid="username-text-input"
          {...register("loginName", { required: tLogin("required.loginName") })}
        />
        <TjField
          label={t("passwordLabel")}
          type="password"
          revealable
          autoComplete="current-password"
          data-testid="password-text-input"
          labelAside={
            !loginSettings?.hidePasswordReset && (
              <TjLinkButton className="text-[12.5px]" onClick={forgotPassword} disabled={loading} data-testid="reset-button">
                {t("forgot")}
              </TjLinkButton>
            )
          }
          {...register("password", { required: true })}
        />

        {error && (
          <div data-testid="error">
            <Alert>{error}</Alert>
          </div>
        )}
        {info && <Alert type={AlertType.INFO}>{info}</Alert>}

        <TjButton type="submit" className="mt-1" disabled={loading || !formState.isValid} data-testid="submit-button">
          {loading && <Spinner className="h-5 w-5" />}
          {t("submit")}
        </TjButton>
      </form>

      {allowRegister && (
        <div className="mt-6 flex flex-col gap-3">
          <div className="flex items-center gap-3 text-[12px] text-[var(--tj-ink-3)]">
            <span className="h-px flex-1 bg-[var(--tj-hairline)]" />
            {t("noAccount")}
            <span className="h-px flex-1 bg-[var(--tj-hairline)]" />
          </div>
          <TjButton variant="outline" onClick={goToRegister} disabled={loading} data-testid="register-button">
            {t("createAccount")}
          </TjButton>
        </div>
      )}
    </>
  );
}
