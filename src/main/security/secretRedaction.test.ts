import { describe, expect, it } from "vitest";

import { redactSensitiveText } from "./secretRedaction";

describe("secretRedaction", () => {
  it("redacts Ambient token-shaped values outside paths", () => {
    expect(redactSensitiveText("api ambient-abcdefghijklmnopqrstuvwxyz012345")).toBe("api [REDACTED]");
    expect(redactSensitiveText("url https://example.invalid/ambient-abcdefghijklmnopqrstuvwxyz012345/next")).toBe(
      "url https://example.invalid/[REDACTED]/next",
    );
    expect(redactSensitiveText("api ambient-chat-export-abcdefghijklmnopqrstuvwxyz")).toBe("api [REDACTED]");
    expect(redactSensitiveText("url https://example.invalid/ambient-chat-export-abcdefghijklmnopqrstuvwxyz/next")).toBe(
      "url https://example.invalid/[REDACTED]/next",
    );
    expect(redactSensitiveText("url \"https://example.invalid/ambient-chat-export-abcdefghijklmnopqrstuvwxyz/next\"")).toBe(
      "url \"https://example.invalid/[REDACTED]/next\"",
    );
    expect(redactSensitiveText("url (https://example.invalid/ambient-chat-export-abcdefghijklmnopqrstuvwxyz/next)")).toBe(
      "url (https://example.invalid/[REDACTED]/next)",
    );
  });

  it("redacts slash-prefixed token-shaped secrets", () => {
    expect(redactSensitiveText("url https://example.invalid/sk-abcdefghijklmnopqrstuvwxyz")).toBe(
      "url https://example.invalid/[REDACTED]",
    );
    expect(redactSensitiveText("url https://example.invalid/sk-abcdefghijklmnopqrstuvwxyz/next")).toBe(
      "url https://example.invalid/[REDACTED]/next",
    );
    expect(redactSensitiveText("path /sk-abcdefghijklmnopqrstuvwxyz")).toBe("path /[REDACTED]");
  });

  it("does not redact ordinary filesystem path segments that start with ambient", () => {
    const absolutePath = "/tmp/ambient-chat-export-AbCdEfGhIjKl/src/index.ts";
    const relativePath = "ambient-chat-export-AbCdEfGhIjKl/src/index.ts";
    const setupPath = "/tmp/ambient-provider-setup.EQJETU/visible-transcript.md";

    expect(redactSensitiveText(`open ${absolutePath}`)).toBe(`open ${absolutePath}`);
    expect(redactSensitiveText(`open ${relativePath}`)).toBe(`open ${relativePath}`);
    expect(redactSensitiveText(`open ${setupPath}`)).toBe(`open ${setupPath}`);
  });
});
