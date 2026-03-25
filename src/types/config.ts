export type SecretStorageProvider = "keychain" | "env" | "local";

export interface DomainProfile {
  domain: string;
  zoneId: string;
  accountId: string;
  defaultDestination: string;
}

export interface StoredConfig {
  version: 1;
  secretStorage: SecretStorageProvider;
  domains: DomainProfile[];
}

export interface EncryptedSecretPayload {
  algorithm: "aes-256-gcm";
  iv: string;
  ciphertext: string;
  tag: string;
}

export interface LoadedConfig {
  config: StoredConfig;
  token: string;
}
