"use client";

import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { forwardRef, InputHTMLAttributes, ReactNode, useId, useState } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  /** Rendered at the right end of the label row, e.g. a "Forgot password?" link. */
  labelAside?: ReactNode;
  error?: string;
  /** For password fields: an eye button that shows or hides the typed password. */
  revealable?: boolean;
};

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-[18px]" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
      {crossed && <path d="M4 4l16 16" strokeLinecap="round" />}
    </svg>
  );
}

// Label + Input from tajerp_ui (Label.tsx, Input.tsx); the frame itself is styled in tijorat.scss.
export const TjField = forwardRef<HTMLInputElement, Props>(
  ({ label, labelAside, error, revealable, id, className, type, ...props }, ref) => {
    const t = useTranslations("tijorat.field");
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const [revealed, setRevealed] = useState(false);
    const canReveal = revealable && type === "password";

    return (
      <div className={clsx("grid gap-1.5", className)}>
        <div className="flex items-center justify-between">
          <label htmlFor={inputId} className="tj-label">
            {label}
          </label>
          {labelAside}
        </div>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={canReveal && revealed ? "text" : type}
            aria-invalid={error ? true : undefined}
            className={clsx("w-full", canReveal && "tj-input-revealable")}
            {...props}
          />
          {canReveal && (
            <button
              type="button"
              onClick={() => setRevealed((value) => !value)}
              aria-label={revealed ? t("hidePassword") : t("showPassword")}
              aria-pressed={revealed}
              aria-controls={inputId}
              className="absolute inset-y-0 right-1 my-auto grid size-8 place-items-center rounded-lg text-[var(--tj-ink-3)] hover:text-[var(--tj-ink-1)]"
            >
              <EyeIcon crossed={revealed} />
            </button>
          )}
        </div>
        {error && <p className="text-[12.5px] font-medium text-[var(--tj-error-ink)]">{error}</p>}
      </div>
    );
  },
);
TjField.displayName = "TjField";
