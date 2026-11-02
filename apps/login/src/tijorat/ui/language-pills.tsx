"use client";

import { setLanguageCookie } from "@/lib/cookies";
import { clsx } from "clsx";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { TIJORAT_LANG_LABELS, TIJORAT_LANGS } from "../i18n";

/** RU / TJ / UZ / EN switcher, styled like tajerp_ui SegmentedControl size "sm". */
export function LanguagePills() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="radiogroup"
      aria-label="Language"
      className="inline-flex gap-0.5 rounded-full border border-[var(--tj-hairline)] bg-[var(--tj-surface)] p-0.5"
    >
      {TIJORAT_LANGS.map((lang) => {
        const active = lang.code === locale;
        return (
          <button
            key={lang.code}
            type="button"
            role="radio"
            aria-checked={active}
            title={lang.name}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await setLanguageCookie(lang.code);
                router.refresh();
              })
            }
            className={clsx(
              "min-h-6 rounded-full px-2.5 py-0.5 text-[11px] font-bold transition-colors",
              active
                ? "bg-[var(--tj-brand-solid)] text-white shadow-sm"
                : "text-[var(--tj-ink-3)] hover:text-[var(--tj-ink-1)]",
            )}
          >
            {TIJORAT_LANG_LABELS[lang.code] ?? lang.code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
