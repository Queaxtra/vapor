import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sanitizeTerminalText } from "./sanitize.ts";

const PACKAGE_NAME = "@queaxtra/vapor";
const PACKAGE_JSON_URL = new URL("../../package.json", import.meta.url);
const REGISTRY_URL = "https://registry.npmjs.org/@queaxtra%2fvapor/latest";
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;
const VERSION_CACHE_TTL_MS = 3_600_000; // 1 hour
const FETCH_TIMEOUT_MS = 10_000; // 10 seconds
const FETCH_MAX_RETRIES = 3;
const FETCH_RETRY_DELAY_MS = 1_000;

interface VersionCache {
  version: string;
  timestamp: number;
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface VaporSelfUpdater {
  readInstalledVersion(): Promise<string>;
  readLatestVersion(): Promise<string>;
  installVersion(version: string): Promise<void>;
}

export interface SelfUpdateServiceOptions {
  metadataFetcher?: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;
  commandRunner?: (command: string[]) => Promise<CommandResult>;
  packageJsonUrl?: URL;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validatePackageMetadata(payload: unknown): { name: string; version: string } {
  if (!isRecord(payload)) {
    throw new Error("package metadata must be an object");
  }

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const version = typeof payload.version === "string" ? payload.version.trim() : "";

  if (name !== PACKAGE_NAME) {
    throw new Error("package metadata does not match vapor");
  }

  if (!VERSION_PATTERN.test(version)) {
    throw new Error("package metadata contains an invalid version");
  }

  return { name, version };
}

function sanitizeErrorLine(input: string): string {
  const sanitized = sanitizeTerminalText(input);
  // Truncate to prevent leaking system paths or sensitive info
  if (sanitized.length > 128) {
    return `${sanitized.slice(0, 128)}...`;
  }
  return sanitized || "<unknown error>";
}

function formatInstallFailure(result: CommandResult, version: string): Error {
  const candidates = [result.stderr, result.stdout]
    .flatMap((chunk) => chunk.split("\n"))
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const firstLine = candidates[0];

  if (firstLine) {
    return new Error(`failed to install ${PACKAGE_NAME}@${version}: ${sanitizeErrorLine(firstLine)}`);
  }

  return new Error(`failed to install ${PACKAGE_NAME}@${version}`);
}

async function runCommand(command: string[]): Promise<CommandResult> {
  const process = Bun.spawn({
    cmd: command,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);

  return {
    exitCode,
    stdout,
    stderr,
  };
}

async function fetchWithRetry(
  fetcher: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>,
  url: string,
  retries: number,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetcher(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, FETCH_RETRY_DELAY_MS * (attempt + 1)));
      }
    }
  }

  throw lastError ?? new Error("fetch failed after retries");
}

export class SelfUpdateService implements VaporSelfUpdater {
  private readonly metadataFetcher: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;
  private readonly commandRunner: (command: string[]) => Promise<CommandResult>;
  private readonly packageJsonUrl: URL;
  private cachedInstalledVersion: string | null = null;
  private versionCache: VersionCache | null = null;

  public constructor(options: SelfUpdateServiceOptions = {}) {
    this.metadataFetcher = options.metadataFetcher ?? fetch;
    this.commandRunner = options.commandRunner ?? runCommand;
    this.packageJsonUrl = options.packageJsonUrl ?? PACKAGE_JSON_URL;
  }

  public async readInstalledVersion(): Promise<string> {
    if (this.cachedInstalledVersion !== null) {
      return this.cachedInstalledVersion;
    }

    let rawPackage = "";

    try {
      rawPackage = await readFile(fileURLToPath(this.packageJsonUrl), "utf8");
    } catch (error) {
      throw new Error(`failed to read installed vapor version: ${String(error)}`);
    }

    let packageMetadata: unknown;

    try {
      packageMetadata = JSON.parse(rawPackage) as unknown;
    } catch {
      throw new Error("failed to read installed vapor version: invalid package metadata");
    }

    this.cachedInstalledVersion = validatePackageMetadata(packageMetadata).version;

    return this.cachedInstalledVersion;
  }

  public async readLatestVersion(): Promise<string> {
    if (this.versionCache !== null) {
      const now = Date.now();

      if (now - this.versionCache.timestamp < VERSION_CACHE_TTL_MS) {
        return this.versionCache.version;
      }
    }

    let response: Response;

    try {
      response = await fetchWithRetry(this.metadataFetcher, REGISTRY_URL, FETCH_MAX_RETRIES);
    } catch (error) {
      throw new Error(`failed to fetch latest vapor version: ${error instanceof Error ? sanitizeErrorLine(error.message) : "network error"}`);
    }

    if (!response.ok) {
      throw new Error(`failed to fetch latest vapor version: registry responded with status ${response.status}`);
    }

    let metadata: unknown;

    try {
      metadata = (await response.json()) as unknown;
    } catch {
      throw new Error("failed to fetch latest vapor version: invalid registry response");
    }

    try {
      const validated = validatePackageMetadata(metadata);
      this.versionCache = {
        version: validated.version,
        timestamp: Date.now(),
      };
      return validated.version;
    } catch {
      throw new Error("failed to fetch latest vapor version: invalid registry response");
    }
  }

  public async installVersion(version: string): Promise<void> {
    if (!VERSION_PATTERN.test(version)) {
      throw new Error("failed to install vapor: invalid target version");
    }

    const result = await this.commandRunner([
      process.execPath,
      "install",
      "--global",
      "--no-progress",
      "--no-summary",
      `${PACKAGE_NAME}@${version}`,
    ]);

    if (result.exitCode === 0) {
      this.cachedInstalledVersion = version;
      return;
    }

    throw formatInstallFailure(result, version);
  }
}
