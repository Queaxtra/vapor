import type { DomainProfile } from "../../types/config.ts";
import type {
  CloudflareDestinationAddress,
  CloudflareDnsRecord,
  CloudflareEmailRoutingRule,
} from "../../types/cloudflare.ts";
import { normalizeEmail } from "../validation/input.ts";

export interface DomainBootstrapResult {
  profile: DomainProfile;
  destinationVerified: boolean;
  routingEnabled: boolean;
}

export interface AliasSummary {
  alias: string;
  domain: string;
  destination: string;
  destinationVerified: boolean;
  enabled: boolean;
  ruleId: string;
  status: "active" | "pending";
}

export interface DomainStatusSummary {
  domain: string;
  zoneId: string;
  enabled: boolean;
  defaultDestination: string;
  pendingDestinations: string[];
  dnsRecords: CloudflareDnsRecord[];
}

export interface EnsureRoutingInput {
  domain: string;
  defaultDestination: string;
  confirmEnable: (domain: string, dnsRecords: CloudflareDnsRecord[]) => Promise<boolean>;
}

export interface UpdateAliasOptions {
  destination?: string;
  enable?: boolean;
  disable?: boolean;
}

export function tryGetRuleDestination(rule: CloudflareEmailRoutingRule): string | null {
  const forwardAction = rule.actions.find((action) => action.type === "forward");

  if (forwardAction?.value?.[0]) {
    return normalizeEmail(forwardAction.value[0]);
  }

  return null;
}

export function tryGetRuleAlias(rule: CloudflareEmailRoutingRule): string | null {
  const matcher = rule.matchers.find((item) => item.field === "to" && item.type === "literal");

  if (matcher) {
    return normalizeEmail(matcher.value);
  }

  return null;
}

export function getRuleDestination(rule: CloudflareEmailRoutingRule): string {
  const destination = tryGetRuleDestination(rule);

  if (destination) {
    return destination;
  }

  throw new Error("routing rule does not contain a forward action");
}

export function getRuleAlias(rule: CloudflareEmailRoutingRule): string {
  const alias = tryGetRuleAlias(rule);

  if (alias) {
    return alias;
  }

  throw new Error("routing rule does not contain an alias matcher");
}

export function findAddressByEmail(
  addresses: CloudflareDestinationAddress[],
  destinationEmail: string,
): CloudflareDestinationAddress | undefined {
  const normalizedDestination = normalizeEmail(destinationEmail);

  return addresses.find((address) => normalizeEmail(address.email) === normalizedDestination);
}
