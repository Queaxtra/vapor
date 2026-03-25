import { homedir } from "node:os";
import { join } from "node:path";

export interface VaporPaths {
  rootDir: string;
  configFile: string;
  localKeyFile: string;
  localSecretFile: string;
}

export function createDefaultVaporPaths(rootDir?: string): VaporPaths {
  const resolvedRoot = rootDir ?? join(homedir(), ".vapor");

  return {
    rootDir: resolvedRoot,
    configFile: join(resolvedRoot, "config.json"),
    localKeyFile: join(resolvedRoot, "local.key"),
    localSecretFile: join(resolvedRoot, "secret.json"),
  };
}
