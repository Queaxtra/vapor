import { describe, expect, test } from "bun:test";
import { MailRoutingService } from "./service.ts";

function createApiFixture() {
  const addresses = [
    {
      id: "addr-1",
      email: "dest@example.net",
      verified: null,
    },
  ];
  const rules: {
    id: string;
    name: string;
    enabled: boolean;
    actions: { type: string; value?: string[] }[];
    matchers: { type: string; field: string; value: string }[];
  }[] = [];

  return {
    addresses,
    rules,
    async resolveZone() {
      return {
        id: "zone-1",
        name: "example.com",
        account: { id: "account-1" },
      };
    },
    async getEmailRoutingSettings() {
      return {
        id: "zone-1",
        name: "example.com",
        enabled: true,
      };
    },
    async getEmailRoutingDns() {
      return [];
    },
    async enableEmailRouting() {
      return {
        id: "zone-1",
        name: "example.com",
        enabled: true,
      };
    },
    async listDestinationAddresses() {
      return addresses;
    },
    async createDestinationAddress(_accountId: string, email: string) {
      const created = {
        id: `addr-${addresses.length + 1}`,
        email,
        verified: null,
      };

      addresses.push(created);

      return created;
    },
    async deleteDestinationAddress(_accountId: string, addressId: string) {
      const index = addresses.findIndex((item) => item.id === addressId);

      if (index >= 0) {
        addresses.splice(index, 1);
      }
    },
    async listRules() {
      return rules;
    },
    async createRule(_zoneId: string, aliasEmail: string, destinationEmail: string, enabled: boolean) {
      const created = {
        id: `rule-${rules.length + 1}`,
        name: aliasEmail,
        enabled,
        actions: [{ type: "forward", value: [destinationEmail] }],
        matchers: [{ type: "literal", field: "to", value: aliasEmail }],
      };

      rules.push(created);

      return created;
    },
    async updateRule(_zoneId: string, ruleId: string, aliasEmail: string, destinationEmail: string, enabled: boolean) {
      const rule = rules.find((item) => item.id === ruleId);

      if (!rule) {
        throw new Error("rule not found");
      }

      rule.name = aliasEmail;
      rule.enabled = enabled;
      rule.actions = [{ type: "forward", value: [destinationEmail] }];
      rule.matchers = [{ type: "literal", field: "to", value: aliasEmail }];

      return rule;
    },
    async deleteRule(_zoneId: string, ruleId: string) {
      const index = rules.findIndex((item) => item.id === ruleId);

      if (index >= 0) {
        rules.splice(index, 1);
      }
    },
  };
}

describe("MailRoutingService", () => {
  test("creates aliases with pending verification when destination is not verified", async () => {
    const api = createApiFixture();
    const service = new MailRoutingService(api as never);

    const summary = await service.createAlias(
      {
        domain: "example.com",
        zoneId: "zone-1",
        accountId: "account-1",
        defaultDestination: "dest@example.net",
      },
      "alias@example.com",
    );

    expect(summary.alias).toBe("alias@example.com");
    expect(summary.status).toBe("pending");
    expect(api.rules).toHaveLength(1);
  });

  test("updates aliases and toggles state", async () => {
    const api = createApiFixture();
    const service = new MailRoutingService(api as never);

    await service.createAlias(
      {
        domain: "example.com",
        zoneId: "zone-1",
        accountId: "account-1",
        defaultDestination: "dest@example.net",
      },
      "alias@example.com",
    );

    const updated = await service.updateAlias(
      {
        domain: "example.com",
        zoneId: "zone-1",
        accountId: "account-1",
        defaultDestination: "dest@example.net",
      },
      "alias@example.com",
      {
        destination: "next@example.net",
        disable: true,
      },
    );

    expect(updated.destination).toBe("next@example.net");
    expect(updated.enabled).toBe(false);
  });

  test("prunes destination only when unused", async () => {
    const api = createApiFixture();
    const service = new MailRoutingService(api as never);
    const profile = {
      domain: "example.com",
      zoneId: "zone-1",
      accountId: "account-1",
      defaultDestination: "dest@example.net",
    };

    await service.createAlias(profile, "first@example.com");
    await service.createAlias(profile, "second@example.com");
    await service.deleteAlias(profile, "first@example.com", true);

    expect(api.addresses).toHaveLength(1);

    await service.deleteAlias(profile, "second@example.com", true);

    expect(api.addresses).toHaveLength(0);
  });

  test("ignores catch-all rules without alias matchers", async () => {
    const api = createApiFixture();
    const service = new MailRoutingService(api as never);

    api.rules.push({
      id: "catch-all",
      name: "catch-all",
      enabled: true,
      actions: [{ type: "forward", value: ["dest@example.net"] }],
      matchers: [{ type: "all", field: "", value: "" }],
    });

    const summary = await service.createAlias(
      {
        domain: "example.com",
        zoneId: "zone-1",
        accountId: "account-1",
        defaultDestination: "dest@example.net",
      },
      "alias@example.com",
    );

    expect(summary.alias).toBe("alias@example.com");
    expect(api.rules).toHaveLength(2);
  });

  test("rejects self-forwarding defaults during bootstrap", async () => {
    const api = createApiFixture();
    const service = new MailRoutingService(api as never);

    await expect(
      service.bootstrapDomain({
        domain: "example.com",
        defaultDestination: "hi@example.com",
        confirmEnable: async () => true,
      }),
    ).rejects.toThrow("destination inbox must not use the same managed domain");
  });

  test("rejects self-forwarding alias destinations", async () => {
    const api = createApiFixture();
    const service = new MailRoutingService(api as never);

    await expect(
      service.createAlias(
        {
          domain: "example.com",
          zoneId: "zone-1",
          accountId: "account-1",
          defaultDestination: "alias@example.com",
        },
        "alias@example.com",
      ),
    ).rejects.toThrow("destination inbox must not use the same managed domain");
  });
});
