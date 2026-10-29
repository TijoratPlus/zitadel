"use client";

import { Alert } from "@/components/alert";
import { AutoSubmitForm } from "@/components/auto-submit-form";
import { PasswordComplexity } from "@/components/password-complexity";
import { PrivacyPolicyCheckboxes } from "@/components/privacy-policy-checkboxes";
import { Spinner } from "@/components/spinner";
import { lowerCaseValidator, numberValidator, symbolValidator, upperCaseValidator } from "@/helpers/validators";
import { handleServerActionResponse } from "@/lib/client-utils";
import { registerUser } from "@/lib/server/register";
import { LegalAndSupportSettings } from "@zitadel/proto/zitadel/settings/v2/legal_settings_pb";
import { PasswordComplexitySettings } from "@zitadel/proto/zitadel/settings/v2/password_settings_pb";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { TjButton, TjLinkButton } from "../ui/button";
import { TjField } from "../ui/field";

type Inputs = { firstname: string; lastname: string; email: string; password: string; confirmPassword: string };

type Props = {
  legal: LegalAndSupportSettings;
  passwordComplexitySettings: PasswordComplexitySettings;
  organization: string;
  firstname?: string;
  lastname?: string;
  email?: string;
  requestId?: string;
};

export function passwordMeetsPolicy(password: string, settings?: PasswordComplexitySettings): boolean {
  if (!settings) {
    return password.length > 0;
  }
  return (
    password.length >= Number(settings.minLength) &&
    (!settings.requiresLowercase || lowerCaseValidator(password)) &&
    (!settings.requiresUppercase || upperCaseValidator(password)) &&
    (!settings.requiresNumber || numberValidator(password)) &&
    (!settings.requiresSymbol || symbolValidator(password))
  );
}

/**
 * Tijorat+ registration on one screen: name, email and password, no passkey/password choice.
 * The passkey is offered right after registration (src/tijorat/passkey). Replaces RegisterForm
 * on /register (hook in src/app/(login)/register/page.tsx).
 */
export function TijoratSignUpForm({
  legal,
  passwordComplexitySettings,
  organization,
  firstname,
  lastname,
  email,
  requestId,
}: Props) {
  const t = useTranslations("register");
  const tSignUp = useTranslations("tijorat.signUp");
  const router = useRouter();
  const { register, handleSubmit, watch, formState } = useForm<Inputs>({
    mode: "onChange",
    defaultValues: {
      firstname: firstname ?? "",
      lastname: lastname ?? "",
      email: email ?? "",
      password: "",
      confirmPassword: "",
    },
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [samlData, setSamlData] = useState<{ url: string; fields: Record<string, string> } | null>(null);
  const [legalAccepted, setLegalAccepted] = useState(false);

  const password = watch("password");
  const confirmPassword = watch("confirmPassword");
  const legalRequired = !!(legal?.tosLink || legal?.privacyPolicyLink);
  const canSubmit =
    formState.isValid &&
    passwordMeetsPolicy(password, passwordComplexitySettings) &&
    password === confirmPassword &&
    (!legalRequired || legalAccepted);

  async function submit(values: Inputs) {
    setError("");
    setLoading(true);
    try {
      const res = await registerUser({
        email: values.email.trim(),
        firstName: values.firstname.trim(),
        lastName: values.lastname.trim(),
        organization,
        requestId,
        password: values.password,
      });
      handleServerActionResponse(res, router, setSamlData, setError);
    } catch {
      setError(t("errors.couldNotRegisterUser"));
    } finally {
      setLoading(false);
    }
  }

  function goToSignIn() {
    const params = new URLSearchParams();
    if (organization) params.set("organization", organization);
    if (requestId) params.set("requestId", requestId);
    router.push("/loginname?" + params);
  }

  return (
    <>
      {samlData && <AutoSubmitForm url={samlData.url} fields={samlData.fields} />}
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(submit)} noValidate>
        <div className="grid grid-cols-2 gap-3">
          <TjField
            label={t("labels.firstname")}
            autoComplete="given-name"
            autoFocus
            data-testid="firstname-text-input"
            error={formState.errors.firstname?.message}
            {...register("firstname", { required: t("required.firstname") })}
          />
          <TjField
            label={t("labels.lastname")}
            autoComplete="family-name"
            data-testid="lastname-text-input"
            error={formState.errors.lastname?.message}
            {...register("lastname", { required: t("required.lastname") })}
          />
        </div>
        <TjField
          label={t("labels.email")}
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          data-testid="email-text-input"
          error={formState.errors.email?.message}
          {...register("email", { required: t("required.email") })}
        />
        <TjField
          label={t("password.labels.password")}
          type="password"
          autoComplete="new-password"
          data-testid="password-text-input"
          {...register("password", { required: t("password.required.password") })}
        />
        <TjField
          label={t("password.labels.confirmPassword")}
          type="password"
          autoComplete="new-password"
          data-testid="password-confirm-text-input"
          {...register("confirmPassword", { required: t("password.required.confirmPassword") })}
        />
        {passwordComplexitySettings && (password || confirmPassword) && (
          <PasswordComplexity
            passwordComplexitySettings={passwordComplexitySettings}
            password={password}
            equals={!!password && password === confirmPassword}
          />
        )}
        {legalRequired && <PrivacyPolicyCheckboxes legal={legal} onChange={setLegalAccepted} />}

        {error && <Alert>{error}</Alert>}

        <TjButton type="submit" className="mt-1" disabled={loading || !canSubmit} data-testid="submit-button">
          {loading && <Spinner className="h-5 w-5" />}
          {tSignUp("submit")}
        </TjButton>
        <p className="text-center text-[12.5px] text-[var(--tj-ink-3)]">{tSignUp("passkeyHint")}</p>
      </form>

      <p className="mt-6 text-center text-[13.5px] text-[var(--tj-ink-3)]">
        {tSignUp("haveAccount")}{" "}
        <TjLinkButton onClick={goToSignIn} data-testid="sign-in-link">
          {tSignUp("signIn")}
        </TjLinkButton>
      </p>
    </>
  );
}
