import { afterEach, describe, expect, test } from "bun:test";
import { VAPOR_TOKEN_ENV_KEY, SecretManager } from "./secret.ts";

const originalToken = process.env[VAPOR_TOKEN_ENV_KEY];

afterEach(() => {
  if (originalToken) {
    process.env[VAPOR_TOKEN_ENV_KEY] = originalToken;
    return;
  }

  delete process.env[VAPOR_TOKEN_ENV_KEY];
});

describe("SecretManager", () => {
  test("falls back to env provider when keychain is unavailable", async () => {
    const keychain = {
      async isSupported() {
        return false;
      },
    };
    const manager = new SecretManager(undefined, keychain as never);

    await expect(manager.getPreferredProvider()).resolves.toBe("env");
  });

  test("reads token from environment for env provider", async () => {
    process.env[VAPOR_TOKEN_ENV_KEY] = "env-token";
    const keychain = {
      async isSupported() {
        return false;
      },
    };
    const manager = new SecretManager(undefined, keychain as never);

    await expect(manager.readToken("env")).resolves.toBe("env-token");
  });
});
