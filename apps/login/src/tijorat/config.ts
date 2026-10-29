// Tijorat+ fork switches. Everything under src/tijorat is inert unless these are set,
// so an unconfigured build behaves exactly like upstream ZITADEL (see TIJORAT_FORK.md).

/**
 * Tijorat+ look and copy: palette fallbacks, Inter, branded layout and the locale overlay.
 * Read on the client as well, so it is a NEXT_PUBLIC_ variable and inlined at build time.
 */
export function isTijoratBrand(): boolean {
  return process.env.NEXT_PUBLIC_TIJORAT_BRAND === "true";
}

/** Offer passkey enrollment right after a successful password login (server only). */
export function isPasskeyOfferEnabled(): boolean {
  return process.env.TIJORAT_PASSKEY_OFFER === "true";
}
