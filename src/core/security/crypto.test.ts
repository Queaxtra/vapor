import { describe, expect, test } from "bun:test";
import { decodeKey, decryptSecret, encodeKey, encryptSecret, generateEncryptionKey } from "./crypto.ts";

describe("crypto helpers", () => {
  test("round-trips encrypted secrets", () => {
    const key = generateEncryptionKey();
    const encrypted = encryptSecret("top-secret-token", key);

    expect(decryptSecret(encrypted, key)).toBe("top-secret-token");
  });

  test("encodes and decodes keys", () => {
    const key = generateEncryptionKey();

    expect(decodeKey(encodeKey(key)).equals(key)).toBe(true);
  });
});
