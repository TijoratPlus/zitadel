import { describe, expect, test } from "vitest";
import { passwordStepFrom } from "./sign-in-step";

describe("passwordStepFrom", () => {
  test("password step with the full login name and context", () => {
    expect(
      passwordStepFrom({ redirect: "/password?loginName=aziz%40tijorat.tj&organization=org-1&requestId=oidc_1" }),
    ).toEqual({ loginName: "aziz@tijorat.tj", organization: "org-1", requestId: "oidc_1" });
  });

  test("passkey user who also has a password signs in with the password", () => {
    expect(passwordStepFrom({ redirect: "/passkey?loginName=aziz&altPassword=true" })).toEqual({
      loginName: "aziz",
      organization: undefined,
      requestId: undefined,
    });
  });

  test.each([
    ["passkey only", { redirect: "/passkey?loginName=aziz&altPassword=false" }],
    ["IdP redirect", { redirect: "https://accounts.google.com/o/oauth2/auth?x=1" }],
    ["invite", { redirect: "/verify?invite=true&loginName=aziz" }],
    ["register", { redirect: "/register?organization=org-1&email=a%40b.tj" }],
    ["error", { error: "User not found in the system" }],
    ["password without login name", { redirect: "/password" }],
    ["nothing", undefined],
  ])("%s is not a password step", (_name, result) => {
    expect(passwordStepFrom(result as any)).toBeNull();
  });
});
