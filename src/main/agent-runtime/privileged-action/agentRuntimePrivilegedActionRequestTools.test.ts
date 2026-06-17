import { describe, expect, it } from "vitest";

import type { PrivilegedActionNativeRequest, ThreadSummary, WorkspaceState } from "../../../shared/types";
import { dryRunPrivilegedActionNativeRequest, privilegedActionAdapterStatus } from "../../privileged-action/privilegedAction";
import type { PrivilegedActionAdapter } from "../../privileged-action/privilegedActionAdapter";
import {
  registerPrivilegedActionRequestTools,
  type PrivilegedActionRequestToolPermissionRequest,
} from "./agentRuntimePrivilegedActionRequestTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("registerPrivilegedActionRequestTools", () => {
  it("blocks privileged action requests in Planner Mode before permission", async () => {
    const registeredTools: RegisteredTool[] = [];
    const permissionRequests: PrivilegedActionRequestToolPermissionRequest[] = [];
    const adapter = dryRunAdapter();

    registerPrivilegedActionRequestTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      getThread: () => thread({ collaborationMode: "planner" }),
      privilegedActionAdapter: () => adapter,
      resolveFirstPartyPluginPermission: async (request) => {
        permissionRequests.push(request);
        return true;
      },
    }));

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_privileged_action_request"]);
    const tool = registeredTools[0]!;
    expect(tool.executionMode).toBe("sequential");

    await expect(tool.execute("privileged-planner", privilegedInput())).rejects.toThrow("Privileged action handoff is blocked in Planner Mode.");
    expect(permissionRequests).toEqual([]);
    expect(adapter.executions).toEqual([]);
  });

  it("returns blocked when the approval prompt is denied", async () => {
    const registeredTools: RegisteredTool[] = [];
    const permissionRequests: PrivilegedActionRequestToolPermissionRequest[] = [];
    const adapter = dryRunAdapter();

    registerPrivilegedActionRequestTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      privilegedActionAdapter: () => adapter,
      resolveFirstPartyPluginPermission: async (request) => {
        permissionRequests.push(request);
        return false;
      },
    }));

    await expect(registeredTools[0]!.execute("privileged-denied", privilegedInput())).rejects.toThrow("Ambient privileged action handoff blocked by approval prompt.");

    expect(permissionRequests).toHaveLength(1);
    expect(permissionRequests[0]).toMatchObject({
      thread: { id: "thread-1" },
      workspace: { path: "/tmp/workspace" },
      toolName: "ambient_privileged_action_request",
      title: "Review privileged action: install_system_package?",
      risk: "privileged-action",
      reusableScopes: [],
      grantTargetLabel: "Privileged action install_system_package",
      allowedReason: "Ambient privileged action handoff approved by Ambient permission grant policy.",
      deniedReason: "Ambient privileged action handoff prompt denied or timed out.",
    });
    expect(permissionRequests[0]!.detail).toContain("Workspace: /tmp/workspace");
    expect(permissionRequests[0]!.grantTargetIdentity).toMatch(/^ambient_privileged_action_request\0install_system_package\0brew\0darwin\0/);
    expect(adapter.executions).toEqual([]);
  });

  it("executes approved dry-run handoffs and materializes the redacted log path", async () => {
    const registeredTools: RegisteredTool[] = [];
    const updates: any[] = [];
    const adapter = dryRunAdapter();
    const logWrites: Array<{ workspacePath: string; requestId: string }> = [];

    registerPrivilegedActionRequestTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      privilegedActionAdapter: () => adapter,
      writePrivilegedActionRedactedLog: async (workspacePath, result) => {
        logWrites.push({ workspacePath, requestId: result.requestId });
        return "/tmp/workspace/.ambient/logs/privileged-action.json";
      },
    }));

    const result = await registeredTools[0]!.execute("privileged-approved", privilegedInput(), undefined, (update: any) => updates.push(update));

    expect(updates).toEqual([
      expect.objectContaining({
        content: [{ type: "text", text: "Recording privileged action handoff for Ambient review with dry-run. No privileged command will run unless a native adapter reports successful execution." }],
        details: expect.objectContaining({
          runtime: "privileged-action",
          toolName: "ambient_privileged_action_request",
          status: "running",
          adapter: "dry-run",
          commandCount: 1,
        }),
      }),
    ]);
    expect(adapter.executions).toHaveLength(1);
    expect(adapter.executions[0]).toMatchObject({
      credentialCapture: "not-requested",
      credential: undefined,
    });
    expect(logWrites).toEqual([{ workspacePath: "/tmp/workspace", requestId: adapter.executions[0]!.request.requestId }]);
    expect(result.content[0].text).toContain("Ambient privileged action handoff");
    expect(result.details).toMatchObject({
      runtime: "privileged-action",
      toolName: "ambient_privileged_action_request",
      status: "not-executed",
      adapter: "dry-run",
      credentialCapture: "not-requested",
      nativeRequest: {
        workspacePath: "/tmp/workspace",
        adapterReadiness: expect.objectContaining({
          execution: "dry-run-only",
          actionCategory: "install_system_package",
        }),
      },
      nativeResult: expect.objectContaining({
        logPath: "/tmp/workspace/.ambient/logs/privileged-action.json",
      }),
      commandCount: 1,
    });
  });
});

function options(
  overrides: Partial<Parameters<typeof registerPrivilegedActionRequestTools>[1]> = {},
): Parameters<typeof registerPrivilegedActionRequestTools>[1] {
  return {
    threadId: "thread-1",
    workspace: workspace(),
    getThread: () => thread(),
    privilegedActionAdapter: () => dryRunAdapter(),
    resolveFirstPartyPluginPermission: async () => true,
    writePrivilegedActionRedactedLog: async () => "/tmp/workspace/.ambient/logs/privileged-action.json",
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

function privilegedInput(): Record<string, unknown> {
  return {
    kind: "privileged_action_template",
    purpose: "install_system_package",
    packageName: "brew",
    platform: "darwin",
    reason: "Install a package manager dependency.",
    commands: [
      {
        exe: "brew",
        args: ["install", "example"],
        rationale: "Install example dependency.",
      },
    ],
  };
}

function dryRunAdapter(): PrivilegedActionAdapter & { executions: Array<{ request: PrivilegedActionNativeRequest; credential?: string; credentialCapture?: string }> } {
  const executions: Array<{ request: PrivilegedActionNativeRequest; credential?: string; credentialCapture?: string }> = [];
  return {
    name: "dry-run",
    executions,
    status: () => privilegedActionAdapterStatus({
      credentialRehearsalAvailable: true,
      selectedAdapter: "dry-run",
    }),
    execute: async (input) => {
      executions.push(input);
      return dryRunPrivilegedActionNativeRequest(input.request, {
        credentialCapture: input.credentialCapture,
      });
    },
  };
}
