import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import type { AgentToolResult, ExtensionFactory } from "@mariozechner/pi-coding-agent";

import {
  createAmbientWriteOperations,
  type AmbientFileAuthorityRequester,
} from "./piReadOperations";
import { isPathInside } from "./sessionPaths";
import {
  commonOverlapChars,
  parseRecoveryApplyWriteSuffixArgs,
  parseSavedWriteArgs,
  type ParsedSavedWriteArgs,
} from "./interruptedWriteRecoveryArgs";

export const RECOVERY_READ_TOOL_NAME = "recovery_read_interrupted_tool_call";
export const RECOVERY_APPLY_WRITE_SUFFIX_TOOL_NAME = "recovery_apply_interrupted_write_suffix";
export const INTERRUPTED_TOOL_CALL_RECOVERY_TOOL_NAMES = [
  RECOVERY_READ_TOOL_NAME,
  RECOVERY_APPLY_WRITE_SUFFIX_TOOL_NAME,
] as const;

export interface InterruptedToolCallRecoveryToolExtensionOptions {
  workspacePath: string;
  readAuthorityRootPaths: () => string[];
  writeAuthorityRootPaths: () => string[];
  includeWorkspaceRootAuthority?: () => boolean;
  requestFileAuthority?: AmbientFileAuthorityRequester;
}

export function createInterruptedToolCallRecoveryToolExtension(
  options: InterruptedToolCallRecoveryToolExtensionOptions,
): ExtensionFactory {
  return (pi) => {
    pi.registerTool({
      name: RECOVERY_READ_TOOL_NAME,
      label: "Recovery Read Interrupted Tool Call",
      description:
        "Read exact Ambient-owned partial arguments for an interrupted tool call by runId and toolCallId. Use only when Ambient recovery instructions provide these ids.",
      promptSnippet:
        "recovery_read_interrupted_tool_call: Exact reader for interrupted tool-call arguments. Prefer this over bash, generic read, or guessed paths during recovery.",
      parameters: {
        type: "object",
        properties: {
          runId: { type: "string", description: "Interrupted run id from the recovery prompt." },
          toolCallId: { type: "string", description: "Interrupted tool call id from the recovery prompt." },
          sha256: { type: "string", description: "Optional expected sha256 for the saved argument text." },
        },
        required: ["runId", "toolCallId"],
        additionalProperties: false,
      },
      executionMode: "sequential",
      execute: async (_toolCallId, params) =>
        readInterruptedToolCallRecoveryArtifact(params, {
          authorityRootPaths: options.readAuthorityRootPaths(),
        }),
    });
    pi.registerTool({
      name: RECOVERY_APPLY_WRITE_SUFFIX_TOOL_NAME,
      label: "Recovery Apply Interrupted Write Suffix",
      description:
        "Complete an interrupted write by reading Ambient's saved partial write arguments, appending only the missing suffix, and writing the original target file.",
      promptSnippet:
        "recovery_apply_interrupted_write_suffix: Deterministically completes an interrupted write from saved partial args. Pass only the missing suffix; do not stream the full file again.",
      parameters: {
        type: "object",
        properties: {
          runId: { type: "string", description: "Interrupted run id from the recovery prompt." },
          toolCallId: { type: "string", description: "Interrupted write tool call id from the recovery prompt." },
          sha256: { type: "string", description: "Expected sha256 for the saved partial argument text." },
          suffix: { type: "string", description: "Only the missing suffix after the saved content prefix. Do not include the full file." },
          overlapStrategy: {
            type: "string",
            enum: ["auto", "none"],
            description: "Use auto to trim any duplicated overlap between the saved prefix and suffix.",
          },
        },
        required: ["runId", "toolCallId", "sha256", "suffix"],
        additionalProperties: false,
      },
      executionMode: "sequential",
      execute: async (_toolCallId, params) =>
        applyInterruptedWriteSuffix(params, {
          workspacePath: options.workspacePath,
          readAuthorityRootPaths: options.readAuthorityRootPaths(),
          writeAuthorityRootPaths: options.writeAuthorityRootPaths,
          includeWorkspaceRootAuthority: options.includeWorkspaceRootAuthority,
          requestFileAuthority: options.requestFileAuthority,
        }),
    });
  };
}

export function readInterruptedToolCallRecoveryArtifact(
  params: unknown,
  options: { authorityRootPaths: readonly string[] },
): AgentToolResult<Record<string, unknown>> {
  const artifact = readRecoveryArtifact(params, options);
  if (artifact.status === "error") return artifact.result;
  return {
    content: [{ type: "text", text: artifact.text }],
    details: {
      status: "done",
      toolName: RECOVERY_READ_TOOL_NAME,
      runId: artifact.runId,
      toolCallId: artifact.toolCallId,
      sha256: artifact.sha256,
      artifactPath: artifact.artifactPath,
      chars: artifact.text.length,
    },
  };
}

