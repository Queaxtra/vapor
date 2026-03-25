import { access, chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { constants } from "node:fs";

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function ensurePrivateDirectory(path: string): Promise<void> {
  try {
    await mkdir(path, { recursive: true, mode: 0o700 });
    await chmod(path, 0o700);
  } catch (error) {
    throw new Error(`failed to prepare private directory: ${String(error)}`);
  }
}

export async function writePrivateTextFile(path: string, contents: string): Promise<void> {
  const directory = dirname(path);
  const temporaryPath = `${path}.tmp`;

  try {
    await ensurePrivateDirectory(directory);
    await writeFile(temporaryPath, contents, { mode: 0o600 });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, path);
    await chmod(path, 0o600);
  } catch (error) {
    throw new Error(`failed to write private file: ${String(error)}`);
  }
}

export async function readUtf8File(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`failed to read file: ${String(error)}`);
  }
}

export async function removeFileIfPresent(path: string): Promise<void> {
  try {
    await rm(path, { force: true });
  } catch (error) {
    throw new Error(`failed to remove file: ${String(error)}`);
  }
}
