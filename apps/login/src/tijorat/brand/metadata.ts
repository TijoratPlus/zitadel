import type { Metadata } from "next";
import { isTijoratBrand } from "../config";
import { TIJORAT_MARK_DATA_URI } from "./wordmark";

/** Extra root metadata (favicon) for the Tijorat+ brand; empty when the brand is off. */
export function tijoratMetadata(): Metadata {
  if (!isTijoratBrand()) {
    return {};
  }
  return {
    applicationName: "Tijorat+",
    icons: { icon: [{ url: TIJORAT_MARK_DATA_URI, type: "image/svg+xml" }] },
  };
}
