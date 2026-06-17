import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { WorkspaceState } from "../../shared/types";
import {
  capabilityBuilderRemovalPlanText,
  planCapabilityBuilderRemoval,
  type CapabilityBuilderRemovalPlanInput,
  type CapabilityBuilderRemovalPlanResult,
} from "./capabilityBuilder";
import { pluginInstallToolDescriptor } from "../desktopToolRegistry";
import { registerDesktopTool } from "../desktopToolRegistration";

export interface CapabilityBuilderRemovalPlanToolRegistrationOptions {
  workspace: Pick<WorkspaceState, "path">;
  parseRemovalPlanInput: (params: Record<string, unknown>) => CapabilityBuilderRemovalPlanInput;
  planCapabilityBuilderRemoval?: typeof planCapabilityBuilderRemoval;
}

export function registerCapabilityBuilderRemovalPlanTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: CapabilityBuilderRemovalPlanToolRegistrationOptions,
): void {
  const { workspace } = options;
  const planRemoval = options.planCapabilityBuilderRemoval ?? planCapabilityBuilderRemoval;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_capability_builder_removal_plan"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = options.parseRemovalPlanInput(params as Record<string, unknown>);
      const result = await planRemoval(workspace.path, input);
      return capabilityBuilderRemovalPlanToolResult(result);
    },
  });
}

function capabilityBuilderRemovalPlanToolResult(result: CapabilityBuilderRemovalPlanResult) {
  return {
    content: [{ type: "text" as const, text: capabilityBuilderRemovalPlanText(result) }],
    details: {
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_removal_plan",
      status: result.errors.length ? "blocked" : "planned",
      packageName: result.packageName,
      rootPath: result.rootPath,
      relativeRootPath: result.relativeRootPath,
      gitSha: result.gitSha,
      sourceExists: result.sourceExists,
      installedPackageId: result.installedPackageId,
      installedSource: result.installedSource,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
      commandNames: result.preview?.descriptor?.commandNames ?? [],
      envNames: result.preview?.descriptor?.envNames ?? [],
      artifactOutputTypes: result.preview?.descriptor?.artifactOutputTypes ?? [],
      logFileCount: result.sourceInventory.logFiles.length,
      possibleArtifactFileCount: result.sourceInventory.possibleArtifactFiles.length,
      mutationProhibited: result.mutationProhibited,
    },
  };
}
