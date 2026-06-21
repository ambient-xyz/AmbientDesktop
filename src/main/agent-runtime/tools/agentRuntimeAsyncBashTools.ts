import type {
  AgentToolResult,
  ExtensionAPI,
} from "@mariozechner/pi-coding-agent";

import {
  asyncBashToolDescriptor,
  registerDesktopTool,
} from "../agentRuntimeDesktopToolFacade";
import type { ToolRunnerPolicy } from "../agentRuntimeToolRuntimeFacade";
import {
  asyncBashSnapshotDetails,
  formatAsyncBashSnapshotForTool,
  type AgentRuntimeAsyncBashJobService,
  type AsyncBashJobSnapshot,
} from "./agentRuntimeAsyncBashJobs";
import { interruptedToolCallRecoveryBashRejected } from "./agentRuntimeToolRunnerBashTool";

export interface AgentRuntimeAsyncBashToolRegistrationOptions {
  threadId: string;
  workspacePath: string;
  getRunId?: () => string | undefined;
  getPolicy: () => ToolRunnerPolicy;
  asyncBashJobs: AgentRuntimeAsyncBashJobService;
  scheduleThreadWake?: (input: AgentRuntimeThreadWakeToolInput) => Promise<AgentRuntimeThreadWakeToolResult>;
  interruptedToolCallRecoveryToolsAvailable?: () => boolean;
}

export interface AgentRuntimeThreadWakeToolInput {
  threadId: string;
  reason: string;
  dueAt: string;
  jobId?: string;
  payload?: Record<string, unknown>;
}

export interface AgentRuntimeThreadWakeToolResult {
  wakeId: string;
  threadId: string;
  dueAt: string;
  reason: string;
  jobId?: string;
}

export function registerAgentRuntimeAsyncBashTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AgentRuntimeAsyncBashToolRegistrationOptions,
): void {
  registerDesktopTool(pi, asyncBashToolDescriptor("bash_start"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal) => {
      try {
        const recoveryReadRejection = interruptedToolCallRecoveryBashRejected(
          params,
          options.interruptedToolCallRecoveryToolsAvailable?.() ?? false,
          "bash_start",
        );
        if (recoveryReadRejection) return recoveryReadRejection;
        const input = paramsRecord(params);
        const snapshot = await options.asyncBashJobs.start({
          threadId: options.threadId,
          runId: options.getRunId?.(),
          workspacePath: options.workspacePath,
          command: requiredString(input, "cmd"),
          cwd: optionalString(input, "cwd"),
          policy: options.getPolicy(),
          yieldMs: optionalNumber(input, "yield_ms"),
          idleTimeoutMs: optionalNumber(input, "idle_timeout_ms"),
          tty: optionalBoolean(input, "tty"),
          signal,
        });
        return snapshotToolResult(snapshot);
      } catch (error) {
        return errorToolResult("bash_start", error);
      }
    },
  });

  registerDesktopTool(pi, asyncBashToolDescriptor("bash_poll"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      try {
        const input = paramsRecord(params);
        const snapshot = await options.asyncBashJobs.pollForThread(options.threadId, requiredString(input, "job_id"), {
          sinceSeq: optionalNumber(input, "since_seq"),
          waitMs: optionalNumber(input, "wait_ms"),
          maxBytes: optionalNumber(input, "max_bytes"),
        });
        return snapshotToolResult(snapshot);
      } catch (error) {
        return errorToolResult("bash_poll", error);
      }
    },
  });

  registerDesktopTool(pi, asyncBashToolDescriptor("bash_write"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      try {
        const input = paramsRecord(params);
        const snapshot = await options.asyncBashJobs.writeForThread(
          options.threadId,
          requiredString(input, "job_id"),
          requiredString(input, "chars"),
          optionalNumber(input, "wait_ms") ?? 0,
        );
        return snapshotToolResult(snapshot);
      } catch (error) {
        return errorToolResult("bash_write", error);
      }
    },
  });

  registerDesktopTool(pi, asyncBashToolDescriptor("bash_cancel"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      try {
        const input = paramsRecord(params);
        const snapshot = await options.asyncBashJobs.cancelForThread(
          options.threadId,
          requiredString(input, "job_id"),
          optionalString(input, "reason"),
        );
        return snapshotToolResult(snapshot);
      } catch (error) {
        return errorToolResult("bash_cancel", error);
      }
    },
  });

  registerDesktopTool(pi, asyncBashToolDescriptor("thread_wake_schedule"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      if (!options.scheduleThreadWake) {
        return errorToolResult("thread_wake_schedule", new Error("Thread wake scheduling is unavailable."));
      }
      try {
        const input = paramsRecord(params);
        const dueAt = resolveWakeDueAt(input);
        const result = await options.scheduleThreadWake({
          threadId: options.threadId,
          dueAt,
          reason: requiredString(input, "reason"),
          jobId: optionalString(input, "job_id"),
          payload: optionalRecord(input, "payload"),
        });
        return {
          content: [{
            type: "text",
            text: [
              `wake_id: ${result.wakeId}`,
              `thread_id: ${result.threadId}`,
              `due_at: ${result.dueAt}`,
              result.jobId ? `job_id: ${result.jobId}` : undefined,
              `reason: ${result.reason}`,
            ].filter((line): line is string => line !== undefined).join("\n"),
          }],
          details: {
            runtime: "ambient-thread-wake",
            toolName: "thread_wake_schedule",
            status: "scheduled",
            wakeId: result.wakeId,
            threadId: result.threadId,
            dueAt: result.dueAt,
            jobId: result.jobId,
          },
        };
      } catch (error) {
        return errorToolResult("thread_wake_schedule", error);
      }
    },
  });
}

function snapshotToolResult(snapshot: AsyncBashJobSnapshot): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{
      type: "text",
      text: formatAsyncBashSnapshotForTool(snapshot),
    }],
    details: asyncBashSnapshotDetails(snapshot),
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
      runtime: "ambient-async-bash",
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

function optionalBoolean(input: Record<string, unknown>, key: string): boolean | undefined {
  const value = input[key];
  return typeof value === "boolean" ? value : undefined;
}

function optionalRecord(input: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = input[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function resolveWakeDueAt(input: Record<string, unknown>): string {
  const afterMs = optionalNumber(input, "after_ms");
  if (afterMs !== undefined) return new Date(Date.now() + Math.max(0, Math.floor(afterMs))).toISOString();
  const at = optionalString(input, "at");
  if (!at) throw new Error("thread_wake_schedule requires after_ms or at.");
  const dueMs = Date.parse(at);
  if (!Number.isFinite(dueMs)) throw new Error("thread_wake_schedule at must be a valid ISO timestamp.");
  return new Date(dueMs).toISOString();
}
