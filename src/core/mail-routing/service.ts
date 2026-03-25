import { MemoryCache } from "../cache/cache.ts";
import { CloudflareEmailRoutingApi } from "../cloudflare/api.ts";
import type {
  CloudflareDestinationAddress,
  CloudflareDnsRecord,
  CloudflareEmailRoutingRule,
  CloudflareEmailRoutingSettings,
} from "../../types/cloudflare.ts";
import type { DomainProfile } from "../../types/config.ts";
import {
  extractDomainFromEmail,
  normalizeDomain,
  normalizeEmail,
  assertAliasBelongsToDomain,
  assertDestinationOutsideDomain,
} from "../validation/input.ts";
import {
  type AliasSummary,
  type DomainBootstrapResult,
  type DomainStatusSummary,
  type EnsureRoutingInput,
  findAddressByEmail,
  getRuleAlias,
  getRuleDestination,
  tryGetRuleAlias,
  tryGetRuleDestination,
  type UpdateAliasOptions,
} from "./models.ts";

export class MailRoutingService {
  private readonly api: CloudflareEmailRoutingApi;
  private readonly rulesCache = new MemoryCache<CloudflareEmailRoutingRule[]>();
  private readonly addressesCache = new MemoryCache<CloudflareDestinationAddress[]>();
  private readonly settingsCache = new MemoryCache<CloudflareEmailRoutingSettings>();

  public constructor(api: CloudflareEmailRoutingApi) {
    this.api = api;
  }

  public async bootstrapDomain(input: EnsureRoutingInput): Promise<DomainBootstrapResult> {
    const domain = normalizeDomain(input.domain);
    const defaultDestination = normalizeEmail(input.defaultDestination);

    assertDestinationOutsideDomain(defaultDestination, domain);

    const zone = await this.api.resolveZone(domain);

    await this.ensureEmailRoutingEnabled(zone.id, domain, input.confirmEnable);

    const destination = await this.ensureDestinationAddress(zone.account.id, defaultDestination);
    const profile: DomainProfile = {
      domain,
      zoneId: zone.id,
      accountId: zone.account.id,
      defaultDestination,
    };

    return {
      profile,
      destinationVerified: Boolean(destination.verified),
      routingEnabled: true,
    };
  }

  public async createAlias(profile: DomainProfile, aliasEmail: string, destinationEmail?: string): Promise<AliasSummary> {
    const normalizedAlias = normalizeEmail(aliasEmail);
    const normalizedDestination = normalizeEmail(destinationEmail ?? profile.defaultDestination);

    assertAliasBelongsToDomain(normalizedAlias, profile.domain);
    assertDestinationOutsideDomain(normalizedDestination, profile.domain);

    const existingRule = await this.findRuleByAlias(profile.zoneId, normalizedAlias);

    if (existingRule) {
      throw new Error("alias already exists; use update instead");
    }

    const destination = await this.ensureDestinationAddress(profile.accountId, normalizedDestination);
    const createdRule = await this.api.createRule(profile.zoneId, normalizedAlias, normalizedDestination, true);

    await this.refreshRules(profile.zoneId);

    return this.toAliasSummary(profile.domain, createdRule, destination);
  }

  public async updateAlias(
    profile: DomainProfile,
    aliasEmail: string,
    options: UpdateAliasOptions,
  ): Promise<AliasSummary> {
    const normalizedAlias = normalizeEmail(aliasEmail);
    const existingRule = await this.findRuleByAlias(profile.zoneId, normalizedAlias);

    if (!existingRule) {
      throw new Error("alias was not found");
    }

    const nextDestination = normalizeEmail(options.destination ?? getRuleDestination(existingRule));

    assertDestinationOutsideDomain(nextDestination, profile.domain);

    const enabled = this.resolveEnabledState(existingRule.enabled, options);
    const destination = await this.ensureDestinationAddress(profile.accountId, nextDestination);
    const updatedRule = await this.api.updateRule(
      profile.zoneId,
      existingRule.id,
      normalizedAlias,
      nextDestination,
      enabled,
    );

    await this.refreshRules(profile.zoneId);

    return this.toAliasSummary(profile.domain, updatedRule, destination);
  }

