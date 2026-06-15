import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  ambientWorkflowsRestoreVersionText,
  restoreAmbientWorkflowPlaybookVersion,
  type AmbientWorkflowPlaybookDescription,
  type AmbientWorkflowsRestoreVersionInput,
} from "./ambientWorkflows";
import { pluginInstallToolDescriptor } from "./desktopToolRegistry";
import { registerDesktopTool } from "./desktopToolRegistration";
import type { ProjectStore } from "./projectStore";

interface AmbientWorkflowRestoreServices {
  restoreVersion?: (input: AmbientWorkflowsRestoreVersionInput) => Promise<AmbientWorkflowPlaybookDescription> | AmbientWorkflowPlaybookDescription;
}

export interface AmbientWorkflowRestoreToolRegistrationOptions {
  store: ProjectStore;
  workflowRecordings?: AmbientWorkflowRestoreServices;
  markAmbientWorkflowPlaybookDescribed: (id: string, version: number) => void;
  restoreAmbientWorkflowPlaybookVersion?: typeof restoreAmbientWorkflowPlaybookVersion;
}

export function registerAmbientWorkflowRestoreTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AmbientWorkflowRestoreToolRegistrationOptions,
): void {
  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_workflows_restore_version"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = ambientWorkflowsRestoreVersionInput(params as Record<string, unknown>);
      const result = options.workflowRecordings?.restoreVersion
        ? await options.workflowRecordings.restoreVersion(input)
        : (options.restoreAmbientWorkflowPlaybookVersion ?? restoreAmbientWorkflowPlaybookVersion)(options.store, input);
      options.markAmbientWorkflowPlaybookDescribed(result.id, result.version);
      return {
        content: [{ type: "text" as const, text: ambientWorkflowsRestoreVersionText(result) }],
        details: {
          runtime: "ambient-workflows",
          toolName: "ambient_workflows_restore_version",
          workflowId: result.id,
          title: result.title,
          version: result.version,
          restoredFromVersion: input.version,
          archived: Boolean(result.archivedAt),
          enabled: result.enabled,
        },
      };
    },
  });
}

function ambientWorkflowsRestoreVersionInput(input: Record<string, unknown>): AmbientWorkflowsRestoreVersionInput {
  return {
    id: requiredString(input, "id"),
    version: requiredPositiveInteger(input, "version"),
  };
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}

function requiredPositiveInteger(input: Record<string, unknown>, field: string): number {
  const value = optionalNumber(input[field]);
  if (value === undefined || !Number.isInteger(value) || value < 1) throw new Error(`Missing required positive integer: ${field}`);
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
