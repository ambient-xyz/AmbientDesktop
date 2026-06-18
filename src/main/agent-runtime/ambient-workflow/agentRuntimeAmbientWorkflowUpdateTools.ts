import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  ambientWorkflowsUpdateText,
  updateAmbientWorkflowPlaybook,
  type AmbientWorkflowPlaybookDescription,
  type AmbientWorkflowsUpdateInput,
} from "../agentRuntimeAmbientFacade";
import { pluginInstallToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import type { ProjectStore } from "../../projectStore/projectStore";
import { workflowRecordingReviewDraftUpdateFromToolParams } from "../../workflow-recording/workflowRecordingReviewDraftInput";

interface AmbientWorkflowUpdateServices {
  update?: (input: AmbientWorkflowsUpdateInput) => Promise<AmbientWorkflowPlaybookDescription> | AmbientWorkflowPlaybookDescription;
}

export interface AmbientWorkflowUpdateToolRegistrationOptions {
  store: ProjectStore;
  workflowRecordings?: AmbientWorkflowUpdateServices;
  markAmbientWorkflowPlaybookDescribed: (id: string, version: number) => void;
  updateAmbientWorkflowPlaybook?: typeof updateAmbientWorkflowPlaybook;
}

export function registerAmbientWorkflowUpdateTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AmbientWorkflowUpdateToolRegistrationOptions,
): void {
  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_workflows_update"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = ambientWorkflowsUpdateInput(params as Record<string, unknown>);
      const result = options.workflowRecordings?.update
        ? await options.workflowRecordings.update(input)
        : (options.updateAmbientWorkflowPlaybook ?? updateAmbientWorkflowPlaybook)(options.store, input);
      options.markAmbientWorkflowPlaybookDescribed(result.id, result.version);
      return {
        content: [{ type: "text" as const, text: ambientWorkflowsUpdateText(result) }],
        details: {
          runtime: "ambient-workflows",
          toolName: "ambient_workflows_update",
          workflowId: result.id,
          title: result.title,
          version: result.version,
          baseVersion: input.baseVersion,
          archived: Boolean(result.archivedAt),
          enabled: result.enabled,
        },
      };
    },
  });
}

function ambientWorkflowsUpdateInput(input: Record<string, unknown>): AmbientWorkflowsUpdateInput {
  return {
    id: requiredString(input, "id"),
    baseVersion: requiredPositiveInteger(input, "baseVersion"),
    ...(optionalString(input.title) ? { title: optionalString(input.title) } : {}),
    draft: workflowRecordingReviewDraftUpdateFromToolParams(input),
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
