import { describe, expect, test } from "bun:test";
import { runConfiguredCommand } from "./commands.ts";
import type { LoadedConfig } from "../types/config.ts";
import type { PromptAdapter, SelectOption } from "../types/cli.ts";

class FakePrompts implements PromptAdapter {
  public readonly asks: string[] = [];
  public readonly optionalAsks: Array<{ question: string; defaultValue?: string }> = [];
  public readonly selects: Array<{ question: string; options: SelectOption[] }> = [];
  private readonly askAnswers: string[];
  private readonly askOptionalAnswers: string[];
  private readonly selectAnswers: string[];
  private readonly confirmAnswers: boolean[];

  public constructor(input: {
    askAnswers?: string[];
    askOptionalAnswers?: string[];
    selectAnswers?: string[];
    confirmAnswers?: boolean[];
  } = {}) {
    this.askAnswers = input.askAnswers ?? [];
    this.askOptionalAnswers = input.askOptionalAnswers ?? [];
    this.selectAnswers = input.selectAnswers ?? [];
    this.confirmAnswers = input.confirmAnswers ?? [];
  }

  public async ask(question: string): Promise<string> {
    this.asks.push(question);
    return this.askAnswers.shift() ?? "";
  }

  public async askOptional(question: string, defaultValue?: string): Promise<string> {
    this.optionalAsks.push({ question, defaultValue });
    return this.askOptionalAnswers.shift() ?? defaultValue ?? "";
  }

  public async askSecret(): Promise<string> {
    return "";
  }

  public async confirm(): Promise<boolean> {
    return this.confirmAnswers.shift() ?? false;
  }

  public async select(question: string, options: SelectOption[]): Promise<string> {
    this.selects.push({ question, options });
    return this.selectAnswers.shift() ?? options[0]?.value ?? "";
  }
}

class FakeOutput {
  public readonly infos: string[] = [];
  public readonly successes: string[] = [];
  public readonly warnings: string[] = [];

  public info(message: string): void {
    this.infos.push(message);
  }

  public success(message: string): void {
    this.successes.push(message);
  }

  public warn(message: string): void {
    this.warnings.push(message);
  }

  public printAliases(): void {}

  public printAliasStatus(): void {}

  public printDomainStatuses(): void {}

  public printDomainStatus(): void {}

  public printWizardHeader(title: string): void {
    this.infos.push(`header:${title}`);
  }

  public printWizardSummary(lines: string[]): void {
    this.infos.push(`summary:${lines.join("|")}`);
  }
}

function createLoadedConfig(): LoadedConfig {
  return {
    token: "token",
    config: {
      version: 1,
      secretStorage: "env",
      domains: [
        {
          domain: "example.com",
          zoneId: "zone-1",
          accountId: "account-1",
          defaultDestination: "default@example.net",
        },
      ],
    },
  };
}

