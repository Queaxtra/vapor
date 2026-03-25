import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { EncryptedSecretPayload } from "../../types/config.ts";

const KEY_LENGTH = 32;
const IV_LENGTH = 12;

export function generateEncryptionKey(): Buffer {
  return randomBytes(KEY_LENGTH);
}

export function encodeKey(key: Buffer): string {
  return key.toString("base64");
}

export function decodeKey(encodedKey: string): Buffer {
  const decoded = Buffer.from(encodedKey, "base64");

  if (decoded.length !== KEY_LENGTH) {
    throw new Error("invalid local encryption key");
  }

  return decoded;
}

export function encryptSecret(secret: string, key: Buffer): EncryptedSecretPayload {
  if (key.length !== KEY_LENGTH) {
    throw new Error("invalid encryption key length");
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptSecret(payload: EncryptedSecretPayload, key: Buffer): string {
  if (payload.algorithm !== "aes-256-gcm") {
    throw new Error("unsupported secret algorithm");
  }

  if (key.length !== KEY_LENGTH) {
    throw new Error("invalid encryption key length");
  }

  try {
    const iv = Buffer.from(payload.iv, "base64");
    const ciphertext = Buffer.from(payload.ciphertext, "base64");
    const tag = Buffer.from(payload.tag, "base64");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);

    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("failed to decrypt local secret");
  }
}
