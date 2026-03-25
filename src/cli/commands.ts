import type { AliasSummary, DomainStatusSummary } from "../core/mail-routing/models.ts";
import { extractDomainFromEmail, normalizeDomain, normalizeEmail } from "../core/validation/input.ts";
import { sanitizeTerminalText } from "./sanitize.ts";
import type { ConfiguredCommandRuntime } from "./runtime.ts";
import {
  findProfileByDomain,
  resolveCreateInputs,
  resolveDeleteInputs,
  resolveDomainAddInputs,
  resolveDomainRemove,
  resolveUpdateInputs,
} from "./interactive.ts";
import type { ParsedCommand } from "../types/cli.ts";

async function handleConfiguredCreate(runtime: ConfiguredCommandRuntime, command: ParsedCommand): Promise<void> {
  const inputs = await resolveCreateInputs(runtime, command);
  const summary = await runtime.service.createAlias(inputs.profile, inputs.aliasEmail, inputs.destination);

  runtime.output.success(`Alias ${summary.alias} created.`);

  if (summary.status === "active") {
    return;
  }

  runtime.output.warn(`Destination ${summary.destination} is pending verification. Use "vapor status ${summary.alias}" to track it.`);
}

async function handleConfiguredUpdate(runtime: ConfiguredCommandRuntime, command: ParsedCommand): Promise<void> {
  const inputs = await resolveUpdateInputs(runtime, command);
  const destination = inputs.destination || undefined;
  const summary = await runtime.service.updateAlias(inputs.profile, inputs.aliasEmail, {
    destination,
    enable: inputs.enable,
    disable: inputs.disable,
  });

  runtime.output.success(`Alias ${summary.alias} updated.`);

  if (summary.status === "active") {
    return;
  }

  runtime.output.warn(`Destination ${summary.destination} is pending verification.`);
}

async function handleConfiguredDelete(runtime: ConfiguredCommandRuntime, command: ParsedCommand): Promise<void> {
  if (command.target && !command.interactive) {
    const aliasEmail = normalizeEmail(command.target);
    const profile = findProfileByDomain(runtime.loaded.config.domains, extractDomainFromEmail(aliasEmail));

    await runtime.service.deleteAlias(profile, aliasEmail, Boolean(command.pruneDestination));
    runtime.output.success(`Alias ${aliasEmail} deleted.`);
    return;
  }

  const inputs = await resolveDeleteInputs(runtime, command);

  await runtime.service.deleteAlias(inputs.profile, inputs.aliasEmail, inputs.pruneDestination);
  runtime.output.success(`Alias ${inputs.aliasEmail} deleted.`);
}

async function handleConfiguredDomainAdd(runtime: ConfiguredCommandRuntime, command: ParsedCommand): Promise<void> {
  const inputs = await resolveDomainAddInputs(runtime, command);
  const bootstrapped = await runtime.service.bootstrapDomain({
    domain: inputs.domain,
    defaultDestination: inputs.destination,
    confirmEnable: async (domain, dnsRecords) => {
      runtime.output.warn(`Email Routing is disabled for ${domain}. Cloudflare will add or lock the following records:`);
      dnsRecords.forEach((record) => {
        runtime.output.info(
          `  ${sanitizeTerminalText(record.type)} ${sanitizeTerminalText(record.name)} -> ${sanitizeTerminalText(record.content)}${record.priority ? ` (priority ${record.priority})` : ""}`,
        );
      });

      return runtime.prompts.confirm(`Enable Email Routing for ${domain}?`);
    },
  });

  await runtime.store.upsertDomain(bootstrapped.profile);
  runtime.output.success(`Domain ${bootstrapped.profile.domain} is ready.`);

  if (bootstrapped.destinationVerified) {
    return;
  }

  runtime.output.warn(`Destination inbox ${bootstrapped.profile.defaultDestination} is pending verification.`);
}

async function handleConfiguredDomainRemove(runtime: ConfiguredCommandRuntime, command: ParsedCommand): Promise<void> {
  if (command.domain && !command.interactive) {
    const removed = await runtime.store.removeDomain(command.domain);

    if (removed) {
      runtime.output.success(`Domain ${normalizeDomain(command.domain)} removed from local configuration.`);
      return;
    }

    runtime.output.warn(`Domain ${normalizeDomain(command.domain)} was not found in local configuration.`);
    return;
  }

  const domain = await resolveDomainRemove(runtime, command);
  const removed = await runtime.store.removeDomain(domain);

  if (removed) {
    runtime.output.success(`Domain ${domain} removed from local configuration.`);
    return;
  }

  runtime.output.warn(`Domain ${domain} was not found in local configuration.`);
}

async function handleConfiguredDomainList(runtime: ConfiguredCommandRuntime): Promise<void> {
  const statuses = (await runtime.service.getStatus(runtime.loaded.config.domains)) as DomainStatusSummary[];

  runtime.output.printDomainStatuses(statuses);
}

async function handleConfiguredList(runtime: ConfiguredCommandRuntime, command: ParsedCommand): Promise<void> {
  const aliases = await runtime.service.listAliases(runtime.loaded.config.domains, command.target);

  runtime.output.printAliases(aliases);
}

async function handleConfiguredStatus(runtime: ConfiguredCommandRuntime, command: ParsedCommand): Promise<void> {
  const status = await runtime.service.getStatus(runtime.loaded.config.domains, command.target);

  if (Array.isArray(status)) {
    runtime.output.printDomainStatuses(status);
    return;
  }

  if ("alias" in status) {
    runtime.output.printAliasStatus(status as AliasSummary);
    return;
  }

  runtime.output.printDomainStatus(status as DomainStatusSummary);
}

export async function runConfiguredCommand(command: ParsedCommand, runtime: ConfiguredCommandRuntime): Promise<boolean> {
  if (command.name === "domain-add") {
    await handleConfiguredDomainAdd(runtime, command);
    return true;
  }

  if (command.name === "domain-remove") {
    await handleConfiguredDomainRemove(runtime, command);
    return true;
  }

  if (command.name === "domain-list") {
    await handleConfiguredDomainList(runtime);
    return true;
  }

  if (command.name === "create") {
    await handleConfiguredCreate(runtime, command);
    return true;
  }

  if (command.name === "update") {
    await handleConfiguredUpdate(runtime, command);
    return true;
  }

  if (command.name === "delete") {
    await handleConfiguredDelete(runtime, command);
    return true;
  }

  if (command.name === "list") {
    await handleConfiguredList(runtime, command);
    return true;
  }

  if (command.name === "status") {
    await handleConfiguredStatus(runtime, command);
    return true;
  }

  return false;
}
