import {
  createBashTool,
  type AgentToolResult,
  type ExtensionAPI,
} from "@mariozechner/pi-coding-agent";

import {
  createToolRunnerBashOperations,
  type ToolRunnerPolicy,
} from "../../tool-runtime/toolRunner";
import { RECOVERY_READ_TOOL_NAME } from "../agentRuntimeInterruptedRecoveryTools";

const INTERRUPTED_TOOL_CALL_RECOVERY_DIR = ".ambient-codex/interrupted-tool-calls";

export interface ToolRunnerBashToolRegistrationOptions<MediaSnapshot> {
  workspacePath: string;
  getPolicy: () => ToolRunnerPolicy;
  snapshotWorkspaceMediaFiles: (workspacePath: string) => MediaSnapshot;
  newestChangedMediaArtifact: (
    workspacePath: string,
    before: MediaSnapshot,
    after: MediaSnapshot,
  ) => string | undefined;
  appendMediaArtifactResult: <T>(result: T, artifactPath: string, workspacePath: string) => T;
  interruptedToolCallRecoveryToolsAvailable?: () => boolean;
}

export function registerToolRunnerBashTool<MediaSnapshot>(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: ToolRunnerBashToolRegistrationOptions<MediaSnapshot>,
): void {
  const bashTool = createBashTool(options.workspacePath, {
    operations: createToolRunnerBashOperations(options.getPolicy),
  });
  pi.registerTool({
    ...bashTool,
    description: appendSentence(
      bashTool.description,
      "Do not use bash to read Ambient interrupted-tool recovery artifacts; use the recovery tools listed in the current recovery prompt when present.",
    ),
    executionMode: "sequential",
    execute: async (toolCallId, params, signal, onUpdate) => {
      const recoveryReadRejection = interruptedToolCallRecoveryBashRejected(
        params,
        options.interruptedToolCallRecoveryToolsAvailable?.() ?? false,
      );
      if (recoveryReadRejection) return recoveryReadRejection;
      const before = options.snapshotWorkspaceMediaFiles(options.workspacePath);
      const result = await bashTool.execute(toolCallId, params, signal, onUpdate);
      const artifactPath = options.newestChangedMediaArtifact(
        options.workspacePath,
        before,
        options.snapshotWorkspaceMediaFiles(options.workspacePath),
      );
      return artifactPath ? options.appendMediaArtifactResult(result, artifactPath, options.workspacePath) : result;
    },
  });
}

function interruptedToolCallRecoveryBashRejected(
  params: unknown,
  recoveryToolsAvailable: boolean,
): AgentToolResult<Record<string, unknown>> | undefined {
  const input = params && typeof params === "object" && !Array.isArray(params)
    ? params as { command?: unknown }
    : {};
  const command = typeof input.command === "string" ? input.command : "";
  if (!command.includes(INTERRUPTED_TOOL_CALL_RECOVERY_DIR)) return undefined;
  return {
    content: [{
      type: "text",
      text: [
        "Ambient interrupted-tool recovery artifacts are not readable through bash.",
        recoveryToolsAvailable
          ? `Use ${RECOVERY_READ_TOOL_NAME} for exact saved arguments, or write with recoveryMode interrupted_write_suffix for write-like JSON recovery.`
          : "These artifacts are available through Ambient's interrupted-tool recovery tools only in a recovery continuation turn.",
      ].join("\n"),
    }],
    details: {
      status: "error",
      toolName: "bash",
      recoveryToolsAvailable,
      ...(recoveryToolsAvailable ? { recoveryTool: RECOVERY_READ_TOOL_NAME } : {}),
    },
  };
}

function appendSentence(base: string | undefined, sentence: string): string {
  const trimmedBase = base?.trim();
  if (!trimmedBase) return sentence;
  if (trimmedBase.includes(sentence)) return trimmedBase;
  return `${trimmedBase} ${sentence}`;
}