export async function applyInterruptedWriteSuffix(
  params: unknown,
  options: {
    workspacePath: string;
    readAuthorityRootPaths: readonly string[];
    writeAuthorityRootPaths: () => string[];
    includeWorkspaceRootAuthority?: () => boolean;
    requestFileAuthority?: AmbientFileAuthorityRequester;
  },
): Promise<AgentToolResult<Record<string, unknown>>> {
  const artifact = readRecoveryArtifact(params, { authorityRootPaths: options.readAuthorityRootPaths });
  if (artifact.status === "error") return artifact.result;
  const input = objectRecord(params);
  const suffix = typeof input.suffix === "string" ? input.suffix : undefined;
  const overlapStrategy = input.overlapStrategy === "none" ? "none" : "auto";
  const plan = buildInterruptedWriteSuffixPlan({
    artifact,
    suffix,
    overlapStrategy,
    authorityRootPaths: options.readAuthorityRootPaths,
  });
  if (plan.status === "error") return plan.result;
  const { parsed, appliedSuffix, suffixDiagnostics } = plan;
  if (suffix === undefined && !suffixDiagnostics.nestedRecovery) {
    return {
      content: [{ type: "text", text: "suffix is required." }],
      details: { status: "error", toolName: RECOVERY_APPLY_WRITE_SUFFIX_TOOL_NAME },
    };
  }
  if (looksLikeDoubleEscapedNewlineSuffix(parsed.content, appliedSuffix)) {
    return {
      content: [{
        type: "text",
        text: [
          "recoverySuffix appears double-escaped: it contains literal \\n sequences instead of newline characters.",
          "Retry with actual newline characters in the JSON string; do not copy JSON.stringify-style suffix previews as file text.",
        ].join("\n"),
      }],
      details: {
        status: "error",
        toolName: RECOVERY_APPLY_WRITE_SUFFIX_TOOL_NAME,
        runId: artifact.runId,
        toolCallId: artifact.toolCallId,
        artifactPath: artifact.artifactPath,
        sha256: artifact.sha256,
        issue: "double_escaped_newlines",
      },
    };
  }

  if (suffixDiagnostics.nestedRecovery && suffixDiagnostics.savedSuffixTruncated && !suffixDiagnostics.providedSuffixTailChars) {
    return {
      content: [{
        type: "text",
        text: [
          "Saved recovery_apply_interrupted_write_suffix arguments contain only a truncated suffix prefix.",
          "Retry with suffix set to only the missing tail after the saved suffix prefix preview; Ambient will compose the original saved write prefix, saved suffix prefix, and provided tail.",
        ].join("\n"),
      }],
      details: {
        status: "error",
        toolName: RECOVERY_APPLY_WRITE_SUFFIX_TOOL_NAME,
        runId: artifact.runId,
        toolCallId: artifact.toolCallId,
        artifactPath: artifact.artifactPath,
        sha256: artifact.sha256,
        issue: "nested_recovery_suffix_tail_required",
        ...suffixDiagnostics,
      },
    };
  }

  const content = `${parsed.content}${appliedSuffix}`;
  const targetPath = isAbsolute(parsed.path)
    ? resolve(parsed.path)
    : resolve(options.workspacePath, parsed.path);
  const writeOperations = createAmbientWriteOperations(options.workspacePath, {
    authorityRootPaths: options.writeAuthorityRootPaths,
    includeWorkspaceRootAuthority: options.includeWorkspaceRootAuthority,
    requestFileAuthority: options.requestFileAuthority,
    toolName: RECOVERY_APPLY_WRITE_SUFFIX_TOOL_NAME,
  });
  await writeOperations.writeFile(targetPath, content);

  return {
    content: [{
      type: "text",
      text: [
        "Completed interrupted write from saved prefix and suffix.",
        `Target: ${parsed.path}`,
        `Saved prefix chars: ${parsed.content.length}`,
        suffixDiagnostics.nestedRecovery
          ? `Saved recovery suffix prefix chars: ${suffixDiagnostics.savedSuffixPrefixChars}`
          : `Provided suffix chars: ${suffixDiagnostics.providedSuffixChars}`,
        suffixDiagnostics.nestedRecovery
          ? `Provided suffix tail chars: ${suffixDiagnostics.providedSuffixTailChars}`
          : `Trimmed overlap chars: ${suffixDiagnostics.overlapChars}`,
        `Final chars: ${content.length}`,
      ].join("\n"),
    }],
    details: {
      status: "done",
      toolName: RECOVERY_APPLY_WRITE_SUFFIX_TOOL_NAME,
      runId: artifact.runId,
      toolCallId: artifact.toolCallId,
      sha256: artifact.sha256,
      artifactPath: artifact.artifactPath,
      targetPath,
      prefixChars: parsed.content.length,
      suffixChars: appliedSuffix.length,
      ...suffixDiagnostics,
      finalChars: content.length,
      finalSha256: createHash("sha256").update(content).digest("hex"),
    },
  };
}

