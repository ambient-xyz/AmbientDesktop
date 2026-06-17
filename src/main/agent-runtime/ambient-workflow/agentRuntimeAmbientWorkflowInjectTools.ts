import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  ambientWorkflowsInjectText,
  ambientWorkflowsPreflightDescribeText,
  describeAmbientWorkflowPlaybook,
  injectAmbientWorkflowPlaybook,
  type AmbientWorkflowPlaybookDescription,
  type AmbientWorkflowPlaybookInjection,
  type AmbientWorkflowsDescribeInput,
  type AmbientWorkflowsInjectInput,
} from "../../ambient/ambientWorkflows";
import { pluginInstallToolDescriptor } from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";
import type { ProjectStore } from "../../projectStore/projectStore";

interface AmbientWorkflowInjectServices {
  describe?: (input: AmbientWorkflowsDescribeInput) => Promise<AmbientWorkflowPlaybookDescription> | AmbientWorkflowPlaybookDescription;
  inject?: (input: AmbientWorkflowsInjectInput) => Promise<AmbientWorkflowPlaybookInjection> | AmbientWorkflowPlaybookInjection;
}

export interface AmbientWorkflowInjectToolRegistrationOptions {
  store: ProjectStore;
  workflowRecordings?: AmbientWorkflowInjectServices;
  isAmbientWorkflowPlaybookDescribed: (id: string, version: number) => boolean;
  markAmbientWorkflowPlaybookDescribed: (id: string, version: number) => void;
  describeAmbientWorkflowPlaybook?: typeof describeAmbientWorkflowPlaybook;
  injectAmbientWorkflowPlaybook?: typeof injectAmbientWorkflowPlaybook;
}

export function registerAmbientWorkflowInjectTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AmbientWorkflowInjectToolRegistrationOptions,
): void {
  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_workflows_inject"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = ambientWorkflowsInjectInput(params as Record<string, unknown>);
      const describeInput = {
        id: input.id,
        ...(input.version !== undefined ? { version: input.version } : {}),
        includeMarkdown: false,
      };
      const requested = options.workflowRecordings?.describe
        ? await options.workflowRecordings.describe(describeInput)
        : (options.describeAmbientWorkflowPlaybook ?? describeAmbientWorkflowPlaybook)(options.store, describeInput);
      if (!options.isAmbientWorkflowPlaybookDescribed(requested.id, requested.version)) {
        options.markAmbientWorkflowPlaybookDescribed(requested.id, requested.version);
        return {
          content: [{ type: "text" as const, text: ambientWorkflowsPreflightDescribeText(requested) }],
          details: {
            runtime: "ambient-workflows",
            toolName: "ambient_workflows_inject",
            workflowId: requested.id,
            title: requested.title,
            version: requested.version,
            status: "preflight-description",
            injected: false,
            toolNames: requested.toolNames,
            outputShape: requested.outputShape,
            markdownTruncated: requested.markdownTruncated,
          },
        };
      }
      const result = options.workflowRecordings?.inject
        ? await options.workflowRecordings.inject(input)
        : (options.injectAmbientWorkflowPlaybook ?? injectAmbientWorkflowPlaybook)(options.store, input);
      return {
        content: [{ type: "text" as const, text: ambientWorkflowsInjectText(result) }],
        details: {
          runtime: "ambient-workflows",
          toolName: "ambient_workflows_inject",
          workflowId: result.playbook.id,
          title: result.playbook.title,
          version: result.playbook.version,
          status: "injected",
          injected: true,
          toolNames: result.playbook.toolNames,
          outputShape: result.playbook.outputShape,
          markdownTruncated: result.playbook.markdownTruncated,
        },
      };
    },
  });
}

function ambientWorkflowsInjectInput(input: Record<string, unknown>): AmbientWorkflowsInjectInput {
  return {
    id: requiredString(input, "id"),
    ...(optionalNumber(input.version) !== undefined ? { version: optionalNumber(input.version) } : {}),
    ...(optionalNumber(input.maxMarkdownChars) !== undefined ? { maxMarkdownChars: optionalNumber(input.maxMarkdownChars) } : {}),
  };
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
