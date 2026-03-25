import { createDefaultVaporPaths, type VaporPaths } from "../config/paths.ts";
import { decodeKey, decryptSecret, encodeKey, encryptSecret, generateEncryptionKey } from "./crypto.ts";
import { pathExists, readUtf8File, removeFileIfPresent, writePrivateTextFile } from "./filesystem.ts";
import { MacOsKeychain } from "./keychain.ts";
import type { EncryptedSecretPayload, SecretStorageProvider } from "../../types/config.ts";

export const VAPOR_TOKEN_ENV_KEY = "VAPOR_CLOUDFLARE_TOKEN";

export class SecretManager {
  private readonly paths: VaporPaths;
  private readonly keychain: MacOsKeychain;

  public constructor(paths = createDefaultVaporPaths(), keychain = new MacOsKeychain()) {
    this.paths = paths;
    this.keychain = keychain;
  }

  public async getPreferredProvider(): Promise<SecretStorageProvider> {
    const supported = await this.keychain.isSupported();

    if (supported) {
      return "keychain";
    }

    return "env";
  }

  public async saveToken(token: string, provider: SecretStorageProvider): Promise<void> {
    if (provider === "keychain") {
      await this.keychain.save(token);
      await removeFileIfPresent(this.paths.localSecretFile);
      await removeFileIfPresent(this.paths.localKeyFile);
      return;
    }

    if (provider === "env") {
      await removeFileIfPresent(this.paths.localSecretFile);
      await removeFileIfPresent(this.paths.localKeyFile);
      return;
    }

    const key = await this.getOrCreateLocalKey();
    const payload = encryptSecret(token, key);

    await writePrivateTextFile(this.paths.localSecretFile, JSON.stringify(payload, null, 2));
  }

  public async readToken(provider: SecretStorageProvider): Promise<string> {
    if (provider === "keychain") {
      const token = await this.keychain.read();

      if (token) {
        return token;
      }

      throw new Error("cloudflare token is not available in the local keychain");
    }

    if (provider === "env") {
      const token = process.env[VAPOR_TOKEN_ENV_KEY]?.trim();

      if (token) {
        return token;
      }

      throw new Error(`cloudflare token is not available. set ${VAPOR_TOKEN_ENV_KEY} before running vapor`);
    }

    if (!(await pathExists(this.paths.localSecretFile))) {
      throw new Error("local encrypted token was not found");
    }

    const key = await this.getOrCreateLocalKey();
    const payload = JSON.parse(await readUtf8File(this.paths.localSecretFile)) as EncryptedSecretPayload;

    return decryptSecret(payload, key);
  }

  public async clear(provider: SecretStorageProvider): Promise<void> {
    if (provider === "keychain") {
      await this.keychain.remove();
      return;
    }

    if (provider === "env") {
      return;
    }

    await removeFileIfPresent(this.paths.localSecretFile);
  }

  private async getOrCreateLocalKey(): Promise<Buffer> {
    if (await pathExists(this.paths.localKeyFile)) {
      return decodeKey(await readUtf8File(this.paths.localKeyFile));
    }

    const key = generateEncryptionKey();

    await writePrivateTextFile(this.paths.localKeyFile, encodeKey(key));

    return key;
  }
}
