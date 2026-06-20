import { describe, expect, it, vi } from "vitest";
import type { DesktopEvent, DesktopState } from "../../shared/desktopTypes";
import type { AmbientPermissionGrant, PermissionAuditEntry } from "../../shared/permissionTypes";
import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import { createDesktopStateEventService, type DesktopStateEventHost, type DesktopStateEventStore } from "./desktopStateEventService";

class FakeStore implements DesktopStateEventStore {
  constructor(
    private readonly workspacePath: string,
    private readonly threadWorkspacePaths: Record<string, string> = {},
    private readonly workflowProjectPaths: Record<string, string | undefined> = {},
  ) {}

  getWorkspace(): { path: string } {
    return { path: this.workspacePath };
  }

  getThread(threadId: string): { workspacePath: string } {
    const workspacePath = this.threadWorkspacePaths[threadId];
    if (!workspacePath) throw new Error(`Missing thread ${threadId}`);
    return { workspacePath };
  }

  getWorkflowAgentThreadSummary(workflowThreadId: string): { projectPath?: string } {
    if (!(workflowThreadId in this.workflowProjectPaths)) throw new Error(`Missing workflow thread ${workflowThreadId}`);
    return { projectPath: this.workflowProjectPaths[workflowThreadId] };
  }
}

type FakeHost = DesktopStateEventHost<FakeStore>;

function createHarness(options: { activeHost?: FakeHost } = {}) {
  const events: DesktopEvent[] = [];
  const readState = vi.fn((threadId?: string, readOptions?: { markActiveRead?: boolean }) => ({
    stateRevision: threadId === "active-thread" ? 11 : 22,
    activeThreadId: threadId,
    readOptions,
  }) as unknown as DesktopState);
  const store = new FakeStore(
    "/workspace/default",
    {
      "thread-1": "/workspace/thread-1",
      "thread-2": "/workspace/thread-2",
      "planner-thread": "/workspace/planner",
    },
    {
      "workflow-1": "/workspace/workflow",
      "workflow-default": undefined,
    },
  );
  const service = createDesktopStateEventService<FakeStore, FakeHost>({
    activeThreadId: () => "active-thread",
    activeWorkspacePath: () => "/workspace/active",
    defaultStore: () => store,
    emitDesktopEvent: (event) => events.push(event),
    isActiveProjectRuntimeHost: (host) => host === options.activeHost,
    readState,
  });
  return { events, readState, service, store };
}

