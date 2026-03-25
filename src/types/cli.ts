export type CommandName =
  | "help"
  | "init"
  | "self-update"
  | "create"
  | "update"
  | "delete"
  | "list"
  | "status"
  | "domain-add"
  | "domain-remove"
  | "domain-list";

export interface SelectOption {
  label: string;
  value: string;
}

export interface ParsedCommand {
  name: CommandName;
  target?: string;
  destination?: string;
  domain?: string;
  enable?: boolean;
  disable?: boolean;
  pruneDestination?: boolean;
  interactive?: boolean;
  help?: boolean;
}

export interface PromptAdapter {
  ask(question: string): Promise<string>;
  askOptional(question: string, defaultValue?: string): Promise<string>;
  askSecret(question: string): Promise<string>;
  confirm(question: string): Promise<boolean>;
  select(question: string, options: SelectOption[]): Promise<string>;
}