describe("runConfiguredCommand", () => {
  test("prompts for create inputs when alias is missing", async () => {
    const prompts = new FakePrompts({
      askAnswers: ["test"],
      askOptionalAnswers: ["custom@example.net"],
    });
    const output = new FakeOutput();
    const calls: Array<{ alias: string; destination?: string }> = [];
    const service = {
      async createAlias(_profile: unknown, alias: string, destination?: string) {
        calls.push({ alias, destination });
        return {
          alias,
          domain: "example.com",
          destination: destination ?? "custom@example.net",
          destinationVerified: true,
          enabled: true,
          ruleId: "rule-1",
          status: "active" as const,
        };
      },
    };

    await runConfiguredCommand(
      { name: "create" },
      {
        prompts,
        output: output as never,
        store: {} as never,
        loaded: createLoadedConfig(),
        service: service as never,
      },
    );

    expect(calls).toEqual([{ alias: "test@example.com", destination: "custom@example.net" }]);
  });

  test("keeps direct create non-interactive when alias is provided", async () => {
    const prompts = new FakePrompts();
    const output = new FakeOutput();
    const calls: string[] = [];
    const service = {
      async createAlias(_profile: unknown, alias: string) {
        calls.push(alias);
        return {
          alias,
          domain: "example.com",
          destination: "default@example.net",
          destinationVerified: true,
          enabled: true,
          ruleId: "rule-1",
          status: "active" as const,
        };
      },
    };

    await runConfiguredCommand(
      { name: "create", target: "direct@example.com" },
      {
        prompts,
        output: output as never,
        store: {} as never,
        loaded: createLoadedConfig(),
        service: service as never,
      },
    );

    expect(calls).toEqual(["direct@example.com"]);
    expect(prompts.asks).toHaveLength(0);
  });

  test("updates aliases through interactive selection", async () => {
    const prompts = new FakePrompts({
      selectAnswers: ["first@example.com", "disable"],
      askOptionalAnswers: ["next@example.net"],
    });
    const output = new FakeOutput();
    const calls: Array<{ alias: string; destination?: string; enable?: boolean; disable?: boolean }> = [];
    const service = {
      async listAliases() {
        return [
          {
            alias: "first@example.com",
            domain: "example.com",
            destination: "default@example.net",
            destinationVerified: true,
            enabled: true,
            ruleId: "rule-1",
            status: "active" as const,
          },
        ];
      },
      async updateAlias(_profile: unknown, alias: string, options: { destination?: string; enable?: boolean; disable?: boolean }) {
        calls.push({ alias, ...options });
        return {
          alias,
          domain: "example.com",
          destination: options.destination ?? "default@example.net",
          destinationVerified: true,
          enabled: false,
          ruleId: "rule-1",
          status: "active" as const,
        };
      },
    };

    await runConfiguredCommand(
      { name: "update" },
      {
        prompts,
        output: output as never,
        store: {} as never,
        loaded: createLoadedConfig(),
        service: service as never,
      },
    );

    expect(calls).toEqual([
      {
        alias: "first@example.com",
        destination: "next@example.net",
        enable: false,
        disable: true,
      },
    ]);
  });

  test("requires confirmation for interactive delete", async () => {
    const prompts = new FakePrompts({
      selectAnswers: ["first@example.com", "yes"],
      confirmAnswers: [true],
    });
    const output = new FakeOutput();
    const calls: Array<{ alias: string; pruneDestination: boolean }> = [];
    const service = {
      async listAliases() {
        return [
          {
            alias: "first@example.com",
            domain: "example.com",
            destination: "default@example.net",
            destinationVerified: true,
            enabled: true,
            ruleId: "rule-1",
            status: "active" as const,
          },
        ];
      },
      async deleteAlias(_profile: unknown, alias: string, pruneDestination: boolean) {
        calls.push({ alias, pruneDestination });
      },
    };

    await runConfiguredCommand(
      { name: "delete" },
      {
        prompts,
        output: output as never,
        store: {} as never,
        loaded: createLoadedConfig(),
        service: service as never,
      },
    );

    expect(calls).toEqual([{ alias: "first@example.com", pruneDestination: true }]);
  });

  test("keeps direct domain add non-interactive when inputs are complete", async () => {
    const prompts = new FakePrompts();
    const output = new FakeOutput();
    const calls: Array<{ domain: string; destination: string }> = [];
    const service = {
      async bootstrapDomain(input: {
        domain: string;
        defaultDestination: string;
      }) {
        calls.push({ domain: input.domain, destination: input.defaultDestination });
        return {
          profile: {
            domain: input.domain,
            zoneId: "zone-1",
            accountId: "account-1",
            defaultDestination: input.defaultDestination,
          },
          destinationVerified: true,
          routingEnabled: true,
        };
      },
    };
    const store = {
      async upsertDomain() {},
    };

    await runConfiguredCommand(
      { name: "domain-add", domain: "example.com", destination: "inbox@example.net" },
      {
        prompts,
        output: output as never,
        store: store as never,
        loaded: createLoadedConfig(),
        service: service as never,
      },
    );

    expect(calls).toEqual([{ domain: "example.com", destination: "inbox@example.net" }]);
    expect(prompts.asks).toHaveLength(0);
    expect(prompts.optionalAsks).toHaveLength(0);
    expect(output.infos).not.toContain("header:Interactive Domain Add");
  });
});
