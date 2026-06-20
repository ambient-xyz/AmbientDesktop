import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  configureProjectBoardDesktopContextService,
  type ProjectBoardDesktopRuntimeHost,
} from "./projectBoardDesktopContextService";
import type { ProjectStore } from "./projectBoardProjectStoreFacade";
import { claimProjectBoardGitCardArtifacts } from "./projectBoardGitSync";
import { suggestProjectBoardProof } from "./projectBoardProofDefaultsDesktopService";
import {
  createProjectBoardDesktopIpcDependencies,
  type ProjectBoardDesktopIpcHostDependencies,
} from "./projectBoardDesktopIpcDependencies";

function hostDependencies(): ProjectBoardDesktopIpcHostDependencies {
  return {
    emitProjectStateIfActive: vi.fn(),
    readStateForProjectHostAction: vi.fn(),
    requireProjectRuntimeHostForOrchestrationTask: vi.fn(),
    requireProjectRuntimeHostForPlannerPlanArtifact: vi.fn(),
    scheduleAutoDispatch: vi.fn(),
    setProjectHostActiveThreadId: vi.fn(),
  };
}

describe("createProjectBoardDesktopIpcDependencies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps host-owned callbacks injectable while owning Project Board service imports", () => {
    const sharedHostDependencies = hostDependencies();
    const deps = createProjectBoardDesktopIpcDependencies(sharedHostDependencies);

    expect(deps.emitProjectStateIfActive).toBe(sharedHostDependencies.emitProjectStateIfActive);
    expect(deps.scheduleAutoDispatch).toBe(sharedHostDependencies.scheduleAutoDispatch);
    expect(deps.claimProjectBoardGitCardArtifacts).toBe(claimProjectBoardGitCardArtifacts);
    expect(deps.suggestProjectBoardProof).toBe(suggestProjectBoardProof);
  });

  it("resolves Project Board card hosts through the configured desktop context service", () => {
    const getProjectBoardCard = vi.fn();
    const store = { getProjectBoardCard } as unknown as ProjectStore;
    const host = {
      store,
      workspacePath: "/tmp/project-board-ipc",
      activeThreadId: "thread-1",
    } satisfies ProjectBoardDesktopRuntimeHost;
    const requireProjectRuntimeHostForStoreRecord = vi.fn((assertRecordExists: (targetStore: ProjectStore) => void) => {
      assertRecordExists(store);
      return host;
    });
    configureProjectBoardDesktopContextService({
      store: () => store,
      activeThreadId: () => "thread-1",
      activeThreadIdForHost: () => "thread-1",
      projectRuntimeHostForStore: () => host,
      requireProjectRuntimeHostForStoreRecord,
      requireActiveProjectRuntimeHost: () => host,
      ensureProjectRuntimeHostForWorkspacePath: () => host,
      resolveRegisteredProjectPathForHost: () => "/tmp/project-board-ipc",
      emitDesktopState: vi.fn(),
      emitProjectStateIfActive: vi.fn(),
      emitOrchestrationUpdated: vi.fn(),
      readState: () => ({}) as never,
      readStateForProjectHostAction: () => ({}) as never,
      readOrchestrationWorkflowReadiness: vi.fn(async () => ({ status: "ready" as const })),
      workflowAutoDispatchDisabledMessage: () => "auto-dispatch disabled",
    });

    const deps = createProjectBoardDesktopIpcDependencies(hostDependencies());

    expect(deps.requireProjectRuntimeHostForProjectBoardCard("card-1")).toBe(host);
    expect(requireProjectRuntimeHostForStoreRecord).toHaveBeenCalledTimes(1);
    expect(getProjectBoardCard).toHaveBeenCalledWith("card-1");
  });
});
