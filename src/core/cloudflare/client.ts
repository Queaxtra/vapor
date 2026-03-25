import { setTimeout as sleep } from "node:timers/promises";
import type { CloudflareApiError, CloudflareEnvelope } from "../../types/cloudflare.ts";
import { CloudflareRequestError, createCloudflareRequestError } from "./errors.ts";

export interface CloudflareClientOptions {
  apiToken: string;
  baseUrl?: string;
  fetcher?: FetchLike;
  maxRetries?: number;
  timeoutMs?: number;
}

export type FetchLike = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

function normalizeBaseUrl(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.trim();

  if (!normalizedBaseUrl) {
    throw new Error("cloudflare base url is required");
  }

  if (normalizedBaseUrl.endsWith("/")) {
    return normalizedBaseUrl;
  }

  return `${normalizedBaseUrl}/`;
}

function buildRequestUrl(baseUrl: string, path: string): URL {
  const normalizedPath = path.trim();

  if (!normalizedPath) {
    throw new Error("cloudflare request path is required");
  }

  if (normalizedPath.startsWith("https://") || normalizedPath.startsWith("http://")) {
    return new URL(normalizedPath);
  }

  return new URL(normalizedPath.replace(/^\/+/, ""), baseUrl);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEnvelope<T>(payload: unknown): CloudflareEnvelope<T> {
  if (!isRecord(payload)) {
    throw new Error("cloudflare returned an invalid response payload");
  }

  if (typeof payload.success !== "boolean") {
    throw new Error("cloudflare response is missing success status");
  }

  if (!Array.isArray(payload.errors)) {
    throw new Error("cloudflare response is missing error metadata");
  }

  if (!Array.isArray(payload.messages)) {
    throw new Error("cloudflare response is missing message metadata");
  }

  if (!("result" in payload)) {
    throw new Error("cloudflare response is missing result payload");
  }

  return payload as unknown as CloudflareEnvelope<T>;
}

function shouldRetry(status: number, error?: unknown): boolean {
  if (status === 429 || status >= 500) {
    return true;
  }

  if (error instanceof CloudflareRequestError && error.retriable) {
    return true;
  }

  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }

  return false;
}

export class CloudflareClient {
  private readonly apiToken: string;
  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  public constructor(options: CloudflareClientOptions) {
    this.apiToken = options.apiToken.trim();
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? "https://api.cloudflare.com/client/v4");
    this.fetcher = options.fetcher ?? fetch;
    this.maxRetries = options.maxRetries ?? 3;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  public async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query: Record<string, string> = {},
  ): Promise<T> {
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      try {
        return await this.performRequest<T>(method, path, body, query);
      } catch (error) {
        const status = error instanceof CloudflareRequestError ? error.status : 0;

        if (!shouldRetry(status, error)) {
          throw error;
        }

        if (attempt >= this.maxRetries) {
          throw error;
        }

        const delayMs = Math.min(250 * 2 ** attempt + Math.floor(Math.random() * 75), 2_000);

        await sleep(delayMs);

        attempt += 1;
      }
    }

    throw new Error("unreachable cloudflare retry state");
  }

  private async performRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    query: Record<string, string> = {},
  ): Promise<T> {
    const url = buildRequestUrl(this.baseUrl, path);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    Object.entries(query).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    try {
      const response = await this.fetcher(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const responseText = await response.text();

      if (!responseText && response.ok) {
        return undefined as T;
      }

      const payload = parseEnvelope<T>(JSON.parse(responseText));

      if (response.ok && payload.success) {
        return payload.result;
      }

      throw createCloudflareRequestError(
        response.status,
        payload.errors as CloudflareApiError[],
        `cloudflare request failed with status ${response.status}`,
      );
    } catch (error) {
      if (error instanceof CloudflareRequestError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new CloudflareRequestError("cloudflare request timed out", 0, [], true);
      }

      throw new CloudflareRequestError(`cloudflare request failed: ${String(error)}`, 0, [], true);
    } finally {
      clearTimeout(timeout);
    }
  }
}
