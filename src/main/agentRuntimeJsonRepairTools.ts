import type { AgentToolResult, ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { ambientRetryPolicyFromSettings } from "./aggressiveRetries";
import { pluginInstallToolDescriptor } from "./desktopToolRegistry";
import { registerDesktopTool } from "./desktopToolRegistration";
import {
  jsonRepairToolResultText,
  parseJsonRepairToolInput,
  repairJsonWithPi,
  type JsonRepairToolInput,
  type JsonRepairToolOptions,
  type JsonRepairToolResult,
} from "./jsonRepairTool";

type JsonRepairToolUpdateHandler = (update: AgentToolResult<Record<string, unknown>>) => void;
type JsonRepairModel = {
  id: string;
  baseUrl?: string;
};
type JsonRepairModelRuntimeSettings = {
  aggressiveRetries?: boolean;
};

export interface JsonRepairToolRegistrationOptions {
  model: JsonRepairModel;
  apiKey?: string;
  getModelRuntimeSettings: () => JsonRepairModelRuntimeSettings;
  repairJson?: (input: JsonRepairToolInput, options: JsonRepairToolOptions) => Promise<JsonRepairToolResult> | JsonRepairToolResult;
}

export function registerJsonRepairTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: JsonRepairToolRegistrationOptions,
): void {
  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_json_repair"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal, onUpdate?: JsonRepairToolUpdateHandler) => {
      const input = parseJsonRepairToolInput(params as Record<string, unknown>);
      onUpdate?.({
        content: [{ type: "text", text: `Repairing JSON for schema ${input.schemaName}.` }],
        details: {
          runtime: "ambient-json-repair",
          toolName: "ambient_json_repair",
          status: "running",
          schemaName: input.schemaName,
        },
      });
      const modelRuntimeSettings = options.getModelRuntimeSettings();
      let lastProgressStage: string | undefined;
      const repairJson = options.repairJson ?? repairJsonWithPi;
      const result = await repairJson(input, {
        apiKey: options.apiKey,
        baseUrl: options.model.baseUrl,
        model: options.model.id,
        signal,
        retryPolicy: modelRuntimeSettings.aggressiveRetries ? ambientRetryPolicyFromSettings({ modelRuntime: modelRuntimeSettings }) : undefined,
        onProgress: (progress) => {
          if (progress.stage === lastProgressStage) return;
          lastProgressStage = progress.stage;
          onUpdate?.({
            content: [{ type: "text", text: `JSON repair ${progress.stage}.` }],
            details: {
              runtime: "ambient-json-repair",
              toolName: "ambient_json_repair",
              status: progress.stage,
              schemaName: input.schemaName,
              outputChars: progress.outputChars,
              thinkingChars: progress.thinkingChars,
              elapsedMs: progress.elapsedMs,
            },
          });
        },
      });
      return {
        content: [{ type: "text" as const, text: jsonRepairToolResultText(result) }],
        details: {
          runtime: "ambient-json-repair",
          toolName: "ambient_json_repair",
          status: result.repaired ? "repaired" : "failed",
          schemaName: result.schemaName,
          inputHash: result.inputHash,
          schemaHash: result.schemaHash,
          validation: result.validation,
          ...(result.repaired ? { repairedHash: result.repairedHash } : { missingInformation: result.missingInformation }),
        },
      };
    },
  });
}
