import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { WorkspaceState } from "../../shared/workspaceTypes";
import {
  capabilityBuilderRepairPlanText,
  planCapabilityBuilderRepair,
  type CapabilityBuilderRepairPlanInput,
  type CapabilityBuilderRepairPlanResult,
} from "./capabilityBuilder";
import { pluginInstallToolDescriptor, registerDesktopTool } from "./capabilityBuilderDesktopToolFacade";

export interface CapabilityBuilderRepairPlanToolRegistrationOptions {
  workspace: Pick<WorkspaceState, "path">;
  parseRepairPlanInput: (params: Record<string, unknown>) => CapabilityBuilderRepairPlanInput;
  planCapabilityBuilderRepair?: typeof planCapabilityBuilderRepair;
}

export function registerCapabilityBuilderRepairPlanTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: CapabilityBuilderRepairPlanToolRegistrationOptions,
): void {
  const { workspace } = options;
  const planRepair = options.planCapabilityBuilderRepair ?? planCapabilityBuilderRepair;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_capability_builder_repair_plan"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = options.parseRepairPlanInput(params as Record<string, unknown>);
      const result = await planRepair(workspace.path, input);
      return capabilityBuilderRepairPlanToolResult(result);
    },
  });
}

function capabilityBuilderRepairPlanToolResult(result: CapabilityBuilderRepairPlanResult) {
  return {
    content: [{ type: "text" as const, text: capabilityBuilderRepairPlanText(result) }],
    details: {
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_repair_plan",
      status: "planned",
      packageName: result.packageName,
      rootPath: result.rootPath,
      relativeRootPath: result.relativeRootPath,
      gitSha: result.gitSha,
      requestedRepair: result.requestedRepair,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
      commandNames: result.preview.descriptor?.commandNames ?? [],
      envNames: result.preview.descriptor?.envNames ?? [],
      artifactOutputTypes: result.preview.descriptor?.artifactOutputTypes ?? [],
      mutationProhibited: result.mutationProhibited,
    },
  };
}
