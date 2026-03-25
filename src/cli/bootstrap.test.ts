import { describe, expect, test } from "bun:test";
import { runCli } from "./bootstrap.ts";

class FakeOutput {
  public readonly infos: string[] = [];
  public readonly successes: string[] = [];
  public readonly errors: string[] = [];
  public readonly warnings: string[] = [];

  public info(message: string): void {
    this.infos.push(message);
  }

  public success(message: string): void {
    this.successes.push(message);
  }

  public warn(message: string): void {
    this.warnings.push(message);
  }

  public error(message: string): void {
    this.errors.push(message);
  }

  public printHelp(): void {}

  public printAliases(): void {}

  public printAliasStatus(): void {}

  public printDomainStatuses(): void {}

  public printDomainStatus(): void {}

  public printWizardHeader(): void {}

  public printWizardSummary(): void {}
}

describe("runCli", () => {
  test("self-update does not require local configuration", async () => {
    const output = new FakeOutput();
    let storeTouched = false;
    let installedVersion = "";
    const store = {
      async exists() {
        storeTouched = true;
        return false;
      },
    };
    const selfUpdater = {
      async readInstalledVersion() {
        return "0.1.0";
      },
      async readLatestVersion() {
        return "0.2.0";
      },
      async installVersion(version: string) {
        installedVersion = version;
      },
    };

    await runCli(["update"], {
      output: output as never,
      store: store as never,
      selfUpdater,
    });

    expect(storeTouched).toBe(false);
    expect(installedVersion).toBe("0.2.0");
    expect(output.infos).toEqual(["Current version: 0.1.0", "Latest version: 0.2.0"]);
    expect(output.successes).toEqual(["Updated Vapor to 0.2.0."]);
  });

  test("self-update becomes a no-op when already current", async () => {
    const output = new FakeOutput();
    let installCalled = false;
    const selfUpdater = {
      async readInstalledVersion() {
        return "0.2.0";
      },
      async readLatestVersion() {
        return "0.2.0";
      },
      async installVersion() {
        installCalled = true;
      },
    };

    await runCli(["update"], {
      output: output as never,
      selfUpdater,
      store: {} as never,
    });

    expect(installCalled).toBe(false);
    expect(output.infos).toEqual(["Current version: 0.2.0", "Latest version: 0.2.0"]);
    expect(output.successes).toEqual(["Vapor is already up to date."]);
  });
});
