import { describe, expect, test } from "bun:test";
import { CloudflareEmailRoutingApi } from "./api.ts";

describe("CloudflareEmailRoutingApi", () => {
  test("resolveZone does not require an active filter to find the zone", async () => {
    const requests: Array<{ method: string; path: string; query: Record<string, string> }> = [];
    const client = {
      async request<T>(_method: string, _path: string, _body?: unknown, query: Record<string, string> = {}) {
        requests.push({ method: _method, path: _path, query });

        return [
          {
            id: "zone-1",
            name: "fatih.live",
            status: "active",
            account: { id: "account-1" },
          },
        ] as T;
      },
    };
    const api = new CloudflareEmailRoutingApi(client as never);

    await expect(api.resolveZone("fatih.live")).resolves.toMatchObject({
      id: "zone-1",
      name: "fatih.live",
    });
    expect(requests[0]?.query.status).toBeUndefined();
  });

  test("resolveZone explains token scope when no zone is visible", async () => {
    const client = {
      async request<T>() {
        return [] as T;
      },
    };
    const api = new CloudflareEmailRoutingApi(client as never);

    await expect(api.resolveZone("fatih.live")).rejects.toThrow("Zone Read permission");
  });

  test("listDestinationAddresses iterates through all pages", async () => {
    const client = {
      async request<T>(_method: string, path: string, _body?: unknown, query: Record<string, string> = {}) {
        if (path !== "accounts/account-1/email/routing/addresses") {
          return [] as T;
        }

        if (query.page === "1") {
          return Array.from({ length: 50 }, (_, index) => ({
            id: `addr-${index + 1}`,
            email: `user${index + 1}@example.net`,
            verified: "2026-01-01T00:00:00Z",
          })) as T;
        }

        return [
          {
            id: "addr-51",
            email: "user51@example.net",
            verified: "2026-01-01T00:00:00Z",
          },
        ] as T;
      },
    };
    const api = new CloudflareEmailRoutingApi(client as never);

    await expect(api.listDestinationAddresses("account-1")).resolves.toHaveLength(51);
  });

  test("listRules iterates through all pages", async () => {
    const client = {
      async request<T>(_method: string, path: string, _body?: unknown, query: Record<string, string> = {}) {
        if (path !== "zones/zone-1/email/routing/rules") {
          return [] as T;
        }

        if (query.page === "1") {
          return Array.from({ length: 50 }, (_, index) => ({
            id: `rule-${index + 1}`,
            name: `rule-${index + 1}`,
            enabled: true,
            actions: [{ type: "forward", value: [`user${index + 1}@example.net`] }],
            matchers: [{ type: "literal", field: "to", value: `alias${index + 1}@example.com` }],
          })) as T;
        }

        return [
          {
            id: "rule-51",
            name: "rule-51",
            enabled: true,
            actions: [{ type: "forward", value: ["user51@example.net"] }],
            matchers: [{ type: "literal", field: "to", value: "alias51@example.com" }],
          },
        ] as T;
      },
    };
    const api = new CloudflareEmailRoutingApi(client as never);

    await expect(api.listRules("zone-1")).resolves.toHaveLength(51);
  });
});
