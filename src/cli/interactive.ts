import type { DomainProfile } from "../types/config.ts";
import type { ParsedCommand, PromptAdapter, SelectOption } from "../types/cli.ts";
import type { AliasSummary } from "../core/mail-routing/models.ts";
import {
  assertDestinationOutsideDomain,
  extractDomainFromEmail,
  normalizeDomain,
  normalizeEmail,
} from "../core/validation/input.ts";
import { sanitizeTerminalText } from "./sanitize.ts";
import type { ConfiguredCommandRuntime } from "./runtime.ts";

export function findProfileByDomain(profiles: DomainProfile[], domain: string): DomainProfile {
  const normalizedDomain = normalizeDomain(domain);
  const profile = profiles.find((item) => item.domain === normalizedDomain);

  if (profile) {
    return profile;
  }

  throw new Error("domain is not configured");
}

function createDomainOptions(profiles: DomainProfile[]): SelectOption[] {
  return profiles.map((profile) => ({
    value: profile.domain,
    label: `${profile.domain} -> ${profile.defaultDestination}`,
  }));
}

function createAliasOptions(aliases: AliasSummary[]): SelectOption[] {
  return aliases.map((alias) => ({
    value: alias.alias,
    label: `${alias.alias} -> ${alias.destination} (${alias.enabled ? "enabled" : "disabled"})`,
  }));
}

function buildAliasEmail(localPart: string, domain: string): string {
  const trimmedLocalPart = localPart.trim().toLowerCase();

  if (!trimmedLocalPart) {
    throw new Error("alias local part is required");
  }

  if (trimmedLocalPart.includes("@")) {
    throw new Error("alias local part must not contain @");
  }

  return normalizeEmail(`${trimmedLocalPart}@${domain}`);
}

async function promptUntilValid(question: string, prompts: PromptAdapter, validator: (value: string) => string): Promise<string> {
  while (true) {
    const answer = await prompts.ask(question);

    try {
      return validator(answer);
    } catch (error) {
      if (error instanceof Error) {
        process.stderr.write(`${sanitizeTerminalText(error.message)}\n`);
      }
    }
  }
}

async function promptOptionalUntilValid(
  question: string,
  prompts: PromptAdapter,
  defaultValue: string,
  validator: (value: string) => string,
): Promise<string> {
  while (true) {
    const answer = await prompts.askOptional(question, defaultValue);

    try {
      return validator(answer);
    } catch (error) {
      if (error instanceof Error) {
        process.stderr.write(`${sanitizeTerminalText(error.message)}\n`);
      }
    }
  }
}

async function selectProfile(
  runtime: ConfiguredCommandRuntime,
  initialDomain?: string,
): Promise<DomainProfile> {
  if (initialDomain) {
    return findProfileByDomain(runtime.loaded.config.domains, initialDomain);
  }

  if (runtime.loaded.config.domains.length === 1) {
    const singleProfile = runtime.loaded.config.domains[0];

    if (singleProfile) {
      return singleProfile;
    }
  }

  const selectedDomain = await runtime.prompts.select("Which domain do you want to use?", createDomainOptions(runtime.loaded.config.domains));

  return findProfileByDomain(runtime.loaded.config.domains, selectedDomain);
}

async function selectAliasForProfile(
  runtime: ConfiguredCommandRuntime,
  profile: DomainProfile,
): Promise<AliasSummary> {
  const aliases = await runtime.service.listAliases([profile], profile.domain);

  if (!aliases.length) {
    throw new Error(`no aliases exist for ${profile.domain}`);
  }

  const selectedAlias = await runtime.prompts.select("Which alias do you want to use?", createAliasOptions(aliases));
  const alias = aliases.find((item) => item.alias === selectedAlias);

  if (alias) {
    return alias;
  }

  throw new Error("selected alias is invalid");
}

export async function resolveCreateInputs(
  runtime: ConfiguredCommandRuntime,
  command: ParsedCommand,
): Promise<{ profile: DomainProfile; aliasEmail: string; destination: string }> {
  const explicitInteractive = Boolean(command.interactive);
  let profile: DomainProfile;
  let aliasEmail = command.target ? normalizeEmail(command.target) : "";

  if (explicitInteractive || !command.target) {
    runtime.output.printWizardHeader("Interactive Create");
  }

  if (aliasEmail) {
    profile = findProfileByDomain(runtime.loaded.config.domains, extractDomainFromEmail(aliasEmail));
  } else {
    profile = await selectProfile(runtime);
    aliasEmail = await promptUntilValid("Alias local part: ", runtime.prompts, (value) => buildAliasEmail(value, profile.domain));
  }

  const destinationDefault = command.destination ? normalizeEmail(command.destination) : profile.defaultDestination;
  const shouldPromptDestination = explicitInteractive || !command.target;
  let destination = destinationDefault;

  if (shouldPromptDestination) {
    destination = await promptOptionalUntilValid(
      "Destination inbox",
      runtime.prompts,
      destinationDefault,
      (value) => {
        const normalizedDestination = normalizeEmail(value);

        assertDestinationOutsideDomain(normalizedDestination, profile.domain);

        return normalizedDestination;
      },
    );
  }

  if (!shouldPromptDestination) {
    assertDestinationOutsideDomain(destination, profile.domain);
  }

  if (explicitInteractive) {
    runtime.output.printWizardSummary([
      `Alias: ${aliasEmail}`,
      `Destination: ${destination}`,
    ]);
  }

  return { profile, aliasEmail, destination };
}

