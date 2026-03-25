import { describe, expect, test } from "bun:test";
import {
  assertAliasBelongsToDomain,
  assertDestinationOutsideDomain,
  extractDomainFromEmail,
  normalizeDomain,
  normalizeEmail,
} from "./input.ts";

describe("input validation", () => {
  test("normalizes valid email and domain", () => {
    expect(normalizeEmail(" Alias@Example.com ")).toBe("alias@example.com");
    expect(normalizeDomain(" Example.com ")).toBe("example.com");
  });

  test("rejects invalid alias domain combinations", () => {
    expect(() => assertAliasBelongsToDomain("alias@example.org", "example.com")).toThrow(
      "alias does not belong to the configured domain",
    );
  });

  test("extracts domain from email", () => {
    expect(extractDomainFromEmail("alias@example.com")).toBe("example.com");
  });

  test("rejects destinations on the managed domain", () => {
    expect(() => assertDestinationOutsideDomain("inbox@example.com", "example.com")).toThrow(
      "destination inbox must not use the same managed domain",
    );
  });
});
