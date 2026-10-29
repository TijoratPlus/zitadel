import { clsx } from "clsx";
import { forwardRef, InputHTMLAttributes, ReactNode, useId } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  /** Rendered at the right end of the label row, e.g. a "Forgot password?" link. */
  labelAside?: ReactNode;
  error?: string;
};

// Label + Input from tajerp_ui (Label.tsx, Input.tsx); the frame itself is styled in tijorat.scss.
export const TjField = forwardRef<HTMLInputElement, Props>(({ label, labelAside, error, id, className, ...props }, ref) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className={clsx("grid gap-1.5", className)}>
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="tj-label">
          {label}
        </label>
        {labelAside}
      </div>
      <input ref={ref} id={inputId} aria-invalid={error ? true : undefined} className="w-full" {...props} />
      {error && <p className="text-[12.5px] font-medium text-[var(--tj-error-ink)]">{error}</p>}
    </div>
  );
});
TjField.displayName = "TjField";
