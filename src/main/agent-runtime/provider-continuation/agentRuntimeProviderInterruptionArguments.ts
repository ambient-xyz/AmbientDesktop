import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { InterruptedToolCallRecoverySnapshot } from "../../../shared/threadTypes";
import type { ProviderInterruptionToolSnapshot } from "./agentRuntimeProviderContinuationHelpers";

const PROVIDER_INTERRUPTION_ARGUMENT_DIRECTORY = ".ambient-codex/interrupted-tool-calls";

export function persistPreparedProviderInterruptionToolArguments(input: {
  workspacePath: string;
  runId: string;
  toolCallId: string;
  inputText: string;
}): Pick<
  ProviderInterruptionToolSnapshot,
  "recoveryArgumentPath" | "workspaceRelativeRecoveryArgumentPath" | "recoveryArgumentSha256" | "recoveryArgumentParseStatus"
> {
  const dir = join(
    input.workspacePath,
    PROVIDER_INTERRUPTION_ARGUMENT_DIRECTORY,
    safeProviderInterruptionPathSegment(input.runId),
  );
  const argumentPath = join(dir, `${safeProviderInterruptionPathSegment(input.toolCallId)}.prepared-args.txt`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(argumentPath, input.inputText, "utf8");
  return {
    recoveryArgumentPath: argumentPath,
    workspaceRelativeRecoveryArgumentPath: relative(input.workspacePath, argumentPath).replace(/\\/g, "/"),
    recoveryArgumentSha256: createHash("sha256").update(input.inputText).digest("hex"),
    recoveryArgumentParseStatus: providerInterruptionArgumentParseStatus(input.inputText),
  };
}

export function providerInterruptionArgumentParseStatus(
  value: string,
): InterruptedToolCallRecoverySnapshot["parseStatus"] {
  if (!value.trim().startsWith("{") && !value.trim().startsWith("[")) return "text";
  try {
    JSON.parse(value);
    return "valid_json";
  } catch {
    return "invalid_json";
  }
}

function safeProviderInterruptionPathSegment(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96);
  return cleaned || "tool-call";
}
