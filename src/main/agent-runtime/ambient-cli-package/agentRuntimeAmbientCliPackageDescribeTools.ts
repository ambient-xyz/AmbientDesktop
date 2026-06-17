import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { WorkspaceState } from "../../../shared/types";
import {
  describeAmbientCliPackage,
  type AmbientCliPackageDescription,
  type DescribeAmbientCliPackageInput,
  type DescribeAmbientCliPackageOptions,
} from "../../ambientCliPackages";
import { ambientCliDescribeDetails, ambientCliDescribeInput, ambientCliDescribeText } from "./agentRuntimeAmbientCliPackageDescribeModel";
import { pluginInstallToolDescriptor } from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";

export interface AmbientCliPackageDescribeToolRegistrationOptions {
  workspace: Pick<WorkspaceState, "path">;
  describeAmbientCliPackage?: (
    workspacePath: string,
    input: DescribeAmbientCliPackageInput,
    options?: DescribeAmbientCliPackageOptions,
  ) => Promise<AmbientCliPackageDescription> | AmbientCliPackageDescription;
  markAmbientCliPackageDescribed: (packageId: string, packageName: string) => void;
  modelComplete?: (prompt: string, signal?: AbortSignal) => Promise<string>;
  env?: Partial<Pick<NodeJS.ProcessEnv, "AMBIENT_CLI_RLM_SUMMARIES">>;
}

export function registerAmbientCliPackageDescribeTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AmbientCliPackageDescribeToolRegistrationOptions,
): void {
  const { workspace } = options;
  const describePackage = options.describeAmbientCliPackage ?? describeAmbientCliPackage;
  const env = options.env ?? process.env;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_cli_describe"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = ambientCliDescribeInput(params as Record<string, unknown>);
      const generateMissingSummaries = env.AMBIENT_CLI_RLM_SUMMARIES === "1";
      const result = await describePackage(workspace.path, input, {
        generateMissingSummaries,
        ...(generateMissingSummaries && options.modelComplete
          ? {
            modelComplete: options.modelComplete,
          }
          : {}),
      });
      options.markAmbientCliPackageDescribed(result.package.id, result.package.name);
      return {
        content: [{ type: "text" as const, text: ambientCliDescribeText(result) }],
        details: ambientCliDescribeDetails(result, generateMissingSummaries),
      };
    },
  });
}
