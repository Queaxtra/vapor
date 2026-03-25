import type { ParsedCommand } from "../types/cli.ts";

function expectValue(argumentsList: string[], index: number, flagName: string): string {
  const value = argumentsList[index + 1];

  if (value) {
    return value;
  }

  throw new Error(`missing value for ${flagName}`);
}

function parseFlags(argumentsList: string[], allowInteractive = false): Omit<ParsedCommand, "name"> {
  const result: Omit<ParsedCommand, "name"> = {};
  let index = 0;

  while (index < argumentsList.length) {
    const token = argumentsList[index];

    if (!token) {
      break;
    }

    if (token === "--help" || token === "-h") {
      result.help = true;
      index += 1;
      continue;
    }

    if ((token === "--interactive" || token === "-i") && allowInteractive) {
      result.interactive = true;
      index += 1;
      continue;
    }

    if (token === "--to") {
      result.destination = expectValue(argumentsList, index, "--to");
      index += 2;
      continue;
    }

    if (token === "--enable") {
      result.enable = true;
      index += 1;
      continue;
    }

    if (token === "--disable") {
      result.disable = true;
      index += 1;
      continue;
    }

    if (token === "--prune-destination") {
      result.pruneDestination = true;
      index += 1;
      continue;
    }

    if (token.startsWith("--")) {
      throw new Error(`unknown option: ${token}`);
    }

    if (!result.target) {
      result.target = token;
      index += 1;
      continue;
    }

    throw new Error(`unexpected argument: ${token}`);
  }

  if (result.enable && result.disable) {
    throw new Error("cannot use --enable and --disable together");
  }

  return result;
}

export function parseCommand(argv: string[]): ParsedCommand {
  const [command, ...rest] = argv;

  if (!command) {
    return { name: "help" };
  }

  if (command === "--help" || command === "-h" || command === "help") {
    return { name: "help" };
  }

  if (command === "init") {
    return { name: "init", ...parseFlags(rest) };
  }

  if (command === "create") {
    return { name: "create", ...parseFlags(rest, true) };
  }

  if (command === "update") {
    return { name: "update", ...parseFlags(rest, true) };
  }

  if (command === "delete") {
    return { name: "delete", ...parseFlags(rest, true) };
  }

  if (command === "list") {
    return { name: "list", ...parseFlags(rest) };
  }

  if (command === "status") {
    return { name: "status", ...parseFlags(rest) };
  }

  if (command === "domain") {
    const [subcommand, ...domainArgs] = rest;

    if (subcommand === "add") {
      const parsed = parseFlags(domainArgs, true);
      return {
        name: "domain-add",
        domain: parsed.target,
        destination: parsed.destination,
        interactive: parsed.interactive,
        help: parsed.help,
      };
    }

    if (subcommand === "remove") {
      const parsed = parseFlags(domainArgs, true);
      return {
        name: "domain-remove",
        domain: parsed.target,
        interactive: parsed.interactive,
        help: parsed.help,
      };
    }

    if (subcommand === "list") {
      return { name: "domain-list", ...parseFlags(domainArgs) };
    }

    throw new Error("unknown domain subcommand");
  }

  throw new Error(`unknown command: ${command}`);
}
