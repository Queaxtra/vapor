import { describe, expect, test } from "bun:test";
import { fitTerminalLine, sanitizeTerminalText } from "./sanitize.ts";

describe("sanitizeTerminalText", () => {
  test("removes ansi escape sequences and control characters", () => {
    expect(sanitizeTerminalText("\u001b[31malias@example.com\u001b[0m\r")).toBe("alias@example.com");
  });

  test("returns placeholder for empty sanitized values", () => {
    expect(sanitizeTerminalText("\u001b[31m\u001b[0m")).toBe("<invalid>");
  });

  test("fits long labels into a single terminal line", () => {
    expect(fitTerminalLine("very-long-alias@example.com -> inbox@example.net", 18)).toBe("very-long-alias...");
  });

  test("uses dots when width is too small for an ellipsis", () => {
    expect(fitTerminalLine("alias@example.com", 3)).toBe("...");
  });
});
