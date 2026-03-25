// Console output formatting - renders structured data and status messages for the CLI
import type { AliasSummary, DomainStatusSummary } from "../core/mail-routing/models.ts";
import { sanitizeTerminalText } from "./sanitize.ts";

/**
 * Builds a fixed-width table string for aligned terminal output.
 * Column widths are computed from the longest cell in each column (header or data).
 */
function renderTable(headers: string[], rows: string[][]): string {
  const sanitizedHeaders = headers.map((header) => sanitizeTerminalText(header));
  const sanitizedRows = rows.map((row) => row.map((cell) => sanitizeTerminalText(cell)));
  const widths = sanitizedHeaders.map((header, index) => {
    const cellWidths = sanitizedRows.map((row) => row[index]?.length ?? 0);

    return Math.max(header.length, ...cellWidths);
  });
  const headerRow = sanitizedHeaders.map((header, index) => header.padEnd(widths[index] ?? header.length)).join("  ");
  const separator = widths.map((width) => "-".repeat(width)).join("  ");
  const body = sanitizedRows
    .map((row) => row.map((cell, index) => cell.padEnd(widths[index] ?? cell.length)).join("  "))
    .join("\n");

  if (!body) {
    return `${headerRow}\n${separator}`;
  }

  return `${headerRow}\n${separator}\n${body}`;
}

/**
 * Aggregates all CLI output operations: info, warnings, errors, and formatted data views.
 * Separating output from business logic enables testability and consistent formatting.
 */
export class CliOutput {
  public info(message: string): void {
    console.log(message);
  }

  public success(message: string): void {
    console.log(message);
  }

  public warn(message: string): void {
    console.warn(message);
  }

  public error(message: string): void {
    console.error(message);
  }

  /** Displays the full command reference with all available commands and flags. */
  public printHelp(): void {
    this.info(`Vapor CLI

Usage:
  vapor init
  vapor domain add [<domain>] [--to destination@example.com] [-i|--interactive]
  vapor domain remove [<domain>] [-i|--interactive]
  vapor domain list
  vapor create [<alias@domain>] [--to destination@example.com] [-i|--interactive]
  vapor update [<alias@domain>] [--to destination@example.com] [--enable] [--disable] [-i|--interactive]
  vapor delete [<alias@domain>] [--prune-destination] [-i|--interactive]
  vapor list [domain]
  vapor status [domain|alias@domain]

Mutation commands prompt automatically when required values are missing.
`);
  }

  public printWizardHeader(title: string): void {
    this.info(`Vapor - ${sanitizeTerminalText(title)}`);
    this.info("");
  }

  public printWizardSummary(lines: string[]): void {
    if (!lines.length) {
      return;
    }

    this.info("Summary:");
    lines.forEach((line) => this.info(`  ${sanitizeTerminalText(line)}`));
    this.info("");
  }

  /** Renders a table of all aliases; shows empty state message if list is empty. */
  public printAliases(aliases: AliasSummary[]): void {
    if (!aliases.length) {
      this.info("No aliases found.");
      return;
    }

    const rows = aliases.map((item) => [
      item.alias,
      item.destination,
      item.status,
      item.enabled ? "enabled" : "disabled",
      item.ruleId,
    ]);

    this.info(renderTable(["Alias", "Destination", "Verification", "State", "Rule ID"], rows));
  }

  /** Renders a single alias's full status as labeled key-value pairs. */
  public printAliasStatus(alias: AliasSummary): void {
    this.info(`Alias: ${sanitizeTerminalText(alias.alias)}`);
    this.info(`Domain: ${sanitizeTerminalText(alias.domain)}`);
    this.info(`Destination: ${sanitizeTerminalText(alias.destination)}`);
    this.info(`Verification: ${sanitizeTerminalText(alias.status)}`);
    this.info(`State: ${alias.enabled ? "enabled" : "disabled"}`);
    this.info(`Rule ID: ${sanitizeTerminalText(alias.ruleId)}`);
  }

  /** Renders a table of all configured domains; shows empty state if none exist. */
  public printDomainStatuses(statuses: DomainStatusSummary[]): void {
    if (!statuses.length) {
      this.info("No domains configured.");
      return;
    }

    const rows = statuses.map((item) => [
      item.domain,
      item.defaultDestination,
      item.enabled ? "enabled" : "disabled",
      item.pendingDestinations.length ? item.pendingDestinations.join(", ") : "-",
    ]);

    this.info(renderTable(["Domain", "Default Destination", "Routing", "Pending Destinations"], rows));
  }

  /**
   * Renders a single domain's full status including zone ID and associated DNS records.
   * DNS records table is omitted if the domain has no records configured.
   */
  public printDomainStatus(status: DomainStatusSummary): void {
    this.info(`Domain: ${sanitizeTerminalText(status.domain)}`);
    this.info(`Zone ID: ${sanitizeTerminalText(status.zoneId)}`);
    this.info(`Default destination: ${sanitizeTerminalText(status.defaultDestination)}`);
    this.info(`Routing: ${status.enabled ? "enabled" : "disabled"}`);
    this.info(
      `Pending destinations: ${status.pendingDestinations.length ? sanitizeTerminalText(status.pendingDestinations.join(", ")) : "none"}`,
    );

    if (!status.dnsRecords.length) {
      return;
    }

    const rows = status.dnsRecords.map((record) => [
      record.type,
      record.name,
      record.content,
      record.priority ? String(record.priority) : "-",
    ]);

    this.info("");
    this.info(renderTable(["Type", "Name", "Content", "Priority"], rows));
  }
}
