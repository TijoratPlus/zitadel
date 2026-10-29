import { BrandingSettings } from "@zitadel/proto/zitadel/settings/v2/branding_settings_pb";
import { isTijoratBrand } from "../config";

// Ported from tajerp_ui/styles/tokens.css. Primary is the brand green darkened past
// --ui-brand-solid (#18865c): the raw #1D9F6E gives white text only 3.4:1, and on #18865c the
// login's contrast picker (helpers/colors.ts getContrast) still chooses black text. On #167d55
// white text reads at 5.1:1 and wins.
export const TIJORAT_COLORS = {
  lightTheme: {
    primaryColor: "#167d55",
    backgroundColor: "#f7f9f8",
    warnColor: "#c43422",
    fontColor: "#0c1e16",
  },
  darkTheme: {
    primaryColor: "#167d55",
    backgroundColor: "#132621",
    warnColor: "#f0997a",
    fontColor: "#f1f6f4",
  },
} as const;

type ThemeColors = { primaryColor: string; backgroundColor: string; warnColor: string; fontColor: string };

// The colours a fresh ZITADEL instance ships with (cmd/defaults.yaml, LabelPolicy). The API always
// returns them, so "not customised" has to be detected by value, not by an empty field.
const ZITADEL_DEFAULTS = new Set(["#5469d4", "#fafafa", "#cd3d56", "#000000", "#2073c4", "#111827", "#ff3b5b", "#ffffff"]);

function pick(value: string | undefined, fallback: string): string {
  if (!value || ZITADEL_DEFAULTS.has(value.toLowerCase())) {
    return fallback;
  }
  return value;
}

function withFallback(theme: Partial<ThemeColors> | undefined, fallback: ThemeColors): ThemeColors {
  return {
    primaryColor: pick(theme?.primaryColor, fallback.primaryColor),
    backgroundColor: pick(theme?.backgroundColor, fallback.backgroundColor),
    warnColor: pick(theme?.warnColor, fallback.warnColor),
    fontColor: pick(theme?.fontColor, fallback.fontColor),
  };
}

/**
 * Replaces unset or stock-ZITADEL branding colours with the Tijorat+ palette. Colours an admin
 * set deliberately in the branding settings are kept. Returns the input unchanged when the
 * Tijorat+ brand is off.
 */
export function withTijoratColors(policy?: BrandingSettings): BrandingSettings | undefined {
  if (!isTijoratBrand()) {
    return policy;
  }
  return {
    ...policy,
    lightTheme: { ...policy?.lightTheme, ...withFallback(policy?.lightTheme, TIJORAT_COLORS.lightTheme) },
    darkTheme: { ...policy?.darkTheme, ...withFallback(policy?.darkTheme, TIJORAT_COLORS.darkTheme) },
  } as BrandingSettings;
}
