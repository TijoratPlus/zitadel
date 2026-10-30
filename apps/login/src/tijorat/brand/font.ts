import { Inter } from "next/font/google";

// Same family as tajerp_ui; cyrillic-ext carries the Tajik letters (ҳ, ҷ, қ, ғ, ӯ, ӣ).
const inter = Inter({
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"],
  weight: ["400", "500", "600", "700"],
});

export const INTER_CLASS = inter.className;
