"use client";

import { clsx } from "clsx";
import { ReactNode } from "react";

/** A section card on the account page, styled like tajerp_ui Card. */
export function AccountCard({
  title,
  description,
  aside,
  children,
  testId,
}: {
  title: string;
  description?: string;
  aside?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section
      data-testid={testId}
      className="rounded-2xl border border-[var(--tj-hairline)] bg-[var(--tj-surface)] p-5 sm:p-6"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] leading-6 font-semibold text-[var(--tj-ink-1)]">{title}</h2>
          {description && <p className="mt-1 text-[13.5px] text-[var(--tj-ink-3)]">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A row inside a card: label and value on the left, actions on the right. */
export function AccountRow({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--tj-hairline)] py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">{children}</div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({ tone, children }: { tone: "ok" | "muted" | "warn"; children: ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-semibold",
        tone === "ok" && "bg-[var(--tj-mist)] text-[var(--tj-brand-ink)]",
        tone === "muted" && "bg-[var(--tj-bg)] text-[var(--tj-ink-3)]",
        tone === "warn" && "bg-[#fdecea] text-[var(--tj-error-ink)]",
      )}
    >
      {children}
    </span>
  );
}

export function Notice({ tone, children }: { tone: "ok" | "error"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={clsx(
        "mt-3 rounded-lg px-3 py-2 text-[13px]",
        tone === "ok" ? "bg-[var(--tj-mist)] text-[var(--tj-brand-ink)]" : "bg-[#fdecea] text-[var(--tj-error-ink)]",
      )}
    >
      {children}
    </p>
  );
}
