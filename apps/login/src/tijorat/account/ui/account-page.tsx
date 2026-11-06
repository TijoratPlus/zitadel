"use client";

import ThemeSwitch from "@/components/theme-switch";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { createContext, useCallback, useContext, useState } from "react";
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
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
    >
      <div className="w-full max-w-sm rounded-2xl bg-[var(--tj-surface)] p-6 shadow-xl">
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
      <div className="mt-4 flex flex-wrap gap-2">
        {others > 0 && (
          <TjButton variant="outline" block={false} onClick={signOutOthers} disabled={busy} data-testid="sign-out-others">
            {t("sessions.signOutOthers")}
          </TjButton>
        )}
        <TjButton variant="ghost" block={false} onClick={signOut} disabled={busy} data-testid="sign-out">
          {t("sessions.signOut")}
        </TjButton>
      </div>
      {feedback.node}
    </AccountCard>
  );
}

// ---- page ----------------------------------------------------------------------------------

function Header({ name }: { name: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-[var(--tj-hairline)] bg-[var(--tj-surface)]/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4">
        <TijoratWordmark height={26} className="text-[#1d9f6e] dark:text-white" />
        <div className="flex items-center gap-2">
          <span className="hidden max-w-[180px] truncate text-[13px] font-medium text-[var(--tj-ink-2)] sm:inline">
            {name}
          </span>
          <LanguagePills />
          <ThemeSwitch />
        </div>
      </div>
    </header>
  );
}

/** Tijorat+ "My account": profile, contacts, sign-in methods and devices, in the brand layout. */
export function AccountPage({ data }: { data: AccountData }) {
  const t = useTranslations("tijorat.account");
  const { run, dialog } = useRunner(t, data);
  const name = data.user.displayName || `${data.user.givenName} ${data.user.familyName}`.trim() || data.user.loginName;

  return (
    <RunnerContext.Provider value={run}>
      <div className="min-h-screen bg-[var(--tj-bg)]">
        <Header name={name} />
        <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
          <div className="mb-2">
            <h1 className="text-[26px] leading-tight font-bold text-[var(--tj-ink-1)]">{t("title")}</h1>
            <p className="mt-1 text-[14px] text-[var(--tj-ink-3)]">{t("subtitle")}</p>
          </div>
          <ProfileSection data={data} />
          <ContactSection data={data} />
          <PasswordSection data={data} />
          <PasskeysSection data={data} />
          <TwoFactorSection data={data} />
          <SessionsSection data={data} />
        </main>
      </div>
      {dialog}
    </RunnerContext.Provider>
  );
}

/** Browsers without Tajik date data fall back to English; Russian is the closer reading for tg users. */
function dateLocale(locale: string): string {
  return Intl.DateTimeFormat.supportedLocalesOf([locale]).length ? locale : "ru";
}