describe("desktopStateEventService", () => {
  it("emits desktop state through the injected reader and defaults to a non-read-marking update", () => {
    const { events, readState, service } = createHarness();

    service.emitDesktopState();

    expect(readState).toHaveBeenCalledWith("active-thread", { markActiveRead: false });
    expect(events).toEqual([
      {
        type: "state",
        state: expect.objectContaining({ activeThreadId: "active-thread" }) as DesktopState,
      },
    ]);
  });

  it("scopes workflow and thread events to their workspaces", () => {
    const { events, service } = createHarness();

    service.emitWorkflowUpdated();
    service.emitWorkflowEvent({
      type: "workflow-run-started",
      runId: "run-1",
      artifactId: "artifact-1",
      workflowThreadId: "wf-1",
    }, "/workspace/workflow");
    service.emitOrchestrationUpdated("/workspace/orchestration");
    service.emitPluginCatalogUpdated("/workspace/plugins");
    service.emitThreadUpdated({ id: "thread-1", workspacePath: "/workspace/thread-1" } as never);

    expect(events).toEqual([
      { type: "workflow-updated", workspacePath: "/workspace/active" },
      {
        type: "workflow-run-started",
        runId: "run-1",
        artifactId: "artifact-1",
        workflowThreadId: "wf-1",
        workspacePath: "/workspace/workflow",
      },
      { type: "orchestration-updated", workspacePath: "/workspace/orchestration" },
      { type: "plugin-catalog-updated", workspacePath: "/workspace/plugins" },
      {
        type: "thread-updated",
        thread: { id: "thread-1", workspacePath: "/workspace/thread-1" },
        workspacePath: "/workspace/thread-1",
      },
    ]);
  });

  it("resolves permission and planner event workspace paths with existing fallback ordering", () => {
    const { events, service } = createHarness();
    const audit = { threadId: "thread-1" } as PermissionAuditEntry;
    const threadGrant = { threadId: "thread-2" } as AmbientPermissionGrant;
    const workflowGrant = { workflowThreadId: "workflow-1" } as AmbientPermissionGrant;
    const workflowDefaultGrant = { workflowThreadId: "workflow-default" } as AmbientPermissionGrant;
    const missingGrant = { threadId: "missing" } as AmbientPermissionGrant;
    const artifact = { threadId: "planner-thread" } as PlannerPlanArtifact;

    expect(service.permissionAuditWorkspacePath(audit)).toBe("/workspace/thread-1");
    expect(service.permissionGrantWorkspacePath({ projectPath: "/workspace/project" } as AmbientPermissionGrant)).toBe("/workspace/project");
    expect(service.permissionGrantWorkspacePath({ workspacePath: "/workspace/grant" } as AmbientPermissionGrant)).toBe("/workspace/grant");
    expect(service.permissionGrantWorkspacePath(threadGrant)).toBe("/workspace/thread-2");
    expect(service.permissionGrantWorkspacePath(workflowGrant)).toBe("/workspace/workflow");
    expect(service.permissionGrantWorkspacePath(workflowDefaultGrant)).toBe("/workspace/default");
    expect(service.permissionGrantWorkspacePath(missingGrant)).toBe("/workspace/default");
    expect(service.plannerPlanArtifactWorkspacePath(artifact)).toBe("/workspace/planner");

    service.emitPermissionAuditCreated(audit);
    service.emitPermissionGrantCreated(threadGrant);
    service.emitPermissionGrantRevoked(workflowGrant);
    service.emitPlannerPlanArtifactUpdated(artifact);

    expect(events).toEqual([
      { type: "permission-audit-created", entry: audit, workspacePath: "/workspace/thread-1" },
      { type: "permission-grant-created", grant: threadGrant, workspacePath: "/workspace/thread-2" },
      { type: "permission-grant-revoked", grant: workflowGrant, workspacePath: "/workspace/workflow" },
      { type: "planner-plan-artifact-updated", artifact, workspacePath: "/workspace/planner" },
    ]);
  });

  it("emits project host state only when active and falls back to active state for inactive recording-library changes", () => {
    const activeHost: FakeHost = {
      workspacePath: "/workspace/active-host",
      activeThreadId: "host-thread",
      store: new FakeStore("/workspace/active-host", { "host-thread": "/workspace/active-host" }),
    };
    const inactiveHost: FakeHost = {
      workspacePath: "/workspace/inactive-host",
      activeThreadId: "inactive-thread",
      store: new FakeStore("/workspace/inactive-host", { "inactive-thread": "/workspace/inactive-host" }),
    };
    const { events, readState, service } = createHarness({ activeHost });

    service.emitProjectScopedEvent(inactiveHost, { type: "workflow-updated" });
    service.emitProjectStateIfActive(inactiveHost);
    service.emitProjectStateIfActive(activeHost);
    service.emitWorkflowRecordingLibraryStateChanged(inactiveHost);
    service.emitWorkflowRecordingLibraryStateChanged(activeHost, "explicit-thread");

    expect(readState).toHaveBeenNthCalledWith(1, "host-thread");
    expect(readState).toHaveBeenNthCalledWith(2, "active-thread", { markActiveRead: false });
    expect(readState).toHaveBeenNthCalledWith(3, "explicit-thread");
    expect(events).toEqual([
      { type: "workflow-updated", workspacePath: "/workspace/inactive-host" },
      { type: "state", state: expect.objectContaining({ activeThreadId: "host-thread" }) as DesktopState },
      { type: "state", state: expect.objectContaining({ activeThreadId: "active-thread" }) as DesktopState },
      { type: "state", state: expect.objectContaining({ activeThreadId: "explicit-thread" }) as DesktopState },
    ]);
  });
});
