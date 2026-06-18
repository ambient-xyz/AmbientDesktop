import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { WorkspaceState } from "../../shared/workspaceTypes";
import {
  capabilityBuilderHistoryText,
  discoverCapabilityBuilderHistory,
  type CapabilityBuilderHistoryInput,
  type CapabilityBuilderHistoryResult,
} from "./capabilityBuilder";
import { pluginInstallToolDescriptor } from "../desktop-tools/desktopToolRegistry";
import { registerDesktopTool } from "../desktop-tools/desktopToolRegistration";

export interface CapabilityBuilderHistoryToolRegistrationOptions {
  workspace: Pick<WorkspaceState, "path">;
  parseHistoryInput: (params: Record<string, unknown>) => CapabilityBuilderHistoryInput;
  discoverCapabilityBuilderHistory?: typeof discoverCapabilityBuilderHistory;
}

export function registerCapabilityBuilderHistoryTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: CapabilityBuilderHistoryToolRegistrationOptions,
): void {
  const { workspace } = options;
  const discoverHistory = options.discoverCapabilityBuilderHistory ?? discoverCapabilityBuilderHistory;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_capability_builder_history"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = options.parseHistoryInput(params as Record<string, unknown>);
      const result = await discoverHistory(workspace.path, input);
      return capabilityBuilderHistoryToolResult(result);
    },
  });
}

function capabilityBuilderHistoryToolResult(result: CapabilityBuilderHistoryResult) {
  return {
    content: [{ type: "text" as const, text: capabilityBuilderHistoryText(result) }],
    details: {
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_history",
      status: "listed",
      rootPath: result.rootPath,
      relativeRootPath: result.relativeRootPath,
      packageCount: result.entries.length,
      unregisteredCount: result.entries.filter((entry) => entry.status === "unregistered").length,
      errorCount: result.errors.length,
      packageNames: result.entries.map((entry) => entry.packageName),
    },
  };
}
