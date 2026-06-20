import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectStore } from "./projectBoardProjectStoreFacade";
import {
  assertProjectBoardMutationAllowedForActiveThread,
  configureProjectBoardDesktopContextService,
  createProjectBoardForProjectHost,
  recordActiveProjectBoardExecutionReadinessBlocker,
  requireProjectRuntimeHostForProjectBoardCard,
  type ProjectBoardDesktopRuntimeHost,
} from "./projectBoardDesktopContextService";

const tempRoots: string[] = [];

afterEach(async () => {
  delete process.env.AMBIENT_E2E_SKIP_PROJECT_BOARD_SOURCE_REFRESH;
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

describe("projectBoardDesktopContextService", () => {
  it("rejects project-board mutations from workflow recording chats", () => {
    const store = {
      getThread: vi.fn(() => ({ id: "thread-1", workflowRecording: { status: "recording" } })),
    } as unknown as ProjectStore;
    const host = { store, workspacePath: "/workspace", activeThreadId: "thread-1" };
    configureProjectBoardDesktopContextService({
      ...minimalDependencies(store, host),
      activeThreadIdForHost: () => "thread-1",
    });

    expect(() => assertProjectBoardMutationAllowedForActiveThread(host, "create a card")).toThrow(
      "Project boards are unavailable in Workflow Recording chats. Switch to a normal project chat to create a card.",
    );
  });

  it("resolves project-board card hosts through the configured store-record lookup", () => {
    const store = {
      getProjectBoardCard: vi.fn(),
    } as unknown as ProjectStore;
    const host = { store, workspacePath: "/workspace", activeThreadId: "thread-1" };
    const requireProjectRuntimeHostForStoreRecord = vi.fn((assertRecordExists: (targetStore: ProjectStore) => void) => {
      assertRecordExists(store);
      return host;
    });
    configureProjectBoardDesktopContextService({
      ...minimalDependencies(store, host),
      requireProjectRuntimeHostForStoreRecord,
    });

    expect(requireProjectRuntimeHostForProjectBoardCard("card-1")).toBe(host);
    expect(requireProjectRuntimeHostForStoreRecord).toHaveBeenCalledTimes(1);
    expect(store.getProjectBoardCard).toHaveBeenCalledWith("card-1");
  });

  it("creates a project board through the extracted desktop bootstrap owner", async () => {
    process.env.AMBIENT_E2E_SKIP_PROJECT_BOARD_SOURCE_REFRESH = "1";
    const { store, host } = await createStoreHarness();
    const state = { projects: [] } as never;
    const emitProjectStateIfActive = vi.fn();
    configureProjectBoardDesktopContextService({
      ...minimalDependencies(store, host),
      emitProjectStateIfActive,
      readStateForProjectHostAction: vi.fn(() => state),
      resolveRegisteredProjectPathForHost: vi.fn(() => store.getWorkspace().path),
      ensureProjectRuntimeHostForWorkspacePath: vi.fn(() => host),
      requireActiveProjectRuntimeHost: vi.fn(() => host),
    });

    try {
      await expect(createProjectBoardForProjectHost({
        projectId: "project-1",
        title: "Extracted board",
        summary: "Created through the context service.",
      })).resolves.toBe(state);

      expect(store.getActiveProjectBoard(host.activeThreadId)).toMatchObject({
        title: "Extracted board",
        summary: "Created through the context service.",
      });
      expect(emitProjectStateIfActive).toHaveBeenCalledWith(host);
    } finally {
      store.close();
    }
  });

  it("records execution readiness blockers and emits desktop state from the extracted owner", async () => {
    const { store, host } = await createStoreHarness();
    const emitDesktopState = vi.fn();
    configureProjectBoardDesktopContextService({
      ...minimalDependencies(store, host),
      emitDesktopState,
      readOrchestrationWorkflowReadiness: vi.fn(async () => ({
        status: "missing" as const,
        path: join(store.getWorkspace().path, "WORKFLOW.md"),
      })),
    });

    try {
      const board = store.createProjectBoard({ title: "Readiness board" });

      await recordActiveProjectBoardExecutionReadinessBlocker({ source: "auto_dispatch" }, store);

      const refreshed = store.getProjectBoard(board.id);
      expect(refreshed?.events?.find((event) => event.title === "Execution blocked: missing WORKFLOW.md")).toMatchObject({
        title: "Execution blocked: missing WORKFLOW.md",
        metadata: {
          blocker: "missing_workflow",
          source: "auto_dispatch",
        },
      });
      expect(emitDesktopState).toHaveBeenCalledTimes(1);
    } finally {
      store.close();
    }
  });
});

async function createStoreHarness(): Promise<{ store: ProjectStore; host: ProjectBoardDesktopRuntimeHost }> {
  const workspacePath = await mkdtemp(join(tmpdir(), "ambient-board-context-service-"));
  tempRoots.push(workspacePath);
  const store = new ProjectStore();
  store.openWorkspace(workspacePath);
  const activeThreadId = store.listThreads()[0]?.id ?? store.createThread("Project board test").id;
  const host = { store, workspacePath, activeThreadId };
  return { store, host };
}

function minimalDependencies(
  store: ProjectStore,
  host: ProjectBoardDesktopRuntimeHost,
): Parameters<typeof configureProjectBoardDesktopContextService>[0] {
  return {
    store: () => store,
    activeThreadId: () => host.activeThreadId,
    activeThreadIdForHost: (inputHost) => inputHost.activeThreadId,
    projectRuntimeHostForStore: (targetStore) => targetStore === store ? host : undefined,
    requireProjectRuntimeHostForStoreRecord: () => host,
    requireActiveProjectRuntimeHost: () => host,
    ensureProjectRuntimeHostForWorkspacePath: () => host,
    resolveRegisteredProjectPathForHost: () => host.workspacePath,
    emitDesktopState: vi.fn(),
    emitProjectStateIfActive: vi.fn(),
    emitOrchestrationUpdated: vi.fn(),
    readState: vi.fn(() => ({}) as never),
    readStateForProjectHostAction: vi.fn(() => ({}) as never),
    readOrchestrationWorkflowReadiness: vi.fn(async () => ({ status: "ready" as const })),
    workflowAutoDispatchDisabledMessage: vi.fn(() => "auto-dispatch is disabled."),
  };
}