  public async deleteAlias(profile: DomainProfile, aliasEmail: string, pruneDestination: boolean): Promise<void> {
    const normalizedAlias = normalizeEmail(aliasEmail);
    const existingRule = await this.findRuleByAlias(profile.zoneId, normalizedAlias);

    if (!existingRule) {
      throw new Error("alias was not found");
    }

    const destination = getRuleDestination(existingRule);

    await this.api.deleteRule(profile.zoneId, existingRule.id);
    await this.refreshRules(profile.zoneId);

    if (!pruneDestination) {
      return;
    }

    const currentRules = await this.getRules(profile.zoneId);
    const destinationStillUsed = currentRules.some((rule) => tryGetRuleDestination(rule) === destination);

    if (destinationStillUsed) {
      return;
    }

    const addresses = await this.getAddresses(profile.accountId);
    const address = findAddressByEmail(addresses, destination);

    if (!address) {
      return;
    }

    await this.api.deleteDestinationAddress(profile.accountId, address.id);
    await this.refreshAddresses(profile.accountId);
  }

  public async listAliases(profiles: DomainProfile[], domain?: string): Promise<AliasSummary[]> {
    const selectedProfiles = profiles.filter((profile) => {
      if (!domain) {
        return true;
      }

      return profile.domain === normalizeDomain(domain);
    });
    const summaries = await Promise.all(selectedProfiles.map((profile) => this.listAliasesForDomain(profile)));

    return summaries.flat().sort((left, right) => left.alias.localeCompare(right.alias));
  }

  public async getStatus(
    profiles: DomainProfile[],
    target?: string,
  ): Promise<AliasSummary | DomainStatusSummary | DomainStatusSummary[]> {
    if (!target) {
      return Promise.all(profiles.map((profile) => this.getDomainStatus(profile)));
    }

    if (target.includes("@")) {
      return this.getAliasStatus(profiles, target);
    }

    const profile = profiles.find((item) => item.domain === normalizeDomain(target));

    if (profile) {
      return this.getDomainStatus(profile);
    }

    throw new Error("domain is not configured");
  }

  private async getAliasStatus(profiles: DomainProfile[], aliasEmail: string): Promise<AliasSummary> {
    const normalizedAlias = normalizeEmail(aliasEmail);
    const domain = extractDomainFromEmail(normalizedAlias);
    const profile = profiles.find((item) => item.domain === domain);

    if (!profile) {
      throw new Error("domain is not configured");
    }

    const rule = await this.findRuleByAlias(profile.zoneId, normalizedAlias);

    if (!rule) {
      throw new Error("alias was not found");
    }

    const addresses = await this.getAddresses(profile.accountId);
    const destination = findAddressByEmail(addresses, getRuleDestination(rule));

    if (destination) {
      return this.toAliasSummary(profile.domain, rule, destination);
    }

    throw new Error("destination address was not found");
  }

  private async listAliasesForDomain(profile: DomainProfile): Promise<AliasSummary[]> {
    const [rules, addresses] = await Promise.all([this.getRules(profile.zoneId), this.getAddresses(profile.accountId)]);

    return rules
      .map((rule) => {
        const alias = tryGetRuleAlias(rule);
        const destinationEmail = tryGetRuleDestination(rule);

        if (!alias || !destinationEmail) {
          return null;
        }

        const destination = findAddressByEmail(addresses, destinationEmail);

        if (destination) {
          return this.toAliasSummary(profile.domain, rule, destination);
        }

        return null;
      })
      .filter((item): item is AliasSummary => item !== null);
  }

