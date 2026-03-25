import { parseCommand } from "./parser.ts";
import { TerminalPrompts } from "./prompts.ts";
import { CliOutput } from "./output.ts";
import { ConfigStore } from "../core/config/store.ts";
import { createDefaultVaporPaths } from "../core/config/paths.ts";
import { SecretManager, VAPOR_TOKEN_ENV_KEY } from "../core/security/secret.ts";
import { CloudflareClient } from "../core/cloudflare/client.ts";
import { CloudflareEmailRoutingApi } from "../core/cloudflare/api.ts";
import { MailRoutingService } from "../core/mail-routing/service.ts";
import type { DomainBootstrapResult } from "../core/mail-routing/models.ts";
import type { PromptAdapter } from "../types/cli.ts";
import { normalizeDomain, normalizeEmail } from "../core/validation/input.ts";
import { runConfiguredCommand } from "./commands.ts";
import { sanitizeTerminalText } from "./sanitize.ts";
import { SelfUpdateService, type VaporSelfUpdater } from "./updater.ts";

interface RuntimeDependencies {
  prompts?: PromptAdapter;
  output?: CliOutput;
  store?: ConfigStore;
  selfUpdater?: VaporSelfUpdater;
}

function createMailRoutingService(token: string): MailRoutingService {
  const client = new CloudflareClient({ apiToken: token });
  const api = new CloudflareEmailRoutingApi(client);

  return new MailRoutingService(api);
}

async function confirmEnableDomain(
  prompts: PromptAdapter,
  output: CliOutput,
  domain: string,
  dnsRecords: { type: string; name: string; content: string; priority?: number }[],
): Promise<boolean> {
  output.warn(`Email Routing is disabled for ${domain}. Cloudflare will add or lock the following records:`);

  dnsRecords.forEach((record) => {
    output.info(
      `  ${sanitizeTerminalText(record.type)} ${sanitizeTerminalText(record.name)} -> ${sanitizeTerminalText(record.content)}${record.priority ? ` (priority ${record.priority})` : ""}`,
    );
  });

  return prompts.confirm(`Enable Email Routing for ${domain}?`);
}

function parseDomainList(input: string): string[] {
  const domains = input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => normalizeDomain(item));

  return [...new Set(domains)];
}

async function collectBootstrapTargets(
  prompts: PromptAdapter,
  service: MailRoutingService,
  output: CliOutput,
  domains: string[],
): Promise<DomainBootstrapResult[]> {
  const bootstrappedDomains: DomainBootstrapResult[] = [];

  for (const domain of domains) {
    const defaultDestination = normalizeEmail(await prompts.ask(`Default destination inbox for ${domain}: `));
    const result = await service.bootstrapDomain({
      domain,
      defaultDestination,
      confirmEnable: (targetDomain, dnsRecords) => confirmEnableDomain(prompts, output, targetDomain, dnsRecords),
    });

    bootstrappedDomains.push(result);
  }

  return bootstrappedDomains;
}

async function runInit(
  prompts: PromptAdapter,
  output: CliOutput,
  store: ConfigStore,
): Promise<void> {
  const preferredProvider = await new SecretManager(createDefaultVaporPaths()).getPreferredProvider();
  let token = process.env[VAPOR_TOKEN_ENV_KEY]?.trim() ?? "";

  if (!token) {
    token = (await prompts.askSecret("Cloudflare API token: ")).trim();
  }

  if (!token) {
    throw new Error("cloudflare api token is required");
  }

  const service = createMailRoutingService(token);
  const rawDomains = await prompts.ask("Domains to manage (comma-separated): ");
  const domains = parseDomainList(rawDomains);

  if (domains.length) {
    const bootstrappedDomains = await collectBootstrapTargets(prompts, service, output, domains);

    await store.initialize({
      token,
      domains: bootstrappedDomains.map((item) => item.profile),
    });

    output.success("Vapor configuration saved.");

    if (preferredProvider === "env") {
      output.warn(`Secure OS keychain storage is unavailable on this platform. Set ${VAPOR_TOKEN_ENV_KEY} for future runs.`);
    }

    bootstrappedDomains.forEach((item) => {
      if (item.destinationVerified) {
        return;
      }

      output.warn(`Destination inbox for ${item.profile.domain} is pending email verification.`);
    });

    return;
  }

  throw new Error("at least one domain is required");
}

async function ensureConfigured(
  prompts: PromptAdapter,
  output: CliOutput,
  store: ConfigStore,
): Promise<void> {
  if (await store.exists()) {
    return;
  }

  output.warn("No Vapor configuration found. Starting interactive setup.");
  await runInit(prompts, output, store);
}

export async function runCli(argv: string[], dependencies: RuntimeDependencies = {}): Promise<void> {
  const prompts = dependencies.prompts ?? new TerminalPrompts();
  const output = dependencies.output ?? new CliOutput();
  const paths = createDefaultVaporPaths();
  const store = dependencies.store ?? new ConfigStore(paths, new SecretManager(paths));
  const selfUpdater = dependencies.selfUpdater ?? new SelfUpdateService();

  try {
    const command = parseCommand(argv);

    if (command.help || command.name === "help") {
      output.printHelp();
      return;
    }

    if (command.name === "init") {
      await runInit(prompts, output, store);
      return;
    }

    if (command.name === "self-update") {
      const currentVersion = await selfUpdater.readInstalledVersion();
      const latestVersion = await selfUpdater.readLatestVersion();

      output.info(`Current version: ${currentVersion}`);
      output.info(`Latest version: ${latestVersion}`);

      if (currentVersion === latestVersion) {
        output.success("Vapor is already up to date.");
        return;
      }

      await selfUpdater.installVersion(latestVersion);
      output.success(`Updated Vapor to ${latestVersion}.`);
      return;
    }

    await ensureConfigured(prompts, output, store);
    const loaded = await store.load();
    const service = createMailRoutingService(loaded.token);
    const handled = await runConfiguredCommand(command, {
      prompts,
      output,
      store,
      loaded,
      service,
    });

    if (!handled) {
      throw new Error("unsupported command");
    }
  } catch (error) {
    output.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
