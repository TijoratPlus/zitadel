import deepmerge from "deepmerge";
import { isTijoratBrand } from "../config";
import en from "./en.json";
import ru from "./ru.json";
import tg from "./tg.json";
import uz from "./uz.json";

type Messages = Record<string, unknown>;

// en and ru reword part of the upstream texts. tg and uz are full translations: upstream and
// ZITADEL core have no such languages, so these files are the only source of their texts.
const OVERLAYS: Record<string, Messages & { tijorat: Messages }> = { en, ru, tg, uz };
const FORK_ONLY_LOCALES = new Set(["tg", "uz"]);

function isObject(value: unknown): value is Messages {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Drops overlay entries the instance admin customised. The hosted-login translation API returns
 * ZITADEL's full default text set, not only customisations, so a custom value that equals the
 * bundled stock text is a default and the overlay may replace it; any other value was set on
 * purpose and wins.
 */
function withoutCustomised(overlay: Messages, stock: unknown, custom: unknown): Messages {
  const result: Messages = {};
  for (const [key, value] of Object.entries(overlay)) {
    const stockValue = isObject(stock) ? stock[key] : undefined;
    const customValue = isObject(custom) ? custom[key] : undefined;
    if (isObject(value)) {
      const nested = withoutCustomised(value, stockValue, customValue);
      if (Object.keys(nested).length) {
        result[key] = nested;
      }
    } else if (customValue === undefined || customValue === stockValue) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Messages to merge last, over the bundled locale (`stock`) and the API texts (`custom`).
 * - The `tijorat` namespace (fork pages and components) is always present and falls back to
 *   English, so its keys never go missing whatever the locale or brand switch.
 * - With the Tijorat+ brand on, en/ru reword upstream keys unless the admin customised them,
 *   and tg/uz replace everything: for them the API only returns the instance default language.
 */
export function getTijoratMessages(locale: string, stock: Messages = {}, custom: Messages = {}): Messages {
  const overlay = OVERLAYS[locale];
  const tijorat = deepmerge(en.tijorat, overlay?.tijorat ?? {});
  if (!isTijoratBrand() || !overlay) {
    return { tijorat };
  }
  const { tijorat: _ownNamespace, ...reworded } = overlay;
  if (FORK_ONLY_LOCALES.has(locale)) {
    return { ...reworded, tijorat };
  }
  return { ...withoutCustomised(reworded, stock, custom), tijorat };
}
