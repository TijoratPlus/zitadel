"use client";

import ThemeSwitch from "@/components/theme-switch";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { TijoratWordmark } from "../../brand/wordmark";
import { TIJORAT_LANGS } from "../../i18n";
import { TjButton, TjLinkButton } from "../../ui/button";
import { TjField } from "../../ui/field";
import { LanguagePills } from "../../ui/language-pills";
import * as actions from "../actions";
import { AccountData } from "../data";
import { ActionResult } from "../errors";
import { createCredential, getAssertion } from "../webauthn";
import { AccountCard, AccountRow, Badge, Notice } from "./primitives";

// ---- running actions with re-authentication --------------------------------------------------

type Outcome<T> = { ok: true; data: T } | { ok: false; error: string };
type Runner = <T>(action: () => Promise<ActionResult<T>>) => Promise<Outcome<T>>;

const RunnerContext = createContext<Runner | null>(null);

function useRun(): Runner {
  const run = useContext(RunnerContext);
  if (!run) {
    throw new Error("useRun outside AccountPage");
  }
  return run;
}

/**
 * Runs an action; on `{ reauth: true }` asks the user to confirm their sign-in (password or
 * passkey) and runs it once more. Errors come back as translated text.
 */
function useRunner(t: ReturnType<typeof useTranslations>, data: AccountData) {
  const [pending, setPending] = useState<((ok: boolean) => void) | null>(null);
  const router = useRouter();

  const run: Runner = useCallback(
    async (action) => {
      let result = await action();
      if ("reauth" in result) {
        const confirmed = await new Promise<boolean>((resolve) => setPending(() => resolve));
        setPending(null);
        if (!confirmed) {
          return { ok: false, error: t("errors.cancelled") };
        }
        result = await action();
      }
      if ("error" in result) {
        if (result.error === "sessionExpired") {
          router.push("/loginname");
        } else if (result.error === "mfaRequired") {
          // the page itself redirects to the second-factor check
          router.refresh();
        }
        return { ok: false, error: t(`errors.${result.error}`) };
      }
      if ("reauth" in result) {
        return { ok: false, error: t("errors.cancelled") };
      }
      router.refresh();
      return { ok: true, data: result.data };
    },
    [router, t],
  );

  const dialog = pending ? <ReauthDialog data={data} onDone={(ok) => pending(ok)} /> : null;
  return { run, dialog };
}

