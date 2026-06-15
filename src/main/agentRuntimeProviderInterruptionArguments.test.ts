import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  persistPreparedProviderInterruptionToolArguments,
  providerInterruptionArgumentParseStatus,
} from "./agentRuntimeProviderInterruptionArguments";

describe("agentRuntimeProviderInterruptionArguments", () => {
  it("persists prepared provider-interruption arguments with recovery metadata", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-provider-interruption-args-"));
    try {
      const inputText = JSON.stringify({ ok: true, value: "prepared" });
      const result = persistPreparedProviderInterruptionToolArguments({
        workspacePath,
        runId: "run one/../../bad",
        toolCallId: "tool call:1",
        inputText,
      });

      expect(result).toEqual({
        recoveryArgumentPath: join(
          workspacePath,
          ".ambient-codex/interrupted-tool-calls/run-one-..-..-bad/tool-call-1.prepared-args.txt",
        ),
        workspaceRelativeRecoveryArgumentPath:
          ".ambient-codex/interrupted-tool-calls/run-one-..-..-bad/tool-call-1.prepared-args.txt",
        recoveryArgumentSha256: createHash("sha256").update(inputText).digest("hex"),
        recoveryArgumentParseStatus: "valid_json",
      });
      await expect(readFile(result.recoveryArgumentPath!, "utf8")).resolves.toBe(inputText);
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("falls back to a stable safe segment when run and tool ids have no safe characters", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-provider-interruption-fallback-"));
    try {
      const result = persistPreparedProviderInterruptionToolArguments({
        workspacePath,
        runId: "###",
        toolCallId: "///",
        inputText: "plain text",
      });

      expect(result.workspaceRelativeRecoveryArgumentPath).toBe(
        ".ambient-codex/interrupted-tool-calls/tool-call/tool-call.prepared-args.txt",
      );
      expect(result.recoveryArgumentParseStatus).toBe("text");
      await expect(readFile(result.recoveryArgumentPath!, "utf8")).resolves.toBe("plain text");
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("classifies prepared argument parse status", () => {
    expect(providerInterruptionArgumentParseStatus("  {\"ok\":true}")).toBe("valid_json");
    expect(providerInterruptionArgumentParseStatus("[1,2,3]")).toBe("valid_json");
    expect(providerInterruptionArgumentParseStatus("{not json")).toBe("invalid_json");
    expect(providerInterruptionArgumentParseStatus("plain text {not parsed")).toBe("text");
  });
});
