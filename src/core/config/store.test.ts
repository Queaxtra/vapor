import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConfigStore } from "./store.ts";
import { createDefaultVaporPaths } from "./paths.ts";

function createSecretManager() {
  let token = "";

  return {
    async getPreferredProvider() {
      return "local" as const;
    },
    async saveToken(nextToken: string) {
      token = nextToken;
    },
    async readToken() {
      return token;
    },
    async clear() {
      token = "";
    },
  };
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("ConfigStore", () => {
  test("initializes and loads configuration", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "vapor-config-"));
    const secretManager = createSecretManager();

    temporaryDirectories.push(rootDir);

    const store = new ConfigStore(createDefaultVaporPaths(rootDir), secretManager as never);

    await store.initialize({
      token: "cf-token",
      domains: [
        {
          domain: "example.com",
          zoneId: "zone-1",
          accountId: "account-1",
          defaultDestination: "dest@example.net",
        },
      ],
    });

    const loaded = await store.load();

    expect(loaded.token).toBe("cf-token");
    expect(loaded.config.domains).toHaveLength(1);
    expect(loaded.config.secretStorage).toBe("local");
  });

  test("removes configured domains", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "vapor-config-"));
    const secretManager = createSecretManager();

    temporaryDirectories.push(rootDir);

    const store = new ConfigStore(createDefaultVaporPaths(rootDir), secretManager as never);

    await store.initialize({
      token: "cf-token",
      domains: [
        {
          domain: "example.com",
          zoneId: "zone-1",
          accountId: "account-1",
          defaultDestination: "dest@example.net",
        },
      ],
    });

    expect(await store.removeDomain("example.com")).toBe(true);
    expect((await store.readConfig())?.domains).toHaveLength(0);
  });
});
