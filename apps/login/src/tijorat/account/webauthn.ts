import { coerceToArrayBuffer, coerceToBase64Url } from "@/helpers/base64";
import { JsonObject } from "@zitadel/client";

type Options = { publicKey?: any };

/** Runs navigator.credentials.create with ZITADEL's options and returns the attestation as JSON. */
export async function createCredential(options: JsonObject): Promise<JsonObject> {
  const publicKey = { ...((options as Options).publicKey ?? {}) };
  publicKey.challenge = coerceToArrayBuffer(publicKey.challenge, "challenge");
  publicKey.user = { ...publicKey.user, id: coerceToArrayBuffer(publicKey.user.id, "user.id") };
  publicKey.excludeCredentials = (publicKey.excludeCredentials ?? []).map((cred: any) => ({
    ...cred,
    id: coerceToArrayBuffer(cred.id, "excludeCredentials.id"),
  }));
  const credential = (await navigator.credentials.create({ publicKey })) as any;
  if (!credential?.response?.attestationObject) {
    throw new Error("no credential");
  }
  return {
    id: credential.id,
    rawId: coerceToBase64Url(credential.rawId, "rawId"),
    type: credential.type,
    response: {
      attestationObject: coerceToBase64Url(credential.response.attestationObject, "attestationObject"),
      clientDataJSON: coerceToBase64Url(credential.response.clientDataJSON, "clientDataJSON"),
    },
  };
}

/** Runs navigator.credentials.get with ZITADEL's challenge and returns the assertion as JSON. */
export async function getAssertion(options: JsonObject): Promise<JsonObject> {
  const publicKey = { ...((options as Options).publicKey ?? {}) };
  publicKey.challenge = coerceToArrayBuffer(publicKey.challenge, "challenge");
  publicKey.allowCredentials = (publicKey.allowCredentials ?? []).map((cred: any) => ({
    ...cred,
    id: coerceToArrayBuffer(cred.id, "allowCredentials.id"),
  }));
  const assertion = (await navigator.credentials.get({ publicKey })) as any;
  if (!assertion?.response?.signature) {
    throw new Error("no assertion");
  }
  return {
    id: assertion.id,
    rawId: coerceToBase64Url(new Uint8Array(assertion.rawId), "rawId"),
    type: assertion.type,
    response: {
      authenticatorData: coerceToBase64Url(new Uint8Array(assertion.response.authenticatorData), "authenticatorData"),
      clientDataJSON: coerceToBase64Url(new Uint8Array(assertion.response.clientDataJSON), "clientDataJSON"),
      signature: coerceToBase64Url(new Uint8Array(assertion.response.signature), "signature"),
      userHandle: coerceToBase64Url(new Uint8Array(assertion.response.userHandle ?? []), "userHandle"),
    },
  };
}
