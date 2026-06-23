import type {
  AgentToolResult,
  ExtensionAPI,
} from "@mariozechner/pi-coding-agent";

import {
  longContextToolDescriptor,
  registerDesktopTool,
} from "../agentRuntimeDesktopToolFacade";
import type {
  CreateLambdaRlmToolOptions,
  LambdaRlmToolExecutionContext,
} from "../agentRuntimeToolRuntimeFacade";
import {
  asyncLongContextSnapshotDetails,
  formatAsyncLongContextSnapshotForTool,
  type AgentRuntimeAsyncLongContextJobService,
  type AsyncLongContextJobSnapshot,
} from "./agentRuntimeAsyncLongContextJobs";

export interface AgentRuntimeAsyncLongContextToolRegistrationOptions {
  threadId: string;
  workspacePath: string;
  getRunId?: () => string | undefined;
  asyncLongContextJobs: AgentRuntimeAsyncLongContextJobService;
  toolOptions: CreateLambdaRlmToolOptions;
}

export function registerAgentRuntimeAsyncLongContextTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AgentRuntimeAsyncLongContextToolRegistrationOptions,
): void {
  registerDesktopTool(pi, longContextToolDescriptor("long_context_start"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal, _onUpdate, ctx) => {
      try {
        const input = paramsRecord(params);
        const snapshot = await options.asyncLongContextJobs.start({
          threadId: options.threadId,
          runId: options.getRunId?.(),
          workspacePath: options.workspacePath,
          toolOptions: options.toolOptions,
          params,
          ctx: ctx as LambdaRlmToolExecutionContext | undefined,
          yieldMs: optionalNumber(input, "yield_ms"),
          pollHintMs: optionalNumber(input, "poll_hint_ms"),
          signal,
        });
        return snapshotToolResult(snapshot);
      } catch (error) {
        return errorToolResult("long_context_start", error);
      }
    },
  });

  registerDesktopTool(pi, longContextToolDescriptor("long_context_poll"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      try {
        const input = paramsRecord(params);
        const snapshot = await options.asyncLongContextJobs.pollForThread(
          options.threadId,
          requiredString(input, "job_id"),
          {
            sinceSeq: optionalNumber(input, "since_seq"),
            waitMs: optionalNumber(input, "wait_ms"),
            maxBytes: optionalNumber(input, "max_bytes"),
          },
        );
        return snapshotToolResult(snapshot);
      } catch (error) {
        return errorToolResult("long_context_poll", error);
      }
    },
  });

  registerDesktopTool(pi, longContextToolDescriptor("long_context_cancel"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      try {
        const input = paramsRecord(params);
        const snapshot = await options.asyncLongContextJobs.cancelForThread(
          options.threadId,
          requiredString(input, "job_id"),
          optionalString(input, "reason"),
        );
        return snapshotToolResult(snapshot);
      } catch (error) {
        return errorToolResult("long_context_cancel", error);
      }
    },
  });
}

function snapshotToolResult(snapshot: AsyncLongContextJobSnapshot): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{
      type: "text",
      text: formatAsyncLongContextSnapshotForTool(snapshot),
    }],
    details: asyncLongContextSnapshotDetails(snapshot),
  };
}

function errorToolResult(toolName: string, error: unknown): AgentToolResult<Record<string, unknown>> {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{
      type: "text",
      text: message,
    }],
    details: {
      runtime: "ambient-async-long-context",
      toolName,
      status: "error",
      error: message,
    },
  };
}

function paramsRecord(params: unknown): Record<string, unknown> {
  if (params && typeof params === "object" && !Array.isArray(params)) return params as Record<string, unknown>;
  return {};
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}

function optionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalNumber(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}