  private async getDomainStatus(profile: DomainProfile): Promise<DomainStatusSummary> {
    const settings = await this.getSettings(profile.zoneId);
    const addresses = await this.getAddresses(profile.accountId);
    const pendingDestinations = addresses
      .filter((address) => !address.verified)
      .map((address) => normalizeEmail(address.email))
      .sort((left, right) => left.localeCompare(right));
    const dnsRecords = await this.api.getEmailRoutingDns(profile.zoneId);

    return {
      domain: profile.domain,
      zoneId: profile.zoneId,
      enabled: settings.enabled,
      defaultDestination: profile.defaultDestination,
      pendingDestinations,
      dnsRecords,
    };
  }

  private async ensureEmailRoutingEnabled(
    zoneId: string,
    domain: string,
    confirmEnable: (domain: string, dnsRecords: CloudflareDnsRecord[]) => Promise<boolean>,
  ): Promise<void> {
    const settings = await this.getSettings(zoneId);

    if (settings.enabled) {
      return;
    }

    const dnsRecords = await this.api.getEmailRoutingDns(zoneId);
    const approved = await confirmEnable(domain, dnsRecords);

    if (approved) {
      const nextSettings = await this.api.enableEmailRouting(zoneId);

      this.settingsCache.set(zoneId, nextSettings);
      return;
    }

    throw new Error("email routing must be enabled to continue");
  }

  private async ensureDestinationAddress(
    accountId: string,
    destinationEmail: string,
  ): Promise<CloudflareDestinationAddress> {
    const normalizedDestination = normalizeEmail(destinationEmail);
    const addresses = await this.getAddresses(accountId);
    const existingAddress = findAddressByEmail(addresses, normalizedDestination);

    if (existingAddress) {
      return existingAddress;
    }

    const createdAddress = await this.api.createDestinationAddress(accountId, normalizedDestination);

    await this.refreshAddresses(accountId);

    return createdAddress;
  }

  private async findRuleByAlias(zoneId: string, aliasEmail: string): Promise<CloudflareEmailRoutingRule | null> {
    const normalizedAlias = normalizeEmail(aliasEmail);
    const rules = await this.getRules(zoneId);
    const rule = rules.find((item) => tryGetRuleAlias(item) === normalizedAlias);

    if (rule) {
      return rule;
    }

    return null;
  }

  private async getSettings(zoneId: string): Promise<CloudflareEmailRoutingSettings> {
    const cachedSettings = this.settingsCache.get(zoneId);

    if (cachedSettings) {
      return cachedSettings;
    }

    return this.settingsCache.set(zoneId, await this.api.getEmailRoutingSettings(zoneId));
  }

  private async getAddresses(accountId: string): Promise<CloudflareDestinationAddress[]> {
    const cachedAddresses = this.addressesCache.get(accountId);

    if (cachedAddresses) {
      return cachedAddresses;
    }

    return this.addressesCache.set(accountId, await this.api.listDestinationAddresses(accountId));
  }

  private async getRules(zoneId: string): Promise<CloudflareEmailRoutingRule[]> {
    const cachedRules = this.rulesCache.get(zoneId);

    if (cachedRules) {
      return cachedRules;
    }

    return this.rulesCache.set(zoneId, await this.api.listRules(zoneId));
  }

  private async refreshRules(zoneId: string): Promise<void> {
    this.rulesCache.set(zoneId, await this.api.listRules(zoneId));
  }

  private async refreshAddresses(accountId: string): Promise<void> {
    this.addressesCache.set(accountId, await this.api.listDestinationAddresses(accountId));
  }

  private resolveEnabledState(currentValue: boolean, options: UpdateAliasOptions): boolean {
    if (options.enable) {
      return true;
    }

    if (options.disable) {
      return false;
    }

    return currentValue;
  }

  private toAliasSummary(
    domain: string,
    rule: CloudflareEmailRoutingRule,
    destination: CloudflareDestinationAddress,
  ): AliasSummary {
    const destinationVerified = Boolean(destination.verified);

    return {
      alias: getRuleAlias(rule),
      domain,
      destination: normalizeEmail(destination.email),
      destinationVerified,
      enabled: rule.enabled,
      ruleId: rule.id,
      status: destinationVerified ? "active" : "pending",
    };
  }
}
