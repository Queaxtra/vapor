import { describe, expect, test } from "bun:test";
import { CloudflareClient, type FetchLike } from "./client.ts";

describe("CloudflareClient", () => {
  test("keeps the client v4 prefix when the request path starts with a slash", async () => {
    let requestedUrl = "";
    const fetcher: FetchLike = async (input) => {
      requestedUrl = input instanceof URL ? input.toString() : String(input);

      return new Response(
        JSON.stringify({
          success: true,
          result: { ok: true },
          errors: [],
          messages: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const client = new CloudflareClient({
      apiToken: "token",
      fetcher,
      maxRetries: 0,
      timeoutMs: 50,
    });

    await expect(client.request("GET", "/zones")).resolves.toEqual({ ok: true });
    expect(requestedUrl).toBe("https://api.cloudflare.com/client/v4/zones");
  });

  test("supports slashless request paths too", async () => {
    let requestedUrl = "";
    const fetcher: FetchLike = async (input) => {
      requestedUrl = input instanceof URL ? input.toString() : String(input);

      return new Response(
        JSON.stringify({
          success: true,
          result: { ok: true },
          errors: [],
          messages: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const client = new CloudflareClient({
      apiToken: "token",
      fetcher,
      maxRetries: 0,
      timeoutMs: 50,
    });

    await expect(client.request("GET", "zones")).resolves.toEqual({ ok: true });
    expect(requestedUrl).toBe("https://api.cloudflare.com/client/v4/zones");
  });

  test("retries retriable responses", async () => {
    let callCount = 0;
    const fetcher: FetchLike = async () => {
      callCount += 1;

      if (callCount === 1) {
        return new Response(
          JSON.stringify({
            success: false,
            result: null,
            errors: [{ code: 10000, message: "rate limited" }],
            messages: [],
          }),
          { status: 429, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          result: { id: "zone-1" },
          errors: [],
          messages: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const client = new CloudflareClient({
      apiToken: "token",
      fetcher,
      maxRetries: 1,
      timeoutMs: 50,
    });

    await expect(client.request<{ id: string }>("GET", "zones")).resolves.toEqual({ id: "zone-1" });
    expect(callCount).toBe(2);
  });

  test("throws on non-retriable responses", async () => {
    const fetcher: FetchLike = async () =>
      new Response(
        JSON.stringify({
          success: false,
          result: null,
          errors: [{ code: 1001, message: "forbidden" }],
          messages: [],
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    const client = new CloudflareClient({
      apiToken: "token",
      fetcher,
      maxRetries: 0,
      timeoutMs: 50,
    });

    await expect(client.request("GET", "zones")).rejects.toThrow("forbidden");
  });
});