function ReauthDialog({ data, onDone }: { data: AccountData; onDone: (ok: boolean) => void }) {
  const t = useTranslations("tijorat.account");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function withPassword() {
    setBusy(true);
    setError("");
    const result = await actions.reauthWithPassword(password);
    setBusy(false);
    if ("ok" in result) {
      onDone(true);
    } else {
      setError(t("errors.wrongPassword"));
    }
  }

  async function withPasskey() {
    setBusy(true);
    setError("");
    try {
      const begin = await actions.beginReauthPasskey();
      if (!("ok" in begin)) {
        throw new Error();
      }
      const finish = await actions.finishReauthPasskey(await getAssertion(begin.data.options));
      if (!("ok" in finish)) {
        throw new Error();
      }
      onDone(true);
    } catch {
      setError(t("errors.cancelled"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reauth-title"
      className="fixed inset-0 z-50 grid items-end bg-black/40 sm:place-items-center sm:p-4"
    >
      <div className="w-full rounded-t-2xl bg-[var(--tj-surface)] p-6 pb-[max(24px,env(safe-area-inset-bottom))] shadow-xl sm:max-w-sm sm:rounded-2xl sm:pb-6">
        <h2 id="reauth-title" className="text-[18px] font-semibold text-[var(--tj-ink-1)]">
          {t("reauth.title")}
        </h2>
        <p className="mt-1 mb-4 text-[13.5px] text-[var(--tj-ink-3)]">{t("reauth.description")}</p>
        {data.hasPassword && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              withPassword();
            }}
          >
            <TjField
              label={t("reauth.password")}
              type="password"
              revealable
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="reauth-password"
            />
            <TjButton type="submit" disabled={busy || !password} data-testid="reauth-submit">
              {t("reauth.withPassword")}
            </TjButton>
          </form>
        )}
        {data.hasPasskey && (
          <TjButton variant="outline" className="mt-3" onClick={withPasskey} disabled={busy} data-testid="reauth-passkey">
            {t("reauth.withPasskey")}
          </TjButton>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        <TjButton variant="ghost" className="mt-3" onClick={() => onDone(false)} disabled={busy}>
          {t("common.cancel")}
        </TjButton>
      </div>
    </div>
  );
}

// ---- sections ------------------------------------------------------------------------------

function useFeedback() {
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  return {
    message,
    ok: (text: string) => setMessage({ tone: "ok", text }),
    fail: (text: string) => setMessage({ tone: "error", text }),
    clear: () => setMessage(null),
    node: message ? <Notice tone={message.tone}>{message.text}</Notice> : null,
  };
}

function ProfileSection({ data }: { data: AccountData }) {
  const t = useTranslations("tijorat.account");
  const run = useRun();
  const locale = useLocale();
  const [givenName, setGivenName] = useState(data.user.givenName);
  const [familyName, setFamilyName] = useState(data.user.familyName);
  const [language, setLanguage] = useState(
    TIJORAT_LANGS.some((l) => l.code === data.user.language) ? data.user.language : locale,
  );
  const [busy, setBusy] = useState(false);
  const feedback = useFeedback();

  async function save() {
    setBusy(true);
    feedback.clear();
    const result = await run(() => actions.updateProfile({ givenName, familyName, language }));
    setBusy(false);
    if (result.ok) {
      feedback.ok(t("common.saved"));
    } else {
      feedback.fail(result.error);
    }
  }

  return (
    <AccountCard title={t("profile.title")} testId="profile-section">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <TjField
          label={t("profile.givenName")}
          value={givenName}
          autoComplete="given-name"
          onChange={(e) => setGivenName(e.target.value)}
          data-testid="profile-given-name"
        />
        <TjField
          label={t("profile.familyName")}
          value={familyName}
          autoComplete="family-name"
          onChange={(e) => setFamilyName(e.target.value)}
          data-testid="profile-family-name"
        />
        <label className="grid gap-1.5 sm:col-span-2">
          <span className="tj-label">{t("profile.language")}</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            data-testid="profile-language"
            className="h-10 rounded-[10px] border border-[var(--tj-hairline)] bg-[var(--tj-surface)] px-3 text-[14px] text-[var(--tj-ink-1)]"
          >
            {TIJORAT_LANGS.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-2">
          <TjButton
            type="submit"
            block={false}
            disabled={busy || !givenName.trim() || !familyName.trim()}
            data-testid="profile-save"
          >
            {t("common.save")}
          </TjButton>
        </div>
      </form>
      {feedback.node}
    </AccountCard>
  );
}

/** Two-step change of email or phone: new value → code → confirm. */
function ContactRow({
  kind,
  value,
  verified,
  emptyText,
}: {
  kind: "email" | "phone";
  value: string;
  verified: boolean;
  emptyText?: string;
}) {
  const t = useTranslations("tijorat.account");
  const run = useRun();
  const [step, setStep] = useState<"view" | "edit" | "code">("view");
  const [draft, setDraft] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const feedback = useFeedback();

  async function send() {
    setBusy(true);
    feedback.clear();
    const result = await run(() => (kind === "email" ? actions.startEmailChange(draft) : actions.startPhoneChange(draft)));
    setBusy(false);
    if (result.ok) {
      setStep("code");
      feedback.ok(t(`${kind}.codeSent`, { [kind]: draft }));
    } else {
      feedback.fail(result.error);
    }
  }

  async function confirm() {
    setBusy(true);
    feedback.clear();
    const result = await run(() => (kind === "email" ? actions.confirmEmail(code) : actions.confirmPhone(code)));
    setBusy(false);
    if (result.ok) {
      setStep("view");
      setCode("");
      feedback.ok(t("common.saved"));
    } else {
      feedback.fail(result.error);
    }
  }

  async function verifyExisting() {
    setBusy(true);
    feedback.clear();
    const result = await run(() => actions.resendEmailCode());
    setBusy(false);
    if (result.ok) {
      setStep("code");
      feedback.ok(t("email.codeSent", { email: value }));
    } else {
      feedback.fail(result.error);
    }
  }

  async function remove() {
    setBusy(true);
    feedback.clear();
    const result = await run(() => actions.removePhone());
    setBusy(false);
    if (!result.ok) {
      feedback.fail(result.error);
    }
  }

  return (
    <div data-testid={`${kind}-row`}>
      <AccountRow
        actions={
          step === "view" && (
            <>
              {kind === "email" && value && !verified && (
                <TjButton variant="outline" block={false} onClick={verifyExisting} disabled={busy}>
                  {t("email.verifyNow")}
                </TjButton>
              )}
              <TjButton
                variant="outline"
                block={false}
                onClick={() => {
                  setDraft("");
                  setStep("edit");
                  feedback.clear();
                }}
                data-testid={`${kind}-change`}
              >
                {value ? t("common.change") : t("common.add")}
              </TjButton>
              {kind === "phone" && value && (
                <TjButton variant="ghost" block={false} onClick={remove} disabled={busy} data-testid="phone-remove">
                  {t("common.remove")}
                </TjButton>
              )}
            </>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 text-[15px] font-medium [overflow-wrap:anywhere] text-[var(--tj-ink-1)]">
            {value || emptyText}
          </span>
          {value && (
            <Badge tone={verified ? "ok" : "warn"}>{verified ? t("common.verified") : t("common.notVerified")}</Badge>
          )}
        </div>
      </AccountRow>

      {step === "edit" && (
        <form
          className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <TjField
            className="flex-1"
            label={t(`${kind}.new`)}
            type={kind === "email" ? "email" : "tel"}
            autoComplete={kind === "email" ? "email" : "tel"}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            data-testid={`${kind}-input`}
          />
          <TjButton type="submit" block={false} disabled={busy || !draft.trim()} data-testid={`${kind}-send`}>
            {t(`${kind}.sendCode`)}
          </TjButton>
          <TjButton type="button" variant="ghost" block={false} onClick={() => setStep("view")}>
            {t("common.cancel")}
          </TjButton>
        </form>
      )}

      {step === "code" && (
        <form
          className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
        >
          <TjField
            className="flex-1"
            label={t(`${kind}.code`)}
            inputMode="text"
            autoComplete="one-time-code"
            value={code}
            autoFocus
            onChange={(e) => setCode(e.target.value)}
            data-testid={`${kind}-code`}
          />
          <TjButton type="submit" block={false} disabled={busy || !code.trim()} data-testid={`${kind}-confirm`}>
            {t("common.confirm")}
          </TjButton>
          <TjButton type="button" variant="ghost" block={false} onClick={() => setStep("view")}>
            {t("common.cancel")}
          </TjButton>
        </form>
      )}
      {feedback.node}
    </div>
  );
}

function ContactSection({ data }: { data: AccountData }) {
  const t = useTranslations("tijorat.account");
  return (
    <>
      <AccountCard title={t("email.title")} testId="email-section">
        <ContactRow kind="email" value={data.user.email} verified={data.user.emailVerified} />
      </AccountCard>
      <AccountCard title={t("phone.title")} testId="phone-section">
        <ContactRow kind="phone" value={data.user.phone} verified={data.user.phoneVerified} emptyText={t("phone.none")} />
      </AccountCard>
    </>
  );
}

function passwordRules(data: AccountData, password: string) {
  const c = data.complexity;
  return [
    { key: "minLength", ok: password.length >= c.minLength, n: c.minLength, on: true },
    { key: "lowercase", ok: /[a-z]/.test(password), on: c.lowercase },
    { key: "uppercase", ok: /[A-Z]/.test(password), on: c.uppercase },
    { key: "number", ok: /[0-9]/.test(password), on: c.number },
    { key: "symbol", ok: /[^a-zA-Z0-9]/.test(password), on: c.symbol },
  ].filter((r) => r.on);
}

function PasswordSection({ data }: { data: AccountData }) {
  const t = useTranslations("tijorat.account");
  const run = useRun();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const feedback = useFeedback();
  const rules = passwordRules(data, next);
  const valid = !!current && rules.every((r) => r.ok) && next === repeat;

  if (!data.hasPassword) {
    return (
      <AccountCard title={t("password.title")} testId="password-section">
        <p className="text-[14px] text-[var(--tj-ink-2)]">{t("password.noPassword")}</p>
      </AccountCard>
    );
  }

  async function save() {
    setBusy(true);
    feedback.clear();
    const result = await run(() => actions.changePassword({ currentPassword: current, newPassword: next }));
    setBusy(false);
    if (result.ok) {
      setCurrent("");
      setNext("");
      setRepeat("");
      feedback.ok(t("password.changed"));
    } else {
      feedback.fail(result.error);
    }
  }

  return (
    <AccountCard title={t("password.title")} testId="password-section">
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <TjField
          label={t("password.current")}
          type="password"
          revealable
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          data-testid="password-current"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TjField
            label={t("password.new")}
            type="password"
            revealable
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            data-testid="password-new"
          />
          <TjField
            label={t("password.repeat")}
            type="password"
            revealable
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            error={repeat && next !== repeat ? t("password.mismatch") : undefined}
            data-testid="password-repeat"
          />
        </div>
        {next && (
          <ul className="flex flex-wrap gap-2">
            {rules.map((rule) => (
              <li key={rule.key}>
                <Badge tone={rule.ok ? "ok" : "muted"}>{t(`password.rules.${rule.key}`, { n: rule.n ?? 0 })}</Badge>
              </li>
            ))}
          </ul>
        )}
        <div>
          <TjButton type="submit" block={false} disabled={busy || !valid} data-testid="password-save">
            {t("common.save")}
          </TjButton>
        </div>
      </form>
      {feedback.node}
    </AccountCard>
  );
}

function PasskeysSection({ data }: { data: AccountData }) {
  const t = useTranslations("tijorat.account");
  const run = useRun();
  const [busy, setBusy] = useState(false);
  const feedback = useFeedback();

  if (!data.allowed.passkeys) {
    return null;
  }

  async function add() {
    setBusy(true);
    feedback.clear();
    const begin = await run(() => actions.beginPasskey());
    if (!begin.ok) {
      setBusy(false);
      feedback.fail(begin.error);
      return;
    }
    try {
      const credential = await createCredential(begin.data.options);
      const name = `${t("passkeys.defaultName")} · ${new Date().toLocaleDateString()}`;
      const finish = await run(() => actions.finishPasskey({ id: begin.data.id, name, credential }));
      if (finish.ok) {
        feedback.ok(t("passkeys.added"));
      } else {
        feedback.fail(finish.error);
      }
    } catch {
      feedback.fail(t("errors.cancelled"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    feedback.clear();
    const result = await run(() => actions.removePasskey(id));
    setBusy(false);
    if (result.ok) {
      feedback.ok(t("passkeys.removed"));
    } else {
      feedback.fail(result.error);
    }
  }

  return (
    <AccountCard title={t("passkeys.title")} description={t("passkeys.description")} testId="passkeys-section">
      {data.passkeys.length === 0 && <p className="mb-3 text-[14px] text-[var(--tj-ink-3)]">{t("passkeys.none")}</p>}
      {data.passkeys.map((passkey) => (
        <AccountRow
          key={passkey.id}
          actions={
            <TjButton
              variant="ghost"
              block={false}
              onClick={() => remove(passkey.id)}
              disabled={busy}
              data-testid="passkey-remove"
            >
              {t("common.remove")}
            </TjButton>
          }
        >
          <span className="text-[15px] font-medium text-[var(--tj-ink-1)]">{passkey.name || t("passkeys.defaultName")}</span>
        </AccountRow>
      ))}
      <TjButton variant="outline" block={false} className="mt-3" onClick={add} disabled={busy} data-testid="passkey-add">
        {t("passkeys.add")}
      </TjButton>
      {feedback.node}
    </AccountCard>
  );
}

function TwoFactorSection({ data }: { data: AccountData }) {
  const t = useTranslations("tijorat.account");
  const run = useRun();
  const [busy, setBusy] = useState(false);
  const [totp, setTotp] = useState<{ uri: string; secret: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const feedback = useFeedback();
  const { allowed } = data;

  if (!allowed.totp && !allowed.otpEmail && !allowed.otpSms && !allowed.u2f) {
    return null;
  }

  async function act<T>(action: () => Promise<ActionResult<T>>): Promise<Outcome<T>> {
    setBusy(true);
    feedback.clear();
    const result = await run(action);
    setBusy(false);
    if (!result.ok) {
      feedback.fail(result.error);
    }
    return result;
  }

  async function startTotp() {
    const result = await act(() => actions.beginTotp());
    if (result.ok) {
      setTotp(result.data);
    }
  }

  async function confirmTotp() {
    const result = await act(() => actions.finishTotp(totpCode));
    if (result.ok) {
      setTotp(null);
      setTotpCode("");
    }
  }

  async function addKey() {
    const begin = await act(() => actions.beginU2F());
    if (!begin.ok) {
      return;
    }
    setBusy(true);
    try {
      const credential = await createCredential(begin.data.options);
      const name = `${t("twoFactor.defaultKeyName")} · ${new Date().toLocaleDateString()}`;
      await act(() => actions.finishU2F({ id: begin.data.id, name, credential }));
    } catch {
      feedback.fail(t("errors.cancelled"));
    } finally {
      setBusy(false);
    }
  }

  function toggle(on: boolean, enable: () => void, disable: () => void, testId: string, blocked?: string) {
    return on ? (
      <TjButton variant="ghost" block={false} onClick={disable} disabled={busy} data-testid={`${testId}-disable`}>
        {t("common.disable")}
      </TjButton>
    ) : (
      <TjButton
        variant="outline"
        block={false}
        onClick={enable}
        disabled={busy || !!blocked}
        title={blocked}
        data-testid={`${testId}-enable`}
      >
        {t("common.enable")}
      </TjButton>
    );
  }

  return (
    <AccountCard title={t("twoFactor.title")} description={t("twoFactor.description")} testId="two-factor-section">
      {allowed.totp && (
        <AccountRow actions={!totp && toggle(data.totp, startTotp, () => act(() => actions.disableOtp("totp")), "totp")}>
          <FactorLabel title={t("twoFactor.totp")} hint={t("twoFactor.totpHint")} on={data.totp} />
          {totp && (
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="w-fit rounded-xl bg-white p-3">
                <QRCodeSVG value={totp.uri} size={148} />
              </div>
              <form
                className="flex flex-1 flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  confirmTotp();
                }}
              >
                <p className="text-[13px] text-[var(--tj-ink-3)]">{t("twoFactor.scan")}</p>
                <code className="rounded-lg bg-[var(--tj-bg)] px-2 py-1 text-[12.5px] break-all" data-testid="totp-secret">
                  {totp.secret}
                </code>
                <TjField
                  label={t("twoFactor.code")}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  data-testid="totp-code"
                />
                <div className="flex gap-2">
                  <TjButton type="submit" block={false} disabled={busy || !totpCode.trim()} data-testid="totp-confirm">
                    {t("common.confirm")}
                  </TjButton>
                  <TjButton type="button" variant="ghost" block={false} onClick={() => setTotp(null)}>
                    {t("common.cancel")}
                  </TjButton>
                </div>
              </form>
            </div>
          )}
        </AccountRow>
      )}
      {allowed.otpEmail && (
        <AccountRow
          actions={toggle(
            data.otpEmail,
            () => act(() => actions.enableOtp("otpEmail")),
            () => act(() => actions.disableOtp("otpEmail")),
            "otp-email",
            data.user.emailVerified ? undefined : t("twoFactor.needsEmail"),
          )}
        >
          <FactorLabel title={t("twoFactor.otpEmail")} on={data.otpEmail} />
        </AccountRow>
      )}
      {allowed.otpSms && (
        <AccountRow
          actions={toggle(
            data.otpSms,
            () => act(() => actions.enableOtp("otpSms")),
            () => act(() => actions.disableOtp("otpSms")),
            "otp-sms",
            data.user.phoneVerified ? undefined : t("twoFactor.needsPhone"),
          )}
        >
          <FactorLabel
            title={t("twoFactor.otpSms")}
            hint={data.user.phoneVerified ? undefined : t("twoFactor.needsPhone")}
            on={data.otpSms}
          />
        </AccountRow>
      )}
      {allowed.u2f && (
        <AccountRow
          actions={
            <TjButton variant="outline" block={false} onClick={addKey} disabled={busy} data-testid="u2f-add">
              {t("twoFactor.addKey")}
            </TjButton>
          }
        >
          <FactorLabel title={t("twoFactor.u2f")} hint={t("twoFactor.u2fHint")} on={data.u2f.length > 0} />
          {data.u2f.map((key) => (
            <div key={key.id} className="mt-2 flex items-center justify-between gap-2 text-[14px] text-[var(--tj-ink-2)]">
              <span>{key.name || t("twoFactor.defaultKeyName")}</span>
              <TjLinkButton onClick={() => act(() => actions.removeU2F(key.id))} disabled={busy}>
                {t("common.remove")}
              </TjLinkButton>
            </div>
          ))}
        </AccountRow>
      )}
      {feedback.node}
    </AccountCard>
  );
}

function FactorLabel({ title, hint, on }: { title: string; hint?: string; on: boolean }) {
  const t = useTranslations("tijorat.account");
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-medium text-[var(--tj-ink-1)]">{title}</span>
        {on && <Badge tone="ok">{t("common.enabled")}</Badge>}
      </div>
      {hint && <p className="mt-0.5 text-[12.5px] text-[var(--tj-ink-3)]">{hint}</p>}
    </div>
  );
}

function SessionsSection({ data }: { data: AccountData }) {
  const t = useTranslations("tijorat.account");
  const locale = useLocale();
  const run = useRun();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const feedback = useFeedback();
  const others = data.sessions.filter((s) => !s.current).length;

  async function signOutOthers() {
    setBusy(true);
    feedback.clear();
    const result = await run(() => actions.signOutOtherSessions());
    setBusy(false);
    if (result.ok) {
      feedback.ok(t("sessions.signedOutOthers", { count: result.data.count }));
    } else {
      feedback.fail(result.error);
    }
  }

  async function signOut() {
    setBusy(true);
    await actions.signOut();
    router.push("/loginname");
  }

  const format = (iso?: string) =>
    iso
      ? new Intl.DateTimeFormat(dateLocale(locale), { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso))
      : "";

  return (
    <AccountCard title={t("sessions.title")} testId="sessions-section">
      {data.sessions.map((session) => (
        <AccountRow key={session.id}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-medium text-[var(--tj-ink-1)]">
              {session.description || t("sessions.unknown")}
            </span>
            {session.current && <Badge tone="ok">{t("sessions.current")}</Badge>}
          </div>
          <p className="mt-0.5 text-[12.5px] text-[var(--tj-ink-3)]">
            {[session.ip, session.lastActive && t("sessions.lastActive", { date: format(session.lastActive) })]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </AccountRow>
      ))}
      <div className="mt-4 flex flex-col gap-2 border-t border-[var(--tj-hairline)] pt-4 sm:flex-row">
        {others > 0 && (
          <TjButton
            variant="outline"
            block={false}
            className="w-full sm:w-auto"
            onClick={signOutOthers}
            disabled={busy}
            data-testid="sign-out-others"
          >
            {t("sessions.signOutOthers")}
          </TjButton>
        )}
        <TjButton
          variant="danger"
          block={false}
          className="w-full sm:w-auto"
          onClick={signOut}
          disabled={busy}
          data-testid="sign-out"
        >
          {t("sessions.signOut")}
        </TjButton>
      </div>
      {feedback.node}
    </AccountCard>
  );
}

// ---- page ----------------------------------------------------------------------------------

const TABS = ["profile", "security", "devices"] as const;
type Tab = (typeof TABS)[number];

function TabIcon({ tab }: { tab: Tab }) {
  const paths: Record<Tab, ReactNode> = {
    profile: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
      </>
    ),
    security: (
      <>
        <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />
        <path d="M9 12l2 2 4-4" />
      </>
    ),
    devices: (
      <>
        <rect x="3" y="4" width="14" height="10" rx="1.5" />
        <path d="M7 18h6" />
        <rect x="16" y="9" width="5" height="11" rx="1.2" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-[22px] shrink-0 lg:size-5"
      aria-hidden="true"
    >
      {paths[tab]}
    </svg>
  );
}

const TAB_KEY = "tj-account-tab";

function isTab(value: string | null | undefined): value is Tab {
  return TABS.includes(value as Tab);
}

/**
 * The open tab, kept in the address (?tab=…) and in sessionStorage: Next.js puts its own URL back
 * after a server action, so a later reload finds the tab in sessionStorage instead.
 */
function useTab(): [Tab, (tab: Tab) => void] {
  const fromUrl = useSearchParams().get("tab");
  const [tab, setTab] = useState<Tab>(isTab(fromUrl) ? fromUrl : "profile");
  useEffect(() => {
    if (isTab(fromUrl)) {
      return;
    }
    try {
      const saved = window.sessionStorage.getItem(TAB_KEY);
      if (isTab(saved)) {
        setTab(saved);
      }
    } catch {
      // storage blocked: start on the first tab
    }
  }, [fromUrl]);
  const select = useCallback((next: Tab) => {
    setTab(next);
    try {
      window.sessionStorage.setItem(TAB_KEY, next);
    } catch {
      // storage blocked: the address still carries the tab
    }
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url);
    window.scrollTo({ top: 0 });
  }, []);
  return [tab, select];
}

function initials(name: string): string {
  const parts = name.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function UserCard({ name, email }: { name: string; email: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--tj-brand)] text-[15px] font-semibold text-white lg:size-12"
      >
        {initials(name)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[16px] font-semibold text-[var(--tj-ink-1)]">{name}</p>
        {email && <p className="truncate text-[13px] text-[var(--tj-ink-3)]">{email}</p>}
      </div>
    </div>
  );
}

function TabList({
  tab,
  onSelect,
  attention,
  variant,
}: {
  tab: Tab;
  onSelect: (tab: Tab) => void;
  attention: Partial<Record<Tab, boolean>>;
  variant: "side" | "bottom";
}) {
  const t = useTranslations("tijorat.account");
  function onKeyDown(event: React.KeyboardEvent) {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (!step) {
      return;
    }
    event.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length];
    onSelect(next);
    document.getElementById(`account-tab-${variant}-${next}`)?.focus();
  }
  return (
    <div
      role="tablist"
      aria-label={t("tabs.label")}
      aria-orientation={variant === "side" ? "vertical" : "horizontal"}
      onKeyDown={onKeyDown}
      className={
        variant === "side"
          ? "flex flex-col gap-1"
          : "grid grid-cols-3 gap-1 px-2 pt-1.5 pb-[max(6px,env(safe-area-inset-bottom))]"
      }
    >
      {TABS.map((id) => {
        const selected = id === tab;
        return (
          <button
            key={id}
            id={`account-tab-${variant}-${id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`account-panel-${id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(id)}
            data-testid={`tab-${id}${variant === "bottom" ? "-mobile" : ""}`}
            className={
              variant === "side"
                ? `flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[14.5px] font-medium transition-colors ${
                    selected
                      ? "bg-[var(--tj-mist)] text-[var(--tj-brand-ink)]"
                      : "text-[var(--tj-ink-2)] hover:bg-[var(--tj-surface)] hover:text-[var(--tj-ink-1)]"
                  }`
                : `relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl text-[11.5px] font-semibold transition-colors ${
                    selected ? "text-[var(--tj-brand-ink)]" : "text-[var(--tj-ink-3)]"
                  }`
            }
          >
            <span className="relative">
              <TabIcon tab={id} />
              {attention[id] && (
                <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-[#e8a33d] ring-2 ring-[var(--tj-surface)]" />
              )}
            </span>
            <span className={variant === "side" ? "flex-1" : ""}>{t(`tabs.${id}`)}</span>
            {variant === "bottom" && selected && (
              <span className="absolute top-0 h-[3px] w-8 rounded-full bg-[var(--tj-brand)]" aria-hidden="true" />
            )}
          </button>
        );
      })}
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--tj-hairline)] bg-[var(--tj-surface)]/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-4 sm:h-16 sm:gap-3">
        <TijoratWordmark height={24} className="shrink-0 text-[#1d9f6e] dark:text-white" />
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <LanguagePills />
          <div className="hidden sm:block">
            <ThemeSwitch />
          </div>
        </div>
      </div>
    </header>
  );
}

function Panel({ id, tab, children }: { id: Tab; tab: Tab; children: ReactNode }) {
  // Every panel stays mounted, so a half-done step (a code, a QR) survives a switch of tabs.
  return (
    <section
      id={`account-panel-${id}`}
      role="tabpanel"
      aria-labelledby={`account-tab-side-${id}`}
      hidden={id !== tab}
      className="flex flex-col gap-4"
      data-testid={`panel-${id}`}
    >
      {children}
    </section>
  );
}

/** Tijorat+ "My account": profile, sign-in security and devices on tabs, in the brand layout. */
export function AccountPage({ data }: { data: AccountData }) {
  const t = useTranslations("tijorat.account");
  const { run, dialog } = useRunner(t, data);
  const [tab, setTab] = useTab();
  const name = data.user.displayName || `${data.user.givenName} ${data.user.familyName}`.trim() || data.user.loginName;
  const secondFactor = data.totp || data.otpEmail || data.otpSms || data.u2f.length > 0 || data.passkeys.length > 0;
  const attention = { profile: !data.user.emailVerified, security: !secondFactor };

  return (
    <RunnerContext.Provider value={run}>
      <div className="min-h-dvh bg-[var(--tj-bg)]">
        <Header />
        <div className="mx-auto flex max-w-5xl gap-8 px-4 pt-5 pb-28 sm:pt-8 lg:pb-12">
          <aside className="hidden w-60 shrink-0 lg:block">
            <div className="sticky top-24 flex flex-col gap-6">
              <UserCard name={name} email={data.user.email} />
              <TabList tab={tab} onSelect={setTab} attention={attention} variant="side" />
            </div>
          </aside>
          <main className="min-w-0 flex-1 lg:max-w-2xl">
            <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-[var(--tj-hairline)] bg-[var(--tj-surface)] p-4 lg:hidden">
              <UserCard name={name} email={data.user.email} />
              <div className="shrink-0 sm:hidden">
                <ThemeSwitch />
              </div>
            </div>
            <Panel id="profile" tab={tab}>
              <ProfileSection data={data} />
              <ContactSection data={data} />
            </Panel>
            <Panel id="security" tab={tab}>
              <PasswordSection data={data} />
              <PasskeysSection data={data} />
              <TwoFactorSection data={data} />
            </Panel>
            <Panel id="devices" tab={tab}>
              <SessionsSection data={data} />
            </Panel>
          </main>
        </div>
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--tj-hairline)] bg-[var(--tj-surface)]/95 backdrop-blur lg:hidden">
          <TabList tab={tab} onSelect={setTab} attention={attention} variant="bottom" />
        </nav>
      </div>
      {dialog}
    </RunnerContext.Provider>
  );
}

/** Browsers without Tajik date data fall back to English; Russian is the closer reading for tg users. */
function dateLocale(locale: string): string {
  return Intl.DateTimeFormat.supportedLocalesOf([locale]).length ? locale : "ru";
}
