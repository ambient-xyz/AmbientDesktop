import {
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
  type AgentToolResult,
  type ExtensionAPI,
} from "@mariozechner/pi-coding-agent";
import { resolve } from "node:path";

import {
  RECOVERY_APPLY_WRITE_SUFFIX_TOOL_NAME,
  RECOVERY_READ_TOOL_NAME,
  applyInterruptedWriteSuffix,
} from "../agentRuntimeInterruptedRecoveryTools";
import {
  type AmbientFileAuthorityRequester,
  createAmbientEditOperations,
  createAmbientFindOperations,
  createAmbientGrepOperations,
  createAmbientLsOperations,
  createAmbientReadOperations,
  createAmbientWriteOperations,
} from "../../pi/piReadOperations";
import { isPathInside } from "../../session/sessionPaths";

const AMBIENT_WRITE_DESCRIPTION_GUIDANCE =
  "Ambient streams long content arguments and can resume large writes; do not split one logical file only to avoid size. Include both path and full content, then verify with the returned byte count, wc -c, or a hash instead of treating a bounded read preview as proof of truncation. During Ambient interrupted-write recovery, set recoveryMode to interrupted_write_suffix and pass only recoverySuffix so Ambient appends it to the saved prefix instead of streaming the full file again.";
const INTERRUPTED_TOOL_CALL_RECOVERY_DIR = ".ambient-codex/interrupted-tool-calls";
const INTERRUPTED_WRITE_SUFFIX_RECOVERY_MODE = "interrupted_write_suffix";

export interface ToolRunnerFileToolsRegistrationOptions {
  workspacePath: string;
  readOnlyAllowedPaths: () => string[];
  readAuthorityRootPaths: () => string[];
  writeAuthorityRootPaths: () => string[];
  includeWorkspaceRootAuthority?: () => boolean;
  requestFileAuthority?: AmbientFileAuthorityRequester;
  interruptedToolCallRecoveryToolsAvailable?: () => boolean;
}

export function registerToolRunnerFileTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: ToolRunnerFileToolsRegistrationOptions,
): void {
  pi.registerTool({
    ...withInterruptedToolCallReadGuard(createReadTool(options.workspacePath, {
      operations: createAmbientReadOperations(options.workspacePath, {
        readOnlyAllowedPaths: options.readOnlyAllowedPaths,
        authorityRootPaths: options.readAuthorityRootPaths,
        includeWorkspaceRootAuthority: options.includeWorkspaceRootAuthority,
        requestFileAuthority: options.requestFileAuthority,
        toolName: "read",
      }),
    }), options),
    executionMode: "sequential",
  });
  pi.registerTool({
    ...withAmbientWriteGuidance(createWriteTool(options.workspacePath, {
      operations: createAmbientWriteOperations(options.workspacePath, {
        authorityRootPaths: options.writeAuthorityRootPaths,
        includeWorkspaceRootAuthority: options.includeWorkspaceRootAuthority,
        requestFileAuthority: options.requestFileAuthority,
        toolName: "write",
      }),
    }), options),
    executionMode: "sequential",
  });
  pi.registerTool({
    ...createEditTool(options.workspacePath, {
      operations: createAmbientEditOperations(options.workspacePath, {
        readOnlyAllowedPaths: options.readOnlyAllowedPaths,
        authorityRootPaths: options.writeAuthorityRootPaths,
        includeWorkspaceRootAuthority: options.includeWorkspaceRootAuthority,
        requestFileAuthority: options.requestFileAuthority,
        toolName: "edit",
      }),
    }),
    executionMode: "sequential",
  });
  pi.registerTool({
    ...createGrepTool(options.workspacePath, {
      operations: createAmbientGrepOperations(options.workspacePath, {
        readOnlyAllowedPaths: options.readOnlyAllowedPaths,
        authorityRootPaths: options.readAuthorityRootPaths,
        includeWorkspaceRootAuthority: options.includeWorkspaceRootAuthority,
        requestFileAuthority: options.requestFileAuthority,
        toolName: "grep",
      }),
    }),
    executionMode: "sequential",
  });
  pi.registerTool({
    ...createFindTool(options.workspacePath, {
      operations: createAmbientFindOperations(options.workspacePath, {
        readOnlyAllowedPaths: options.readOnlyAllowedPaths,
        authorityRootPaths: options.readAuthorityRootPaths,
        includeWorkspaceRootAuthority: options.includeWorkspaceRootAuthority,
        requestFileAuthority: options.requestFileAuthority,
        toolName: "find",
      }),
    }),
    executionMode: "sequential",
  });
  pi.registerTool({
    ...createLsTool(options.workspacePath, {
      operations: createAmbientLsOperations(options.workspacePath, {
        readOnlyAllowedPaths: options.readOnlyAllowedPaths,
        authorityRootPaths: options.readAuthorityRootPaths,
        includeWorkspaceRootAuthority: options.includeWorkspaceRootAuthority,
        requestFileAuthority: options.requestFileAuthority,
        toolName: "ls",
      }),
    }),
    executionMode: "sequential",
  });
}