type InterruptedWriteSuffixPlan =
  | {
    status: "done";
    parsed: ParsedSavedWriteArgs;
    appliedSuffix: string;
    suffixDiagnostics: Record<string, unknown> & {
      nestedRecovery?: boolean;
      savedSuffixTruncated?: boolean;
      providedSuffixTailChars?: number;
      providedSuffixChars?: number;
      overlapChars: number;
    };
  }
  | { status: "error"; result: AgentToolResult<Record<string, unknown>> };

function buildInterruptedWriteSuffixPlan(input: {
  artifact: Extract<RecoveryArtifact, { status: "done" }>;
  suffix: string | undefined;
  overlapStrategy: "auto" | "none";
  authorityRootPaths: readonly string[];
}): InterruptedWriteSuffixPlan {
  const parsed = parseSavedWriteArgs(input.artifact.text);
  if (parsed) {
    const suffix = input.suffix;
    if (suffix === undefined) {
      return {
        status: "done",
        parsed,
        appliedSuffix: "",
        suffixDiagnostics: {
          nestedRecovery: false,
          providedSuffixChars: 0,
          overlapChars: 0,
        },
      };
    }
    const overlapChars = input.overlapStrategy === "auto" ? commonOverlapChars(parsed.content, suffix) : 0;
    return {
      status: "done",
      parsed,
      appliedSuffix: suffix.slice(overlapChars),
      suffixDiagnostics: {
        nestedRecovery: false,
        providedSuffixChars: suffix.length,
        overlapChars,
      },
    };
  }

  const nested = parseRecoveryApplyWriteSuffixArgs(input.artifact.text);
  if (!nested) {
    return {
      status: "error",
      result: {
        content: [{ type: "text", text: "Saved interrupted tool-call arguments are not write-compatible JSON with string path and content." }],
        details: {
          status: "error",
          toolName: RECOVERY_APPLY_WRITE_SUFFIX_TOOL_NAME,
          runId: input.artifact.runId,
          toolCallId: input.artifact.toolCallId,
          artifactPath: input.artifact.artifactPath,
          sha256: input.artifact.sha256,
        },
      },
    };
  }

  const originalArtifact = readRecoveryArtifact(
    { runId: nested.runId, toolCallId: nested.toolCallId, sha256: nested.sha256 },
    { authorityRootPaths: input.authorityRootPaths },
  );
  if (originalArtifact.status === "error") {
    return {
      status: "error",
      result: originalArtifact.result,
    };
  }
  const originalParsed = parseSavedWriteArgs(originalArtifact.text);
  if (!originalParsed) {
    return {
      status: "error",
      result: {
        content: [{ type: "text", text: "Nested recovery_apply arguments point to an original artifact that is not write-compatible JSON." }],
        details: {
          status: "error",
          toolName: RECOVERY_APPLY_WRITE_SUFFIX_TOOL_NAME,
          runId: input.artifact.runId,
          toolCallId: input.artifact.toolCallId,
          artifactPath: input.artifact.artifactPath,
          sha256: input.artifact.sha256,
          originalRunId: nested.runId,
          originalToolCallId: nested.toolCallId,
          originalArtifactPath: originalArtifact.artifactPath,
        },
      },
    };
  }

  const savedSuffixPrefixOverlapChars = input.overlapStrategy === "auto"
    ? commonOverlapChars(originalParsed.content, nested.suffixPrefix)
    : 0;
  const savedSuffixPrefix = nested.suffixPrefix.slice(savedSuffixPrefixOverlapChars);
  const suffixTail = input.suffix ?? "";
  const suffixTailOverlapChars = input.overlapStrategy === "auto"
    ? commonOverlapChars(`${originalParsed.content}${savedSuffixPrefix}`, suffixTail)
    : 0;
  const appliedSuffix = `${savedSuffixPrefix}${suffixTail.slice(suffixTailOverlapChars)}`;

  return {
    status: "done",
    parsed: originalParsed,
    appliedSuffix,
    suffixDiagnostics: {
      nestedRecovery: true,
      nestedRecoveryRunId: input.artifact.runId,
      nestedRecoveryToolCallId: input.artifact.toolCallId,
      originalRunId: nested.runId,
      originalToolCallId: nested.toolCallId,
      originalSha256: nested.sha256,
      originalArtifactPath: originalArtifact.artifactPath,
      savedSuffixPrefixChars: nested.suffixPrefix.length,
      savedSuffixTotalChars: nested.suffixChars,
      savedSuffixSource: nested.suffixSource,
      savedSuffixTruncated: nested.suffixTruncated,
      ...(nested.suffixOmittedChars !== undefined ? { savedSuffixOmittedChars: nested.suffixOmittedChars } : {}),
      providedSuffixTailChars: suffixTail.length,
      savedSuffixPrefixOverlapChars,
      suffixTailOverlapChars,
      overlapChars: savedSuffixPrefixOverlapChars + suffixTailOverlapChars,
    },
  };
}

