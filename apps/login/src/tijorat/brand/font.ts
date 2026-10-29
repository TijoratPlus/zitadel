import { Inter } from "next/font/google";
import { isTijoratBrand } from "../config";

// Same family as tajerp_ui; cyrillic-ext carries the Tajik letters (ҳ, ҷ, қ, ғ, ӯ, ӣ).
const inter = Inter({
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  weight: ["400", "500", "600", "700"],
});

/** Font class for <html>: Inter for Tijorat+, otherwise the upstream font class passed in. */
export function tijoratFontClass(upstreamClass: string): string {
  return isTijoratBrand() ? inter.className : upstreamClass;
}
