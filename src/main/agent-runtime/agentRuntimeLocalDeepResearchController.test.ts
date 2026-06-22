import { describe, expect, it } from "vitest";

import type { LocalModelResourcePolicyDecision } from "../../shared/localRuntimeTypes";
import type {
  PermissionPromptResolution,
  PermissionRequest,
} from "../../shared/permissionTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import {
  AgentRuntimeLocalDeepResearchController,
  type AgentRuntimeLocalDeepResearchControllerOptions,
} from "./agentRuntimeLocalDeepResearchController";

describe("AgentRuntimeLocalDeepResearchController", () => {
  it("requests permission and completes the wait for resource-limit overrides", async () => {
    const permissionRequests: Array<Omit<PermissionRequest, "id">> = [];
    const waitFinishes: unknown[] = [];
    const controller = new AgentRuntimeLocalDeepResearchController(options({
      beginPermissionWait: (_threadId, input) => {
        expect(input).toMatchObject({
          toolName: "ambient_local_deep_research_run",
          requestId: "permission-1",
          title: "Exceed local model memory ceiling?",
          risk: "plugin-tool",
        });
        return (finish) => waitFinishes.push(finish);
      },
      permissions: {
        request: async (request, requestOptions): Promise<PermissionPromptResolution> => {
          permissionRequests.push(request);
          requestOptions?.onRequest?.({
            ...request,
            id: "permission-1",
          });
          return { allowed: true, mode: "allow_once" };
        },
      },
    }));

    await expect(controller.approveResourceLimitExceed({
      threadId: "thread-1",
      workspace,
      decision: resourceDecision(),
    })).resolves.toBe(true);

    expect(permissionRequests).toHaveLength(1);
    expect(permissionRequests[0]).toMatchObject({
      threadId: "thread-1",
      workspacePath: "/repo",
      projectPath: "/repo",
      toolName: "ambient_local_deep_research_run",
      risk: "plugin-tool",
      reusableScopes: ["thread"],
      grantActionKind: "plugin_tool_execute",
      grantTargetKind: "risk",
      grantTargetLabel: "local-model-memory-ceiling",
    });
    expect(permissionRequests[0]?.detail).toContain("Exceeds ceiling by 512 B.");
    expect(permissionRequests[0]?.detail).toContain("Ceiling: 2.00 KB.");
    expect(waitFinishes).toEqual([{ allowed: true, mode: "allow_once" }]);
  });
});

const workspace: WorkspaceState = {
  path: "/repo",
  name: "Repo",
  statePath: "/repo/.ambient",
  sessionPath: "/repo/.ambient/session",
};

function options(
  overrides: Partial<AgentRuntimeLocalDeepResearchControllerOptions> = {},
): AgentRuntimeLocalDeepResearchControllerOptions {
  return {
    store: {
      getThread: (id) => ({ id }) as ReturnType<AgentRuntimeLocalDeepResearchControllerOptions["store"]["getThread"]>,
      getWorkspace: () => workspace,
    },
    features: {},
    providerRuntime: {
      readLocalModelRuntimeLifecycleStatus: async () => ({}) as ReturnType<AgentRuntimeLocalDeepResearchControllerOptions["providerRuntime"]["readLocalModelRuntimeLifecycleStatus"]>,
    },
    webResearch: {
      createLocalDeepResearchWebBroker: () => ({
        search: () => ({ text: "", attempts: [] }),
        visit: () => ({ text: "", attempts: [] }),
      }),
      discoverWebResearchMcpProviderTools: async () => [],
    },
    permissions: {
      request: async () => ({ allowed: false, mode: "deny" }),
    },
    beginPermissionWait: () => undefined,
    resolveFirstPartyPluginPermission: async () => true,
    emit: () => undefined,
    ...overrides,
  };
}

function resourceDecision(): LocalModelResourcePolicyDecision {
  return {
    outcome: "ask-to-exceed",
    reason: "over limit",
    activeEstimatedResidentMemoryBytes: 1024,
    requestedEstimatedResidentMemoryBytes: 1536,
    projectedEstimatedResidentMemoryBytes: 2560,
    maxResidentMemoryBytes: 2048,
    exceededByBytes: 512,
    unloadCandidateIds: [],
  };
}