export async function resolveUpdateInputs(
  runtime: ConfiguredCommandRuntime,
  command: ParsedCommand,
): Promise<{
  profile: DomainProfile;
  aliasEmail: string;
  destination: string;
  enable?: boolean;
  disable?: boolean;
}> {
  if (command.target && !command.interactive) {
    const aliasEmail = normalizeEmail(command.target);
    const profile = findProfileByDomain(runtime.loaded.config.domains, extractDomainFromEmail(aliasEmail));
    const destination = command.destination ? normalizeEmail(command.destination) : "";

    return {
      profile,
      aliasEmail,
      destination,
      enable: command.enable,
      disable: command.disable,
    };
  }

  runtime.output.printWizardHeader("Interactive Update");

  let profile: DomainProfile;
  let alias: AliasSummary | null = null;

  if (command.target) {
    const aliasEmail = normalizeEmail(command.target);

    profile = findProfileByDomain(runtime.loaded.config.domains, extractDomainFromEmail(aliasEmail));

    const aliases = await runtime.service.listAliases([profile], profile.domain);
    const existingAlias = aliases.find((item) => item.alias === aliasEmail);

    if (!existingAlias) {
      throw new Error("alias was not found");
    }

    alias = existingAlias;
  } else {
    profile = await selectProfile(runtime);
    alias = await selectAliasForProfile(runtime, profile);
  }

  if (!alias) {
    throw new Error("alias was not found");
  }

  const destination = await promptOptionalUntilValid(
    "Destination inbox",
    runtime.prompts,
    alias.destination,
    (value) => {
      const normalizedDestination = normalizeEmail(value);

      assertDestinationOutsideDomain(normalizedDestination, profile.domain);

      return normalizedDestination;
    },
  );
  const stateValue = await runtime.prompts.select("Choose the alias state", [
    { value: "keep", label: "Keep current state" },
    { value: "enable", label: "Enable alias" },
    { value: "disable", label: "Disable alias" },
  ]);
  const enable = stateValue === "enable";
  const disable = stateValue === "disable";

  if (command.interactive) {
    runtime.output.printWizardSummary([
      `Alias: ${alias.alias}`,
      `Destination: ${destination}`,
      `State: ${stateValue}`,
    ]);
  }

  return {
    profile,
    aliasEmail: alias.alias,
    destination,
    enable,
    disable,
  };
}

export async function resolveDeleteInputs(
  runtime: ConfiguredCommandRuntime,
  command: ParsedCommand,
): Promise<{ profile: DomainProfile; aliasEmail: string; pruneDestination: boolean }> {
  runtime.output.printWizardHeader("Interactive Delete");

  let profile: DomainProfile;
  let aliasEmail = command.target ? normalizeEmail(command.target) : "";

  if (aliasEmail) {
    profile = findProfileByDomain(runtime.loaded.config.domains, extractDomainFromEmail(aliasEmail));
  } else {
    profile = await selectProfile(runtime);
    const alias = await selectAliasForProfile(runtime, profile);

    aliasEmail = alias.alias;
  }

  const pruneValue = await runtime.prompts.select("Prune the destination if no other alias uses it?", [
    { value: "no", label: "No" },
    { value: "yes", label: "Yes" },
  ]);
  const pruneDestination = pruneValue === "yes";

  runtime.output.printWizardSummary([
    `Alias: ${aliasEmail}`,
    `Prune destination: ${pruneDestination ? "yes" : "no"}`,
  ]);

  const confirmed = await runtime.prompts.confirm("Delete this alias?");

  if (confirmed) {
    return { profile, aliasEmail, pruneDestination };
  }

  throw new Error("delete cancelled");
}

export async function resolveDomainAddInputs(
  runtime: ConfiguredCommandRuntime,
  command: ParsedCommand,
): Promise<{ domain: string; destination: string }> {
  if (command.domain && command.destination && !command.interactive) {
    const domain = normalizeDomain(command.domain);
    const destination = normalizeEmail(command.destination);

    assertDestinationOutsideDomain(destination, domain);

    return { domain, destination };
  }

  runtime.output.printWizardHeader("Interactive Domain Add");

  let domain = command.domain ? normalizeDomain(command.domain) : "";

  if (!domain) {
    domain = await promptUntilValid("Domain: ", runtime.prompts, (value) => normalizeDomain(value));
  }

  const destinationDefault = command.destination ? normalizeEmail(command.destination) : "";
  const destination = await promptOptionalUntilValid(
    "Default destination inbox",
    runtime.prompts,
    destinationDefault,
    (value) => {
      const normalizedDestination = normalizeEmail(value);

      assertDestinationOutsideDomain(normalizedDestination, domain);

      return normalizedDestination;
    },
  );

  if (command.interactive) {
    runtime.output.printWizardSummary([
      `Domain: ${domain}`,
      `Default destination: ${destination}`,
    ]);
  }

  return { domain, destination };
}

export async function resolveDomainRemove(runtime: ConfiguredCommandRuntime, command: ParsedCommand): Promise<string> {
  runtime.output.printWizardHeader("Interactive Domain Remove");

  let domain = command.domain ? normalizeDomain(command.domain) : "";

  if (!domain) {
    const selectedDomain = await runtime.prompts.select(
      "Which configured domain should be removed?",
      runtime.loaded.config.domains.map((profile) => ({
        value: profile.domain,
        label: `${profile.domain} -> ${profile.defaultDestination}`,
      })),
    );

    domain = normalizeDomain(selectedDomain);
  }

  runtime.output.printWizardSummary([
    `Domain: ${domain}`,
    "Removal scope: local configuration only",
  ]);

  const confirmed = await runtime.prompts.confirm("Remove this domain from local configuration?");

  if (confirmed) {
    return domain;
  }

  throw new Error("domain removal cancelled");
}