function withInterruptedToolCallReadGuard(
  tool: ReturnType<typeof createReadTool>,
  options: ToolRunnerFileToolsRegistrationOptions,
): ReturnType<typeof createReadTool> {
  return {
    ...tool,
    description: appendSentence(
      tool.description,
      "Do not use this generic read tool for Ambient interrupted-tool recovery artifacts; use the recovery tools listed in the current recovery prompt when present.",
    ),
    execute: async (toolCallId, params, signal, onUpdate) => {
      const recoveryPath = interruptedToolCallRecoveryPath(params, options.workspacePath);
      if (recoveryPath) {
        return interruptedToolCallRecoveryReadRejected(
          recoveryPath,
          options.interruptedToolCallRecoveryToolsAvailable?.() ?? false,
        );
      }
      return tool.execute(toolCallId, params, signal, onUpdate);
    },
  };
}

function interruptedToolCallRecoveryPath(params: unknown, workspacePath: string): { runId?: string; toolCallId?: string } | undefined {
  const path = params && typeof params === "object" && !Array.isArray(params)
    ? (params as { path?: unknown }).path
    : undefined;
  if (typeof path !== "string" || !path.trim()) return undefined;
  const workspace = resolve(workspacePath);
  const absolutePath = resolve(workspace, path);
  const recoveryRoot = resolve(workspace, INTERRUPTED_TOOL_CALL_RECOVERY_DIR);
  if (!isPathInside(recoveryRoot, absolutePath)) return undefined;
  const relativeSegments = absolutePath.slice(recoveryRoot.length).split(/[\\/]+/).filter(Boolean);
  const [runId, artifactName] = relativeSegments;
  const toolCallId = artifactName?.replace(/\.(?:partial|prepared)-args\.txt$/, "");
  return {
    ...(runId ? { runId } : {}),
    ...(toolCallId ? { toolCallId } : {}),
  };
}

