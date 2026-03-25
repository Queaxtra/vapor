// Unit tests for command-line argument parser
import { describe, expect, test } from "bun:test";
import { parseCommand } from "./parser.ts";

describe("parseCommand", () => {
  test("parses create command with destination override", () => {
    expect(parseCommand(["create", "alias@example.com", "--to", "dest@example.net"])).toEqual({
      name: "create",
      target: "alias@example.com",
      destination: "dest@example.net",
    });
  });

  test("parses domain add command", () => {
    expect(parseCommand(["domain", "add", "example.com", "--to", "dest@example.net"])).toEqual({
      name: "domain-add",
      domain: "example.com",
      destination: "dest@example.net",
      interactive: undefined,
      help: undefined,
    });
  });

  test("accepts interactive flag for mutation commands", () => {
    expect(parseCommand(["create", "--interactive"])).toEqual({
      name: "create",
      interactive: true,
    });
  });

  test("rejects interactive flag for read-only commands", () => {
    expect(() => parseCommand(["list", "--interactive"])).toThrow("unknown option: --interactive");
  });

  test("allows missing targets for interactive mutation flows", () => {
    expect(parseCommand(["update"])).toEqual({
      name: "update",
    });
    expect(parseCommand(["delete"])).toEqual({
      name: "delete",
    });
    expect(parseCommand(["domain", "remove"])).toEqual({
      name: "domain-remove",
      domain: undefined,
      interactive: undefined,
      help: undefined,
    });
  });

  test("rejects conflicting update flags", () => {
    expect(() => parseCommand(["update", "alias@example.com", "--enable", "--disable"])).toThrow(
      "cannot use --enable and --disable together",
    );
  });
});
