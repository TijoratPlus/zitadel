import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, it } from "vitest";
import { accountErrorKey } from "./errors";

describe("accountErrorKey", () => {
  it("maps ZITADEL codes to messages without exposing the raw error", () => {
    expect(accountErrorKey(new ConnectError("x", Code.PermissionDenied))).toBe("sessionExpired");
    expect(accountErrorKey(new ConnectError("x", Code.AlreadyExists))).toBe("alreadyExists");
    expect(accountErrorKey(new ConnectError("x", Code.FailedPrecondition))).toBe("notAvailable");
    expect(accountErrorKey(new ConnectError("x", Code.InvalidArgument), "code")).toBe("invalidCode");
    expect(accountErrorKey(new ConnectError("x", Code.InvalidArgument), "password")).toBe("wrongPassword");
    expect(accountErrorKey(new ConnectError("x", Code.InvalidArgument))).toBe("invalidInput");
    expect(accountErrorKey(new Error("boom"))).toBe("generic");
  });
});

describe("isMfaRequired", () => {
  it("recognises ZITADEL's demand for a second factor on the session", () => {
    const mfa = new ConnectError("mfa required (AUTHZ-Kl3p0)", Code.PermissionDenied);
    expect(accountErrorKey(mfa)).toBe("mfaRequired");
    expect(accountErrorKey(new ConnectError("no permission", Code.PermissionDenied))).toBe("sessionExpired");
  });
});
