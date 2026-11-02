import { clsx } from "clsx";
import { ButtonHTMLAttributes, forwardRef } from "react";

// Button from tajerp_ui (src/components/Button.tsx), size "lg": 40px, rounded-xl, bold.
const VARIANTS = {
  solid:
    "bg-[var(--tj-brand-solid)] text-white shadow-[var(--tj-shadow-brand)] hover:bg-[var(--tj-brand-solid-hover)] disabled:shadow-none",
  outline:
    "border-[1.5px] border-[color-mix(in_srgb,var(--tj-brand)_40%,transparent)] bg-transparent text-[var(--tj-brand-ink)] hover:bg-[var(--tj-mist)]",
  ghost: "bg-transparent text-[var(--tj-ink-2)] hover:bg-[var(--tj-mist)] hover:text-[var(--tj-brand-ink)]",
} as const;

export type TjButtonVariant = keyof typeof VARIANTS;

export const TjButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: TjButtonVariant; block?: boolean }
>(({ variant = "solid", block = true, className, ...props }, ref) => (
  <button
    ref={ref}
    className={clsx(
      "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-[15px] font-bold whitespace-nowrap",
      "transition-[transform,background,box-shadow,color] duration-150 motion-safe:active:scale-[0.97]",
      "disabled:cursor-not-allowed disabled:opacity-60",
      VARIANTS[variant],
      block && "w-full",
      className,
    )}
    {...props}
  />
));
TjButton.displayName = "TjButton";

/** Text link styled like tajerp_ui Link variant "default". */
export function TjLinkButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={clsx(
        "text-[var(--tj-brand-ink)] underline-offset-4 hover:text-[var(--tj-brand)] hover:underline disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
