import { describe, expect, it, vi } from "vitest";

import type { PrivilegedActionAdapterStatus } from "../../../shared/permissionTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import {
  registerAgentRuntimePrivilegedActionTools,
  type AgentRuntimePrivilegedActionToolOptions,
} from "./agentRuntimePrivilegedActionTools";
import type { PrivilegedActionAdapter } from "../../privileged-action/privilegedActionAdapter";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimePrivilegedActionTools", () => {
  it("registers privileged action tools in the existing order", async () => {
    const registeredTools: RegisteredTool[] = [];
    const statusCalls: string[] = [];

    registerAgentRuntimePrivilegedActionTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      privilegedActionAdapter: () => adapter(statusCalls),
    }));

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_privileged_action_status",
      "ambient_privileged_action_request",
    ]);
    expect(registeredTools.every((tool) => tool.executionMode === "sequential")).toBe(true);

    const result = await registeredTools[0]!.execute("privileged-status", {});

    expect(statusCalls).toEqual(["status"]);
    expect(result.details).toMatchObject({
      runtime: "privileged-action",
      toolName: "ambient_privileged_action_status",
      status: "complete",
    });
  });
});

function options(
  overrides: Partial<AgentRuntimePrivilegedActionToolOptions> = {},
): AgentRuntimePrivilegedActionToolOptions {
  return {
    threadId: "thread-1",
    workspace: workspace(),
    getThread: () => thread(),
    privilegedActionAdapter: () => adapter([]),
    resolveFirstPartyPluginPermission: vi.fn(async () => true),
    writePrivilegedActionRedactedLog: vi.fn(async () => "/tmp/workspace/.ambient/logs/privileged-action.json"),
    ...overrides,
  };
}

function workspace(): WorkspaceState {
  return {
    path: "/tmp/workspace",
    name: "workspace",
    statePath: "/tmp/workspace/.ambient",
    sessionPath: "/tmp/workspace/.ambient/session",
  };
}

function thread(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "thread-1",
    collaborationMode: "default",
    permissionMode: "default",
    title: "Thread",
    ...overrides,
  } as ThreadSummary;
}

function adapter(statusCalls: string[]): PrivilegedActionAdapter {
  return {
    name: "dry-run",
    status: () => {
      statusCalls.push("status");
      return privilegedStatus();
    },
    execute: async () => {
      throw new Error("not exercised");
    },
  };
}

function privilegedStatus(): PrivilegedActionAdapterStatus {
  return {
    schemaVersion: "ambient-privileged-action-v1",
    execution: "dry-run-only",
    adapterStatus: "not-implemented",
    selectedAdapter: "dry-run",
    selectedAdapterExecutesPrivilegedCommands: false,
    policyPlanning: "available",
    credentialCapture: "rehearsal-available",
    supportedPurposes: ["install_system_package"],
    policyHints: [],
    adapters: [],
    guidance: [],
  };
}
