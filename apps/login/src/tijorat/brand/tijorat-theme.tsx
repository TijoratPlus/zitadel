"use client";

import { Card } from "@/components/card";
import { Logo } from "@/components/logo";
import { ThemeWrapper } from "@/components/theme-wrapper";
import { Translated } from "@/components/translated";
import { BrandingSettings } from "@zitadel/proto/zitadel/settings/v2/branding_settings_pb";
import { Children, ReactNode } from "react";
import "./tijorat.scss";
import { TijoratWordmark } from "./wordmark";

/**
 * Logo for a light or dark surface. Logos uploaded in the branding settings win; otherwise the
 * built-in Tijorat+ wordmark is used. `onDark` picks the variant readable on the forest panel.
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

/**
 * Tijorat+ replacement for the body of upstream DynamicTheme (hooked in
 * src/components/dynamic-theme.tsx). Children follow the same contract: the first child is the
 * title/description, the second the form; a single child is treated as the form.
 */
export function TijoratTheme({
  branding,
  isSideBySide,
  children,
}: {
  branding?: BrandingSettings;
  isSideBySide: boolean;
  children: ReactNode;
}) {
  const childArray = Children.toArray(children);
  const hasTitleAndForm = childArray.length > 1;
  const title = hasTitleAndForm ? childArray[0] : null;
  const form = hasTitleAndForm ? childArray.slice(1) : childArray;

  if (isSideBySide) {
    return (
      <ThemeWrapper branding={branding}>
        <div className="tj-auth relative mx-auto w-full max-w-[1000px] px-8 py-4">
          <Card padding="p-0" className="overflow-hidden">
            <div className="flex min-h-[520px]">
              <aside className="tj-brand-panel relative flex w-5/12 flex-col justify-between p-10 text-white">
                <TijoratLogo branding={branding} onDark height={36} />
                <div className="space-y-3">
                  <p className="text-2xl leading-snug font-semibold">
                    <Translated i18nKey="brand.tagline" namespace="tijorat" />
                  </p>
                  <p className="text-sm text-[#a8deca]">
                    <Translated i18nKey="brand.subtitle" namespace="tijorat" />
                  </p>
                </div>
              </aside>
              <main className="flex w-7/12 items-center justify-center p-10">
                <div className="w-full max-w-[400px] space-y-6">
                  {title && <div className="tj-auth-title flex flex-col space-y-2 text-left">{title}</div>}
                  <div>{form}</div>
                </div>
              </main>
            </div>
          </Card>
        </div>
      </ThemeWrapper>
    );
  }

  return (
    <ThemeWrapper branding={branding}>
      <div className="tj-auth relative mx-auto w-full max-w-[440px] px-4 py-4">
        <div className="mb-6 flex justify-center">
          <TijoratLogo branding={branding} height={32} />
        </div>
        <Card>
          <div className="space-y-6">
            {title && <div className="tj-auth-title flex flex-col items-center space-y-2 text-center">{title}</div>}
            <div className="w-full">{form}</div>
          </div>
        </Card>
      </div>
    </ThemeWrapper>
  );
}
