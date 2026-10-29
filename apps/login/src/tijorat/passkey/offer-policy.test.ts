import { PasskeysType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { AuthenticationMethodType } from "@zitadel/proto/zitadel/user/v2/user_service_pb";
import { describe, expect, test } from "vitest";
import { addSnoozedUserId, parseSnoozedUserIds, PASSKEY_OFFER_SNOOZE_MAX_USERS, shouldOfferPasskey } from "./offer-policy";

const base = {
  enabled: true,
  passkeysType: PasskeysType.ALLOWED,
  authMethods: [AuthenticationMethodType.PASSWORD],
  userId: "user-1",
  snoozedUserIds: [],
};

describe("shouldOfferPasskey", () => {
  test("offers to a password-only user", () => {
    expect(shouldOfferPasskey(base)).toBe(true);
  });

  test("not when the feature is off", () => {
    expect(shouldOfferPasskey({ ...base, enabled: false })).toBe(false);
  });

  test("not when passkeys are not allowed by the login policy", () => {
    expect(shouldOfferPasskey({ ...base, passkeysType: PasskeysType.NOT_ALLOWED })).toBe(false);
  });

  test("not when the user already has a passkey", () => {
    expect(
      shouldOfferPasskey({
        ...base,
        authMethods: [AuthenticationMethodType.PASSWORD, AuthenticationMethodType.PASSKEY],
      }),
    ).toBe(false);
  });

  test("not when the user declined recently on this device", () => {
    expect(shouldOfferPasskey({ ...base, snoozedUserIds: ["other", "user-1"] })).toBe(false);
  });

  test("not without a user", () => {
    expect(shouldOfferPasskey({ ...base, userId: undefined })).toBe(false);
  });
});

describe("snooze cookie values", () => {
  test("parses ids and drops anything malformed", () => {
    expect(parseSnoozedUserIds("a1, b-2,,<script>,c_3")).toEqual(["a1", "b-2", "c_3"]);
    expect(parseSnoozedUserIds(undefined)).toEqual([]);
  });

  test("adds the newest id first without duplicates", () => {
    expect(addSnoozedUserId(["a", "b"], "b")).toEqual(["b", "a"]);
  });

  test("keeps at most the configured number of users", () => {
    const many = Array.from({ length: PASSKEY_OFFER_SNOOZE_MAX_USERS }, (_, i) => `u${i}`);
    const result = addSnoozedUserId(many, "new");
    expect(result).toHaveLength(PASSKEY_OFFER_SNOOZE_MAX_USERS);
    expect(result[0]).toBe("new");
    expect(result).not.toContain(`u${PASSKEY_OFFER_SNOOZE_MAX_USERS - 1}`);
  });
});
