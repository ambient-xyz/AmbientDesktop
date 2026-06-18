import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { DesktopEvent } from "../../shared/desktopTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import {
  previewCapabilityBuilderPackage,
  type CapabilityBuilderPreviewInput,
  type CapabilityBuilderPreviewResult,
} from "./capabilityBuilder";
import { pluginInstallToolDescriptor } from "../desktop-tools/desktopToolRegistry";
import { registerDesktopTool } from "../desktop-tools/desktopToolRegistration";

export type CapabilityBuilderSecretRequestInput = CapabilityBuilderPreviewInput & { envName: string };

export interface CapabilityBuilderSecretRequestToolRegistrationOptions {
  workspace: Pick<WorkspaceState, "path">;
  parseSecretRequestInput: (params: Record<string, unknown>) => CapabilityBuilderSecretRequestInput;
  previewCapabilityBuilderPackage?: (
    workspacePath: string,
    input: CapabilityBuilderSecretRequestInput,
  ) => Promise<CapabilityBuilderPreviewResult> | CapabilityBuilderPreviewResult;
  emitDesktopEvent: (event: Extract<DesktopEvent, { type: "ambient-cli-secret-requested" }>) => void;
}

export function registerCapabilityBuilderSecretRequestTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: CapabilityBuilderSecretRequestToolRegistrationOptions,
): void {
  const { workspace } = options;
  const previewPackage = options.previewCapabilityBuilderPackage ?? previewCapabilityBuilderPackage;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_capability_builder_secret_request"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = options.parseSecretRequestInput(params as Record<string, unknown>);
      const result = await previewPackage(workspace.path, input);
      const requirement = result.descriptor?.envRequirements.find((env) => env.name === input.envName);
      if (!requirement) throw new Error(`Capability Builder package "${result.packageName}" does not declare env requirement "${input.envName}".`);
      options.emitDesktopEvent({
        type: "ambient-cli-secret-requested",
        packageName: result.packageName,
        envName: requirement.name,
        builderSourcePath: result.relativeRootPath,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Capability Builder secret dialog requested\nPackage: ${result.packageName}\nBuilder source: ${result.relativeRootPath}\nEnv name: ${requirement.name}\nSecret value: never exposed to Pi`,
          },
        ],
        details: {
          runtime: "ambient-capability-builder",
          toolName: "ambient_capability_builder_secret_request",
          packageName: result.packageName,
          relativeRootPath: result.relativeRootPath,
          envName: requirement.name,
        },
      };
    },
  });
}