type RecoveryArtifact =
  | {
    status: "done";
    runId: string;
    toolCallId: string;
    artifactPath: string;
    sha256: string;
    text: string;
  }
  | { status: "error"; result: AgentToolResult<Record<string, unknown>> };

function readRecoveryArtifact(
  params: unknown,
  options: { authorityRootPaths: readonly string[] },
): RecoveryArtifact {
  const input = objectRecord(params);
  const runId = typeof input.runId === "string" ? input.runId.trim() : "";
  const toolCallId = typeof input.toolCallId === "string" ? input.toolCallId.trim() : "";
  const expectedSha256 = typeof input.sha256 === "string" ? input.sha256.trim() : "";
  if (!runId || !toolCallId) {
    return {
      status: "error",
      result: {
        content: [{ type: "text", text: "runId and toolCallId are required." }],
        details: { status: "error", toolName: RECOVERY_READ_TOOL_NAME },
      },
    };
  }

  const relativeArtifactPaths = [
    join(
      ".ambient-codex",
      "interrupted-tool-calls",
      recoveryPathSegment(runId),
      `${recoveryPathSegment(toolCallId)}.partial-args.txt`,
    ),
    join(
      ".ambient-codex",
      "interrupted-tool-calls",
      recoveryPathSegment(runId),
      `${recoveryPathSegment(toolCallId)}.prepared-args.txt`,
    ),
  ];
  for (const root of options.authorityRootPaths) {
    const candidate = relativeArtifactPaths
      .map((relativeArtifactPath) => resolve(root, relativeArtifactPath))
      .find((path) => isPathInside(resolve(root), path) && existsSync(path));
    if (!candidate) continue;
    const text = readFileSync(candidate, "utf8");
    const actualSha256 = createHash("sha256").update(text).digest("hex");
    if (expectedSha256 && actualSha256 !== expectedSha256) {
      return {
        status: "error",
        result: {
          content: [{ type: "text", text: `Saved interrupted tool-call arguments failed sha256 verification for ${toolCallId}.` }],
          details: {
            status: "error",
            toolName: RECOVERY_READ_TOOL_NAME,
            runId,
            toolCallId,
            expectedSha256,
            actualSha256,
            artifactPath: candidate,
          },
        },
      };
    }
    return {
      status: "done",
      runId,
      toolCallId,
      artifactPath: candidate,
      sha256: actualSha256,
      text,
    };
  }

  return {
    status: "error",
    result: {
      content: [{ type: "text", text: `No interrupted tool-call argument artifact was found for run ${runId}, tool call ${toolCallId}.` }],
      details: {
        status: "error",
        toolName: RECOVERY_READ_TOOL_NAME,
        runId,
        toolCallId,
        searchedRoots: options.authorityRootPaths,
      },
    },
  };
}

function looksLikeDoubleEscapedNewlineSuffix(prefix: string, suffix: string): boolean {
  if (!prefix.includes("\n")) return false;
  const escapedNewlineCount = countOccurrences(suffix, "\\n");
  if (escapedNewlineCount < 3) return false;
  const actualNewlineCount = countOccurrences(suffix, "\n");
  return actualNewlineCount === 0 || escapedNewlineCount > actualNewlineCount * 2;
}

function countOccurrences(value: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while (true) {
    const next = value.indexOf(needle, index);
    if (next === -1) return count;
    count += 1;
    index = next + needle.length;
  }
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function recoveryPathSegment(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96);
  return cleaned || "tool-call";
}
