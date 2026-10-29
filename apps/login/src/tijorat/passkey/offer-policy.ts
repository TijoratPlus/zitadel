import { PasskeysType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { AuthenticationMethodType } from "@zitadel/proto/zitadel/user/v2/user_service_pb";

/** Remembered per browser: users who answered "Not now" are not asked again for this long. */
export const PASSKEY_OFFER_SNOOZE_DAYS = 30;
/** Bounds the cookie when several people share one device (a till, for instance). */
export const PASSKEY_OFFER_SNOOZE_MAX_USERS = 10;

export function shouldOfferPasskey({
  enabled,
  passkeysType,
  authMethods,
  userId,
  snoozedUserIds,
}: {
  enabled: boolean;
  passkeysType?: PasskeysType;
  authMethods: AuthenticationMethodType[];
  userId?: string;
  snoozedUserIds: string[];
}): boolean {
  if (!enabled || !userId) {
    return false;
  }
  if (passkeysType === PasskeysType.NOT_ALLOWED) {
    return false;
  }
  if (authMethods.includes(AuthenticationMethodType.PASSKEY)) {
    return false;
  }
  return !snoozedUserIds.includes(userId);
}

export function parseSnoozedUserIds(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^[\w-]+$/.test(id));
}

/** Puts `userId` first and drops the oldest entries beyond the limit. */
export function addSnoozedUserId(current: string[], userId: string): string[] {
  return [userId, ...current.filter((id) => id !== userId)].slice(0, PASSKEY_OFFER_SNOOZE_MAX_USERS);
}
