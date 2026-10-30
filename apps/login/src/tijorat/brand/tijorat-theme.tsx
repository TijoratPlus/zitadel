"use client";

import { Logo } from "@/components/logo";
import ThemeSwitch from "@/components/theme-switch";
import { ThemeWrapper } from "@/components/theme-wrapper";
import { Translated } from "@/components/translated";
import { BrandingSettings } from "@zitadel/proto/zitadel/settings/v2/branding_settings_pb";
import { Children, ReactNode } from "react";
import { LanguagePills } from "../ui/language-pills";
import "./tijorat.scss";
import { TijoratWordmark } from "./wordmark";

/**
 * Logo for a light or dark surface. Logos uploaded in the branding settings win; otherwise the
 * built-in Tijorat+ wordmark is used. `onDark` picks the variant readable on the brand panel.
 */
function TijoratLogo({ branding, onDark, height }: { branding?: BrandingSettings; onDark?: boolean; height: number }) {
  const width = Math.round(height * (396 / 75));
  const light = branding?.lightTheme?.logoUrl;
  const dark = branding?.darkTheme?.logoUrl;

  if (onDark) {
    return dark ? (
      <img src={dark} alt="Tijorat+" height={height} width={width} />
    ) : (
      <TijoratWordmark height={height} className="text-white" />
    );
  }
  if (light || dark) {
    return <Logo lightSrc={light} darkSrc={dark} height={height} width={width} />;
  }
  return <TijoratWordmark height={height} className="text-[#1d9f6e] dark:text-white" />;
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="size-3" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const BRAND_POINTS = ["brand.points.one", "brand.points.two", "brand.points.three"];

/** Left half on large screens, as the brand panel of tajerp_ui stories/examples/Login.stories.tsx. */
function BrandPanel({ branding }: { branding?: BrandingSettings }) {
  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-[var(--tj-brand-deep)] p-12 text-white lg:flex">
      <TijoratLogo branding={branding} onDark height={36} />
      <div>
        <h2 className="max-w-sm text-[30px] leading-tight font-bold">
          <Translated i18nKey="brand.tagline" namespace="tijorat" />
        </h2>
        <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/70">
          <Translated i18nKey="brand.subtitle" namespace="tijorat" />
        </p>
        <ul className="mt-8 flex flex-col gap-3">
          {BRAND_POINTS.map((key) => (
            <li key={key} className="flex items-center gap-2.5 text-[14px] text-white/85">
              <span className="grid size-5 place-items-center rounded-full bg-white/15">
                <CheckIcon />
              </span>
              <Translated i18nKey={key} namespace="tijorat" />
            </li>
          ))}
        </ul>
      </div>
      <p className="text-[12px] text-white/70">© {new Date().getFullYear()} Tijorat+</p>
    </aside>
  );
}

/**
 * Tijorat+ replacement for the body of upstream DynamicTheme (hooked in
 * src/components/dynamic-theme.tsx): a full-screen split layout without a card. Children follow
 * the upstream contract: the first child is the title block, the rest is the form; a single
 * child is treated as the form.
 */
export function TijoratTheme({
  branding,
  children,
}: {
  branding?: BrandingSettings;
  /** Kept for the DynamicTheme hook; the split now follows the lg breakpoint in CSS. */
  isSideBySide?: boolean;
  children: ReactNode;
}) {
  const childArray = Children.toArray(children);
  const hasTitleAndForm = childArray.length > 1;
  const title = hasTitleAndForm ? childArray[0] : null;
  const form = hasTitleAndForm ? childArray.slice(1) : childArray;

  return (
    <ThemeWrapper branding={branding}>
      <div className="tj-auth grid min-h-screen lg:grid-cols-2">
        <BrandPanel branding={branding} />
        <div className="flex min-h-screen flex-col">
          <header className="flex items-center justify-between gap-4 px-6 pt-6">
            <div className="lg:invisible">
              <TijoratLogo branding={branding} height={26} />
            </div>
            <LanguagePills />
          </header>
          <main className="flex flex-1 justify-center px-6 py-10 lg:items-center">
            <div className="w-full max-w-sm">
              {title && <div className="tj-auth-title mb-8 flex flex-col gap-1">{title}</div>}
              <div className="w-full">{form}</div>
            </div>
          </main>
          <footer className="flex justify-end px-6 pb-6">
            <ThemeSwitch />
          </footer>
        </div>
      </div>
    </ThemeWrapper>
  );
}