function interruptedToolCallRecoveryReadRejected(
  input: { runId?: string; toolCallId?: string },
  recoveryToolsAvailable: boolean,
): AgentToolResult<Record<string, unknown>> {
  const recoveryInput = JSON.stringify({
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
  });
  const recoveryLines = recoveryToolsAvailable
    ? [
        `Use ${RECOVERY_READ_TOOL_NAME} for exact saved arguments, or ${RECOVERY_APPLY_WRITE_SUFFIX_TOOL_NAME} for write-like JSON recovery.`,
        `Suggested ${RECOVERY_READ_TOOL_NAME} input: ${recoveryInput}`,
      ]
    : [
        "These artifacts are available through Ambient's interrupted-tool recovery tools only in a recovery continuation turn.",
        "Continue the recovery turn instead of reading the artifact through generic read.",
      ];
  return {
    content: [{
      type: "text",
      text: [
        "Ambient interrupted-tool recovery artifacts are not readable through the generic read tool.",
        ...recoveryLines,
      ].join("\n"),
    }],
    details: {
      status: "error",
      toolName: "read",
      recoveryToolsAvailable,
      ...(recoveryToolsAvailable ? { recoveryTool: RECOVERY_READ_TOOL_NAME } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
    },
  };
}

function withAmbientWriteGuidance(
  tool: ReturnType<typeof createWriteTool>,
  options: ToolRunnerFileToolsRegistrationOptions,
): ReturnType<typeof createWriteTool> {
  return {
    ...tool,
    description: appendSentence(tool.description, AMBIENT_WRITE_DESCRIPTION_GUIDANCE),
    parameters: withAmbientWriteParameterGuidance(tool.parameters) as ReturnType<typeof createWriteTool>["parameters"],
    execute: async (toolCallId, params, signal, onUpdate) => {
      const recoveryParams = interruptedWriteSuffixRecoveryParams(params);
      if (recoveryParams) {
        return applyInterruptedWriteSuffix(recoveryParams, {
          workspacePath: options.workspacePath,
          readAuthorityRootPaths: options.readAuthorityRootPaths(),
          writeAuthorityRootPaths: options.writeAuthorityRootPaths,
          includeWorkspaceRootAuthority: options.includeWorkspaceRootAuthority,
          requestFileAuthority: options.requestFileAuthority,
        });
      }
      return tool.execute(toolCallId, params, signal, onUpdate);
    },
  };
}

function withAmbientWriteParameterGuidance(parameters: ReturnType<typeof createWriteTool>["parameters"]): unknown {
  if (!parameters || typeof parameters !== "object") return parameters;
  const schema = parameters as { properties?: Record<string, unknown> };
  if (!schema.properties || typeof schema.properties !== "object") return parameters;
  return {
    ...schema,
    properties: {
      ...schema.properties,
      path: appendSchemaDescription(
        schema.properties.path,
        "Required for Ambient's write validation and resumable large-write tracking.",
      ),
      content: appendSchemaDescription(
        schema.properties.content,
        "Pass the complete file body, including large generated files; Ambient will stream/resume long arguments and keep the displayed card compact. When recoveryMode is interrupted_write_suffix, this may be empty and recoverySuffix carries only the missing suffix.",
      ),
      recoveryMode: {
        type: "string",
        enum: [INTERRUPTED_WRITE_SUFFIX_RECOVERY_MODE],
        description:
          "Ambient interrupted-write recovery only. Set to interrupted_write_suffix to append recoverySuffix to Ambient's saved partial write content instead of writing content as a full file.",
      },
      recoveryRunId: {
        type: "string",
        description: "Interrupted run id from Ambient's recovery prompt when recoveryMode is interrupted_write_suffix.",
      },
      recoveryToolCallId: {
        type: "string",
        description: "Interrupted write tool call id from Ambient's recovery prompt when recoveryMode is interrupted_write_suffix.",
      },
      recoverySha256: {
        type: "string",
        description: "Expected sha256 for Ambient's saved partial write arguments when recoveryMode is interrupted_write_suffix.",
      },
      recoverySuffix: {
        type: "string",
        description:
          "Only the missing suffix after Ambient's saved content prefix. Do not include the full file unless overlap trimming is intentionally correcting a duplicate prefix.",
      },
      recoveryOverlapStrategy: {
        type: "string",
        enum: ["auto", "none"],
        description: "Use auto during interrupted-write recovery to trim any duplicate overlap between the saved prefix and recoverySuffix.",
      },
    },
  };
}

function interruptedWriteSuffixRecoveryParams(params: unknown): Record<string, unknown> | undefined {
  const input = objectRecord(params);
  const mode = stringField(input, "recoveryMode");
  const recoveryRunId = stringField(input, "recoveryRunId");
  const recoveryToolCallId = stringField(input, "recoveryToolCallId");
  const recoverySha256 = stringField(input, "recoverySha256");
  const runId = recoveryRunId ?? stringField(input, "runId");
  const toolCallId = recoveryToolCallId ?? stringField(input, "toolCallId");
  const sha256 = recoverySha256 ?? stringField(input, "sha256");
  const hasPrefixedRecoveryIds = Boolean(recoveryRunId && recoveryToolCallId && recoverySha256);
  const hasRecoverySuffix = stringField(input, "recoverySuffix") !== undefined || stringField(input, "suffix") !== undefined;
  if (mode !== INTERRUPTED_WRITE_SUFFIX_RECOVERY_MODE && !(hasPrefixedRecoveryIds && hasRecoverySuffix)) return undefined;

  return {
    runId: runId ?? "",
    toolCallId: toolCallId ?? "",
    sha256: sha256 ?? "",
    suffix: stringField(input, "recoverySuffix") ?? stringField(input, "suffix") ?? stringField(input, "content") ?? "",
    overlapStrategy: stringField(input, "recoveryOverlapStrategy") ?? stringField(input, "overlapStrategy") ?? "auto",
  };
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function appendSchemaDescription(schema: unknown, guidance: string): unknown {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return schema;
  const record = schema as { description?: unknown };
  return {
    ...record,
    description: appendSentence(typeof record.description === "string" ? record.description : undefined, guidance),
  };
}

function appendSentence(base: string | undefined, sentence: string): string {
  const trimmedBase = base?.trim();
  if (!trimmedBase) return sentence;
  if (trimmedBase.includes(sentence)) return trimmedBase;
  return `${trimmedBase} ${sentence}`;
}
