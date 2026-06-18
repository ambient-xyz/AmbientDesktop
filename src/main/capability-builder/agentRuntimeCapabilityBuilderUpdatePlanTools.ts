import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { WorkspaceState } from "../../shared/workspaceTypes";
import {
  capabilityBuilderUpdatePlanText,
  planCapabilityBuilderUpdate,
  type CapabilityBuilderUpdatePlanInput,
  type CapabilityBuilderUpdatePlanResult,
} from "./capabilityBuilder";
import { pluginInstallToolDescriptor } from "../desktop-tools/desktopToolRegistry";
import { registerDesktopTool } from "../desktop-tools/desktopToolRegistration";

export interface CapabilityBuilderUpdatePlanToolRegistrationOptions {
  workspace: Pick<WorkspaceState, "path">;
  parseUpdatePlanInput: (params: Record<string, unknown>) => CapabilityBuilderUpdatePlanInput;
  planCapabilityBuilderUpdate?: typeof planCapabilityBuilderUpdate;
}

export function registerCapabilityBuilderUpdatePlanTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: CapabilityBuilderUpdatePlanToolRegistrationOptions,
): void {
  const { workspace } = options;
  const planUpdate = options.planCapabilityBuilderUpdate ?? planCapabilityBuilderUpdate;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_capability_builder_update_plan"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = options.parseUpdatePlanInput(params as Record<string, unknown>);
      const result = await planUpdate(workspace.path, input);
      return capabilityBuilderUpdatePlanToolResult(result);
    },
  });
}

function capabilityBuilderUpdatePlanToolResult(result: CapabilityBuilderUpdatePlanResult) {
  return {
    content: [{ type: "text" as const, text: capabilityBuilderUpdatePlanText(result) }],
    details: {
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_update_plan",
      status: result.errors.length ? "blocked" : "planned",
      packageName: result.packageName,
      rootPath: result.rootPath,
      relativeRootPath: result.relativeRootPath,
      gitSha: result.gitSha,
      requestedChanges: result.requestedChanges,
      targetVersion: result.targetVersion,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
      commandNames: result.preview.descriptor?.commandNames ?? [],
      envNames: result.preview.descriptor?.envNames ?? [],
      artifactOutputTypes: result.preview.descriptor?.artifactOutputTypes ?? [],
      mutationProhibited: result.mutationProhibited,
    },
  };
}
