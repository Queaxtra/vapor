import type {
  CloudflareDestinationAddress,
  CloudflareDnsRecord,
  CloudflareEmailRoutingRule,
  CloudflareEmailRoutingSettings,
  CloudflareZone,
} from "../../types/cloudflare.ts";
import { normalizeDomain, normalizeEmail } from "../validation/input.ts";
import { CloudflareClient } from "./client.ts";

function extractDnsRecords(payload: unknown): CloudflareDnsRecord[] {
  if (Array.isArray(payload)) {
    return payload as CloudflareDnsRecord[];
  }

  if (typeof payload === "object" && payload !== null && Array.isArray((payload as { records?: unknown[] }).records)) {
    return (payload as { records: CloudflareDnsRecord[] }).records;
  }

  return [];
}

export class CloudflareEmailRoutingApi {
  private readonly client: CloudflareClient;
  private readonly pageSize = 50;

  public constructor(client: CloudflareClient) {
    this.client = client;
  }

  public async resolveZone(domain: string): Promise<CloudflareZone> {
    const normalizedDomain = normalizeDomain(domain);
    const zones = await this.client.request<CloudflareZone[]>("GET", "zones", undefined, {
      name: normalizedDomain,
      match: "all",
      per_page: String(this.pageSize),
    });
    const zone = zones.find((item) => item.name === normalizedDomain) ?? zones[0];

    if (!zone) {
      throw new Error(
        `cloudflare zone not found for ${normalizedDomain}. verify that the token has Zone Read permission and is scoped to this zone/account`,
      );
    }

    if (zone.status && zone.status !== "active") {
      throw new Error(
        `cloudflare zone ${normalizedDomain} is visible but not active (status: ${zone.status}). complete zone activation in Cloudflare before enabling email routing`,
      );
    }

    return zone;
  }

  public async getEmailRoutingSettings(zoneId: string): Promise<CloudflareEmailRoutingSettings> {
    return this.client.request<CloudflareEmailRoutingSettings>("GET", `zones/${zoneId}/email/routing`);
  }

  public async getEmailRoutingDns(zoneId: string): Promise<CloudflareDnsRecord[]> {
    const payload = await this.client.request<unknown>("GET", `zones/${zoneId}/email/routing/dns`);

    return extractDnsRecords(payload);
  }

  public async enableEmailRouting(zoneId: string): Promise<CloudflareEmailRoutingSettings> {
    return this.client.request<CloudflareEmailRoutingSettings>("POST", `zones/${zoneId}/email/routing/dns`);
  }

  public async listDestinationAddresses(accountId: string): Promise<CloudflareDestinationAddress[]> {
    return this.listAllPages<CloudflareDestinationAddress>(`accounts/${accountId}/email/routing/addresses`);
  }

  public async createDestinationAddress(accountId: string, email: string): Promise<CloudflareDestinationAddress> {
    return this.client.request<CloudflareDestinationAddress>(
      "POST",
      `accounts/${accountId}/email/routing/addresses`,
      { email: normalizeEmail(email) },
    );
  }

  public async deleteDestinationAddress(accountId: string, addressId: string): Promise<void> {
    await this.client.request("DELETE", `accounts/${accountId}/email/routing/addresses/${addressId}`);
  }

  public async listRules(zoneId: string): Promise<CloudflareEmailRoutingRule[]> {
    return this.listAllPages<CloudflareEmailRoutingRule>(`zones/${zoneId}/email/routing/rules`);
  }

  public async createRule(
    zoneId: string,
    aliasEmail: string,
    destinationEmail: string,
    enabled: boolean,
  ): Promise<CloudflareEmailRoutingRule> {
    const normalizedAlias = normalizeEmail(aliasEmail);
    const normalizedDestination = normalizeEmail(destinationEmail);

    return this.client.request<CloudflareEmailRoutingRule>("POST", `zones/${zoneId}/email/routing/rules`, {
      name: normalizedAlias,
      enabled,
      actions: [{ type: "forward", value: [normalizedDestination] }],
      matchers: [{ type: "literal", field: "to", value: normalizedAlias }],
    });
  }

  public async updateRule(
    zoneId: string,
    ruleId: string,
    aliasEmail: string,
    destinationEmail: string,
    enabled: boolean,
  ): Promise<CloudflareEmailRoutingRule> {
    const normalizedAlias = normalizeEmail(aliasEmail);
    const normalizedDestination = normalizeEmail(destinationEmail);

    return this.client.request<CloudflareEmailRoutingRule>("PUT", `zones/${zoneId}/email/routing/rules/${ruleId}`, {
      name: normalizedAlias,
      enabled,
      actions: [{ type: "forward", value: [normalizedDestination] }],
      matchers: [{ type: "literal", field: "to", value: normalizedAlias }],
    });
  }

  public async deleteRule(zoneId: string, ruleId: string): Promise<void> {
    await this.client.request("DELETE", `zones/${zoneId}/email/routing/rules/${ruleId}`);
  }

  private async listAllPages<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    let page = 1;

    while (page <= 100) {
      const currentPage = await this.client.request<T[]>("GET", path, undefined, {
        page: String(page),
        per_page: String(this.pageSize),
      });

      items.push(...currentPage);

      if (currentPage.length < this.pageSize) {
        return items;
      }

      page += 1;
    }

    throw new Error(`cloudflare pagination exceeded safe limit for ${path}`);
  }
}
