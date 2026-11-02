import { LanguageProvider } from "@/components/language-provider";
import { ThemeProvider } from "@/components/theme-provider";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ReactNode, Suspense } from "react";
import { INTER_CLASS } from "./font";
import "./tijorat.scss";

/**
 * Root layout for the Tijorat+ brand (hooked in src/app/(login)/layout.tsx). Mirrors the upstream
 * providers but drops the centred container and footer: pages fill the viewport, and the
 * language and theme switches live in TijoratTheme.
 */
export function TijoratRootLayout({ children }: { children: ReactNode }) {
  return (
    <html className={INTER_CLASS} suppressHydrationWarning>
      <body className="tj-root min-h-screen">
        <ThemeProvider>
          <Tooltip.Provider>
            <Suspense fallback={<div className="min-h-screen" />}>
              <LanguageProvider>{children}</LanguageProvider>
            </Suspense>
          </Tooltip.Provider>
        </ThemeProvider>
      </body>
    </html>
  );
}
