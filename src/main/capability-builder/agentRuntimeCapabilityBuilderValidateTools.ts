import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { ThreadSummary, WorkspaceState } from "../../shared/types";
import {
  capabilityBuilderValidateText,
  type CapabilityBuilderValidateInput,
  type CapabilityBuilderValidateResult,
} from "./capabilityBuilder";
import { pluginInstallToolDescriptor } from "../desktopToolRegistry";
import { registerDesktopTool } from "../desktopToolRegistration";

type ToolUpdateHandler = (update: {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}) => void;

export interface CapabilityBuilderValidationRunInput {
  thread: ThreadSummary;
  workspace: WorkspaceState;
  input: CapabilityBuilderValidateInput;
  onUpdate?: ToolUpdateHandler;
  reason?: "privileged-action-succeeded";
}

export interface CapabilityBuilderValidateToolRegistrationOptions {
  workspace: WorkspaceState;
  getThread: () => ThreadSummary;
  parseValidateInput: (params: Record<string, unknown>) => CapabilityBuilderValidateInput;
  runCapabilityBuilderValidationWithPermission: (
    input: CapabilityBuilderValidationRunInput,
  ) => Promise<CapabilityBuilderValidateResult> | CapabilityBuilderValidateResult;
  capabilityBuilderValidateText?: (result: CapabilityBuilderValidateResult) => string;
}

export function registerCapabilityBuilderValidateTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: CapabilityBuilderValidateToolRegistrationOptions,
): void {
  const { workspace } = options;
  const validateText = options.capabilityBuilderValidateText ?? capabilityBuilderValidateText;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_capability_builder_validate"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const thread = options.getThread();
      if (thread.collaborationMode === "planner") throw new Error("Capability Builder validation is blocked in Planner Mode.");
      const input = options.parseValidateInput(params as Record<string, unknown>);
      const result = await options.runCapabilityBuilderValidationWithPermission({
        thread,
        workspace,
        input,
        onUpdate,
      });
      return {
        content: [{ type: "text" as const, text: validateText(result) }],
        details: {
          runtime: "ambient-capability-builder",
          toolName: "ambient_capability_builder_validate",
          status: result.succeeded ? "succeeded" : "failed",
          packageName: result.packageName,
          rootPath: result.rootPath,
          relativeRootPath: result.relativeRootPath,
          gitSha: result.gitSha,
          validatedAt: result.validatedAt,
          logPath: result.logPath,
          relativeLogPath: result.relativeLogPath,
          commandCount: result.commands.length,
          artifactCount: result.artifacts.length,
          durationMs: result.durationMs,
          commandDurationsMs: result.commands.map((command) => command.durationMs),
          startedAt: result.startedAt,
          completedAt: result.completedAt,
        },
      };
    },
  });
}
