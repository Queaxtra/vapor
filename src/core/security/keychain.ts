export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (args: string[]) => Promise<CommandResult>;

async function runSecurityCommand(args: string[]): Promise<CommandResult> {
  try {
    const process = Bun.spawn({
      cmd: ["security", ...args],
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ]);

    return { exitCode, stdout, stderr };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: String(error),
    };
  }
}

export class MacOsKeychain {
  private readonly serviceName: string;
  private readonly accountName: string;
  private readonly runner: CommandRunner;

  public constructor(
    serviceName = "dev.vapor.cloudflare",
    accountName = "cloudflare-api-token",
    runner: CommandRunner = runSecurityCommand,
  ) {
    this.serviceName = serviceName;
    this.accountName = accountName;
    this.runner = runner;
  }

  public async isSupported(): Promise<boolean> {
    if (process.platform !== "darwin") {
      return false;
    }

    const result = await this.runner(["-h"]);

    if (result.exitCode === 0) {
      return true;
    }

    return false;
  }

  public async save(secret: string): Promise<void> {
    const result = await this.runner([
      "add-generic-password",
      "-U",
      "-s",
      this.serviceName,
      "-a",
      this.accountName,
      "-w",
      secret,
    ]);

    if (result.exitCode === 0) {
      return;
    }

    throw new Error("failed to store token in keychain");
  }

  public async read(): Promise<string | null> {
    const result = await this.runner([
      "find-generic-password",
      "-s",
      this.serviceName,
      "-a",
      this.accountName,
      "-w",
    ]);

    if (result.exitCode === 0) {
      return result.stdout.trim();
    }

    if (result.stderr.includes("could not be found")) {
      return null;
    }

    throw new Error("failed to read token from keychain");
  }

  public async remove(): Promise<void> {
    const result = await this.runner([
      "delete-generic-password",
      "-s",
      this.serviceName,
      "-a",
      this.accountName,
    ]);

    if (result.exitCode === 0) {
      return;
    }

    if (result.stderr.includes("could not be found")) {
      return;
    }

    throw new Error("failed to remove token from keychain");
  }
}
