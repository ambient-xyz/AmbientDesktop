import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  ambientWorkflowsArchiveText,
  ambientWorkflowsUnarchiveText,
  archiveAmbientWorkflowPlaybook,
  unarchiveAmbientWorkflowPlaybook,
  type AmbientWorkflowPlaybookDescription,
  type AmbientWorkflowsArchiveInput,
  type AmbientWorkflowsUnarchiveInput,
} from "../agentRuntimeAmbientFacade";
import { pluginInstallToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import type { ProjectStore } from "../../projectStore/projectStore";

interface AmbientWorkflowArchiveServices {
  archive?: (input: AmbientWorkflowsArchiveInput) => Promise<AmbientWorkflowPlaybookDescription> | AmbientWorkflowPlaybookDescription;
  unarchive?: (input: AmbientWorkflowsUnarchiveInput) => Promise<AmbientWorkflowPlaybookDescription> | AmbientWorkflowPlaybookDescription;
}

export interface AmbientWorkflowArchiveToolRegistrationOptions {
  store: ProjectStore;
  workflowRecordings?: AmbientWorkflowArchiveServices;
  archiveAmbientWorkflowPlaybook?: typeof archiveAmbientWorkflowPlaybook;
  unarchiveAmbientWorkflowPlaybook?: typeof unarchiveAmbientWorkflowPlaybook;
}

export function registerAmbientWorkflowArchiveTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AmbientWorkflowArchiveToolRegistrationOptions,
): void {
  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_workflows_archive"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = ambientWorkflowsArchiveInput(params as Record<string, unknown>);
      const result = options.workflowRecordings?.archive
        ? await options.workflowRecordings.archive(input)
        : (options.archiveAmbientWorkflowPlaybook ?? archiveAmbientWorkflowPlaybook)(options.store, input);
      return {
        content: [{ type: "text" as const, text: ambientWorkflowsArchiveText(result) }],
        details: {
          runtime: "ambient-workflows",
          toolName: "ambient_workflows_archive",
          workflowId: result.id,
          title: result.title,
          version: result.version,
          baseVersion: input.baseVersion,
          archived: Boolean(result.archivedAt),
        },
      };
    },
  });

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_workflows_unarchive"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = ambientWorkflowsUnarchiveInput(params as Record<string, unknown>);
      const result = options.workflowRecordings?.unarchive
        ? await options.workflowRecordings.unarchive(input)
        : (options.unarchiveAmbientWorkflowPlaybook ?? unarchiveAmbientWorkflowPlaybook)(options.store, input);
      return {
        content: [{ type: "text" as const, text: ambientWorkflowsUnarchiveText(result) }],
        details: {
          runtime: "ambient-workflows",
          toolName: "ambient_workflows_unarchive",
          workflowId: result.id,
          title: result.title,
          version: result.version,
          baseVersion: input.baseVersion,
          archived: Boolean(result.archivedAt),
        },
      };
    },
  });
}

function ambientWorkflowsArchiveInput(input: Record<string, unknown>): AmbientWorkflowsArchiveInput {
  return {
    id: requiredString(input, "id"),
    baseVersion: requiredPositiveInteger(input, "baseVersion"),
    ...(optionalString(input.reason) ? { reason: optionalString(input.reason) } : {}),
  };
}

function ambientWorkflowsUnarchiveInput(input: Record<string, unknown>): AmbientWorkflowsUnarchiveInput {
  return {
    id: requiredString(input, "id"),
    baseVersion: requiredPositiveInteger(input, "baseVersion"),
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

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
