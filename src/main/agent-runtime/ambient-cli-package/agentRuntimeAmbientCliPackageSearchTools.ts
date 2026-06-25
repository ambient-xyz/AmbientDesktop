import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { WorkspaceState } from "../../../shared/workspaceTypes";
import {
  searchAmbientCliCapabilities,
  type AmbientCliCapabilitySearchInput,
  type AmbientCliCapabilitySearchResponse,
} from "../agentRuntimeAmbientCliFacade";
import { ambientCliSearchDetails, ambientCliSearchInput, ambientCliSearchText } from "./agentRuntimeAmbientCliPackageSearchModel";
import { pluginInstallToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";

export interface AmbientCliPackageSearchToolRegistrationOptions {
  workspace: Pick<WorkspaceState, "path">;
  searchAmbientCliCapabilities?: (
    workspacePath: string,
    input: AmbientCliCapabilitySearchInput,
  ) => Promise<AmbientCliCapabilitySearchResponse> | AmbientCliCapabilitySearchResponse;
  ambientCliSearchText?: (result: AmbientCliCapabilitySearchResponse) => string;
}

export function registerAmbientCliPackageSearchTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AmbientCliPackageSearchToolRegistrationOptions,
): void {
  const { workspace } = options;
  const searchCapabilities = options.searchAmbientCliCapabilities ?? searchAmbientCliCapabilities;
  const searchText = options.ambientCliSearchText ?? ambientCliSearchText;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_cli_search"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = ambientCliSearchInput(params as Record<string, unknown>);
      const result = await searchCapabilities(workspace.path, { ...input, includeHealth: false });
      return {
        content: [{ type: "text" as const, text: searchText(result) }],
        details: ambientCliSearchDetails({ searchInput: input, result }),
      };
    },
  });
}
