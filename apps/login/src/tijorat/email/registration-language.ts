import { getLocale } from "next-intl/server";
import "server-only";
import { isTijoratBrand } from "../config";

/**
 * The login's current language, stored as the new user's preferred language so their emails come
 * in it (src/tijorat/email). Upstream registers users without one, which leaves every email in
 * the instance default.
 */
export async function tijoratRegistrationLanguage(): Promise<string | undefined> {
  return isTijoratBrand() ? getLocale() : undefined;
}
