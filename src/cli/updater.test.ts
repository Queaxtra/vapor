import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SelfUpdateService } from "./updater.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createPackageJson(version: string, name = "@queaxtra/vapor"): Promise<URL> {
  const directory = await mkdtemp(join(tmpdir(), "vapor-self-update-"));
  const filePath = join(directory, "package.json");

  temporaryDirectories.push(directory);

  await writeFile(
    filePath,
    JSON.stringify({
      name,
      version,
    }),
  );

  return new URL(`file://${filePath}`);
}

describe("SelfUpdateService", () => {
  test("reads installed version from package metadata", async () => {
    const service = new SelfUpdateService({
      packageJsonUrl: await createPackageJson("1.2.3"),
    });

    await expect(service.readInstalledVersion()).resolves.toBe("1.2.3");
  });

  test("reads latest version from the registry response", async () => {
    const service = new SelfUpdateService({
      packageJsonUrl: await createPackageJson("1.0.0"),
      metadataFetcher: async () =>
        new Response(
          JSON.stringify({
            name: "@queaxtra/vapor",
            version: "2.0.0",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
    });

    await expect(service.readLatestVersion()).resolves.toBe("2.0.0");
  });

  test("rejects invalid registry responses", async () => {
    const service = new SelfUpdateService({
      packageJsonUrl: await createPackageJson("1.0.0"),
      metadataFetcher: async () =>
        new Response(
          JSON.stringify({
            name: "@queaxtra/other",
            version: "2.0.0",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
    });

    await expect(service.readLatestVersion()).rejects.toThrow("failed to fetch latest vapor version: invalid registry response");
  });

  test("uses the current Bun binary for installation", async () => {
    const commands: string[][] = [];
    const service = new SelfUpdateService({
      packageJsonUrl: await createPackageJson("1.0.0"),
      commandRunner: async (command) => {
        commands.push(command);

        return {
          exitCode: 0,
          stdout: "",
          stderr: "",
        };
      },
    });

    await expect(service.installVersion("2.0.0")).resolves.toBeUndefined();
    expect(commands).toEqual([
      [
        process.execPath,
        "install",
        "--global",
        "--no-progress",
        "--no-summary",
        "@queaxtra/vapor@2.0.0",
      ],
    ]);
  });

  test("sanitizes install failures", async () => {
    const service = new SelfUpdateService({
      packageJsonUrl: await createPackageJson("1.0.0"),
      commandRunner: async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "\u001b[31mpermission denied\u001b[0m\n",
      }),
    });

    await expect(service.installVersion("2.0.0")).rejects.toThrow(
      "failed to install @queaxtra/vapor@2.0.0: permission denied",
    );
  });
});
