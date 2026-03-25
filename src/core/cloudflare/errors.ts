import type { CloudflareApiError } from "../../types/cloudflare.ts";

export class CloudflareRequestError extends Error {
  public readonly status: number;
  public readonly errors: CloudflareApiError[];
  public readonly retriable: boolean;

  public constructor(message: string, status: number, errors: CloudflareApiError[] = [], retriable = false) {
    super(message);
    this.name = "CloudflareRequestError";
    this.status = status;
    this.errors = errors;
    this.retriable = retriable;
  }
}

export function createCloudflareRequestError(
  status: number,
  errors: CloudflareApiError[],
  fallbackMessage: string,
): CloudflareRequestError {
  const normalizedMessage = errors.map((item) => item.message.trim()).filter(Boolean).join("; ");
  const message = normalizedMessage || fallbackMessage;
  const retriable = status === 429 || status >= 500;

  return new CloudflareRequestError(message, status, errors, retriable);
}
