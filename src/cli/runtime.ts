import type { ConfigStore } from "../core/config/store.ts";
import type { LoadedConfig } from "../types/config.ts";
import type { PromptAdapter } from "../types/cli.ts";
import type { CliOutput } from "./output.ts";
import type { MailRoutingService } from "../core/mail-routing/service.ts";

export type CommandService = Pick<
  MailRoutingService,
  "bootstrapDomain" | "createAlias" | "updateAlias" | "deleteAlias" | "listAliases" | "getStatus"
>;

export interface ConfiguredCommandRuntime {
  prompts: PromptAdapter;
  output: CliOutput;
  store: ConfigStore;
  loaded: LoadedConfig;
  service: CommandService;
}
