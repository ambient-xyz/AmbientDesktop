import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { WorkspaceState } from "../../../shared/types";
import {
  previewAmbientCliPackageInstallSource,
  type AmbientCliPackageInstallPreview,
  type PreviewAmbientCliPackageInput,
} from "../../ambientCliPackages";
import { ambientCliPackagePreviewInput, ambientCliPackagePreviewText } from "./agentRuntimeAmbientCliPackageInstallModel";
import { pluginInstallToolDescriptor } from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";

type ToolUpdateHandler = (update: {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}) => void;

export interface AmbientCliPackagePreviewToolRegistrationOptions {
  workspace: Pick<WorkspaceState, "path">;
  previewAmbientCliPackageInstallSource?: (
    workspacePath: string,
    input: PreviewAmbientCliPackageInput,
  ) => Promise<AmbientCliPackageInstallPreview> | AmbientCliPackageInstallPreview;
  ambientCliPackagePreviewText?: (preview: AmbientCliPackageInstallPreview) => string;
}

export function registerAmbientCliPackagePreviewTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AmbientCliPackagePreviewToolRegistrationOptions,
): void {
  const { workspace } = options;
  const previewInstallSource = options.previewAmbientCliPackageInstallSource ?? previewAmbientCliPackageInstallSource;
  const previewText = options.ambientCliPackagePreviewText ?? ambientCliPackagePreviewText;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_cli_package_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const input = ambientCliPackagePreviewInput(params as Record<string, unknown>);
      onUpdate?.({
        content: [{ type: "text", text: `Previewing Ambient CLI package source ${input.source}.` }],
        details: {
          runtime: "ambient-cli",
          toolName: "ambient_cli_package_preview",
          source: input.source,
          path: input.path,
          ref: input.ref,
          sha: input.sha,
          descriptorOverlay: Boolean(input.descriptor),
          installDependencies: input.installDependencies ?? false,
          status: "previewing",
        },
      });
      const preview = await previewInstallSource(workspace.path, input);
      return {
        content: [{ type: "text" as const, text: previewText(preview) }],
        details: {
          runtime: "ambient-cli",
          toolName: "ambient_cli_package_preview",
          source: input.source,
          packageName: preview.candidate?.name,
          installable: preview.installable,
          errorCount: preview.errors.length,
          healthCheckCount: preview.healthChecks.length,
          dependencyInstall: preview.dependencyInstall,
          envStatus: preview.envStatus,
        },
      };
    },
  });
}
