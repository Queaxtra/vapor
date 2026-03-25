import { createDefaultVaporPaths, type VaporPaths } from "./paths.ts";
import type { DomainProfile, LoadedConfig, StoredConfig } from "../../types/config.ts";
import { SecretManager } from "../security/secret.ts";
import { pathExists, readUtf8File, writePrivateTextFile } from "../security/filesystem.ts";
import { normalizeDomain, normalizeEmail } from "../validation/input.ts";

function sortDomains(domains: DomainProfile[]): DomainProfile[] {
  return [...domains].sort((left, right) => left.domain.localeCompare(right.domain));
}

export class ConfigStore {
  private readonly paths: VaporPaths;
  private readonly secretManager: SecretManager;

  public constructor(paths = createDefaultVaporPaths(), secretManager = new SecretManager(paths)) {
    this.paths = paths;
    this.secretManager = secretManager;
  }

  public async exists(): Promise<boolean> {
    return pathExists(this.paths.configFile);
  }

  public async readConfig(): Promise<StoredConfig | null> {
    if (!(await this.exists())) {
      return null;
    }

    const rawConfig = JSON.parse(await readUtf8File(this.paths.configFile)) as StoredConfig;

    if (rawConfig.version !== 1) {
      throw new Error("unsupported vapor config version");
    }

    return {
      version: 1,
      secretStorage: rawConfig.secretStorage,
      domains: sortDomains(rawConfig.domains.map((domain) => this.normalizeDomainProfile(domain))),
    };
  }

  public async load(): Promise<LoadedConfig> {
    const config = await this.readConfig();

    if (config) {
      const token = await this.secretManager.readToken(config.secretStorage);
      return { config, token };
    }

    throw new Error("vapor is not configured");
  }

  public async initialize(input: {
    token: string;
    domains: DomainProfile[];
  }): Promise<StoredConfig> {
    const secretStorage = await this.secretManager.getPreferredProvider();
    const normalizedDomains = sortDomains(input.domains.map((domain) => this.normalizeDomainProfile(domain)));
    const config: StoredConfig = {
      version: 1,
      secretStorage,
      domains: normalizedDomains,
    };

    await this.secretManager.saveToken(input.token.trim(), secretStorage);
    await writePrivateTextFile(this.paths.configFile, JSON.stringify(config, null, 2));

    return config;
  }

  public async upsertDomain(domainProfile: DomainProfile): Promise<StoredConfig> {
    const config = await this.readConfig();

    if (!config) {
      throw new Error("vapor is not configured");
    }

    const normalized = this.normalizeDomainProfile(domainProfile);
    const filteredDomains = config.domains.filter((item) => item.domain !== normalized.domain);
    const nextConfig: StoredConfig = {
      version: 1,
      secretStorage: config.secretStorage,
      domains: sortDomains([...filteredDomains, normalized]),
    };

    await writePrivateTextFile(this.paths.configFile, JSON.stringify(nextConfig, null, 2));

    return nextConfig;
  }

  public async removeDomain(domain: string): Promise<boolean> {
    const config = await this.readConfig();

    if (!config) {
      throw new Error("vapor is not configured");
    }

    const normalizedDomain = normalizeDomain(domain);
    const nextDomains = config.domains.filter((item) => item.domain !== normalizedDomain);

    if (nextDomains.length === config.domains.length) {
      return false;
    }

    const nextConfig: StoredConfig = {
      version: 1,
      secretStorage: config.secretStorage,
      domains: sortDomains(nextDomains),
    };

    await writePrivateTextFile(this.paths.configFile, JSON.stringify(nextConfig, null, 2));

    return true;
  }

  public async findDomain(domain: string): Promise<DomainProfile | null> {
    const config = await this.readConfig();

    if (!config) {
      return null;
    }

    const normalizedDomain = normalizeDomain(domain);
    const profile = config.domains.find((item) => item.domain === normalizedDomain);

    if (profile) {
      return profile;
    }

    return null;
  }

  private normalizeDomainProfile(domainProfile: DomainProfile): DomainProfile {
    return {
      domain: normalizeDomain(domainProfile.domain),
      zoneId: domainProfile.zoneId.trim(),
      accountId: domainProfile.accountId.trim(),
      defaultDestination: normalizeEmail(domainProfile.defaultDestination),
    };
  }
}
