import type { DesktopEvent, DesktopState } from "../../shared/desktopTypes";
import type { AmbientPermissionGrant, PermissionAuditEntry } from "../../shared/permissionTypes";
import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import type { ThreadSummary } from "../../shared/threadTypes";

export type DesktopStateReadOptions = { markActiveRead?: boolean };

export interface DesktopStateEventStore {
  getWorkspace(): { path: string };
  getThread(threadId: string): { workspacePath: string };
  getWorkflowAgentThreadSummary(workflowThreadId: string): { projectPath?: string };
}

export interface DesktopStateEventHost<Store extends DesktopStateEventStore = DesktopStateEventStore> {
  workspacePath: string;
  store: Store;
  activeThreadId: string;
}

export type WorkflowDesktopEvent = Extract<
  DesktopEvent,
  {
    type:
      | "workflow-updated"
      | "workflow-run-started"
      | "workflow-discovery-progress"
      | "workflow-exploration-progress"
      | "workflow-compile-progress";
  }
>;

export interface DesktopStateEventServiceDependencies<
  Store extends DesktopStateEventStore,
  Host extends DesktopStateEventHost<Store>,
> {
  activeThreadId(): string;
  activeWorkspacePath(): string;
  defaultStore(): Store;
  emitDesktopEvent(event: DesktopEvent): void;
  isActiveProjectRuntimeHost(host: Host): boolean;
  readState(threadId?: string, options?: DesktopStateReadOptions): DesktopState;
}

export interface DesktopStateEventService<
  Store extends DesktopStateEventStore,
  Host extends DesktopStateEventHost<Store>,
> {
  emitDesktopState(options?: DesktopStateReadOptions): void;
  emitWorkflowEvent(event: WorkflowDesktopEvent, workspacePath?: string): void;
  emitWorkflowUpdated(workspacePath?: string): void;
  emitOrchestrationUpdated(workspacePath?: string): void;
  emitPluginCatalogUpdated(workspacePath?: string): void;
  emitThreadUpdated(thread: ThreadSummary): void;
  permissionAuditWorkspacePath(entry: PermissionAuditEntry, targetStore?: Store): string;
  permissionGrantWorkspacePath(grant: AmbientPermissionGrant, targetStore?: Store): string;
  emitPermissionAuditCreated(entry: PermissionAuditEntry, workspacePath?: string): void;
  emitPermissionGrantCreated(grant: AmbientPermissionGrant, workspacePath?: string): void;
  emitPermissionGrantRevoked(grant: AmbientPermissionGrant, workspacePath?: string): void;
  plannerPlanArtifactWorkspacePath(artifact: PlannerPlanArtifact, targetStore?: Store): string;
  emitPlannerPlanArtifactUpdated(artifact: PlannerPlanArtifact, targetStore?: Store): void;
  emitProjectScopedEvent(host: Host, event: DesktopEvent): void;
  emitProjectStateIfActive(host: Host, threadId?: string): void;
  emitWorkflowRecordingLibraryStateChanged(host: Host, threadId?: string): void;
  readStateForProjectHostAction(host: Host, threadId?: string): DesktopState;
}

export function createDesktopStateEventService<
  Store extends DesktopStateEventStore,
  Host extends DesktopStateEventHost<Store>,
>(
  dependencies: DesktopStateEventServiceDependencies<Store, Host>,
): DesktopStateEventService<Store, Host> {
  const defaultStore = () => dependencies.defaultStore();
  function emitDesktopState(options: DesktopStateReadOptions = { markActiveRead: false }): void {
    dependencies.emitDesktopEvent({
      type: "state",
      state: dependencies.readState(dependencies.activeThreadId(), options),
    });
  }

  function emitWorkflowEvent(event: WorkflowDesktopEvent, workspacePath = dependencies.activeWorkspacePath()): void {
    dependencies.emitDesktopEvent({ ...event, workspacePath } as DesktopEvent);
  }

  function emitWorkflowUpdated(workspacePath = dependencies.activeWorkspacePath()): void {
    emitWorkflowEvent({ type: "workflow-updated" }, workspacePath);
  }

  function emitOrchestrationUpdated(workspacePath = dependencies.activeWorkspacePath()): void {
    dependencies.emitDesktopEvent({ type: "orchestration-updated", workspacePath });
  }

  function emitPluginCatalogUpdated(workspacePath = dependencies.activeWorkspacePath()): void {
    dependencies.emitDesktopEvent({ type: "plugin-catalog-updated", workspacePath });
  }

  function emitThreadUpdated(thread: ThreadSummary): void {
    dependencies.emitDesktopEvent({ type: "thread-updated", thread, workspacePath: thread.workspacePath });
  }

  function permissionAuditWorkspacePath(entry: PermissionAuditEntry, targetStore = defaultStore()): string {
    try {
      return targetStore.getThread(entry.threadId).workspacePath;
    } catch {
      return targetStore.getWorkspace().path;
    }
  }

  function permissionGrantWorkspacePath(grant: AmbientPermissionGrant, targetStore = defaultStore()): string {
    if (grant.projectPath) return grant.projectPath;
    if (grant.workspacePath) return grant.workspacePath;
    if (grant.threadId) {
      try {
        return targetStore.getThread(grant.threadId).workspacePath;
      } catch {
        return targetStore.getWorkspace().path;
      }
    }
    if (grant.workflowThreadId) {
      try {
        return targetStore.getWorkflowAgentThreadSummary(grant.workflowThreadId).projectPath || targetStore.getWorkspace().path;
      } catch {
        return targetStore.getWorkspace().path;
      }
    }
    return targetStore.getWorkspace().path;
  }

  function emitPermissionAuditCreated(entry: PermissionAuditEntry, workspacePath = permissionAuditWorkspacePath(entry)): void {
    dependencies.emitDesktopEvent({ type: "permission-audit-created", entry, workspacePath });
  }

  function emitPermissionGrantCreated(grant: AmbientPermissionGrant, workspacePath = permissionGrantWorkspacePath(grant)): void {
    dependencies.emitDesktopEvent({
      type: "permission-grant-created",
      grant,
      workspacePath,
    });
  }

  function emitPermissionGrantRevoked(grant: AmbientPermissionGrant, workspacePath = permissionGrantWorkspacePath(grant)): void {
    dependencies.emitDesktopEvent({
      type: "permission-grant-revoked",
      grant,
      workspacePath,
    });
  }

  function plannerPlanArtifactWorkspacePath(artifact: PlannerPlanArtifact, targetStore = defaultStore()): string {
    try {
      return targetStore.getThread(artifact.threadId).workspacePath;
    } catch {
      return targetStore.getWorkspace().path;
    }
  }

  function emitPlannerPlanArtifactUpdated(artifact: PlannerPlanArtifact, targetStore = defaultStore()): void {
    dependencies.emitDesktopEvent({
      type: "planner-plan-artifact-updated",
      artifact,
      workspacePath: plannerPlanArtifactWorkspacePath(artifact, targetStore),
    });
  }

  function emitProjectScopedEvent(host: Host, event: DesktopEvent): void {
    dependencies.emitDesktopEvent({ ...event, workspacePath: host.workspacePath } as DesktopEvent);
  }

  function emitProjectStateIfActive(host: Host, threadId = host.activeThreadId): void {
    if (!dependencies.isActiveProjectRuntimeHost(host)) return;
    dependencies.emitDesktopEvent({ type: "state", state: dependencies.readState(threadId) });
  }

  function emitWorkflowRecordingLibraryStateChanged(host: Host, threadId = host.activeThreadId): void {
    if (dependencies.isActiveProjectRuntimeHost(host)) {
      emitProjectStateIfActive(host, threadId);
      return;
    }
    dependencies.emitDesktopEvent({
      type: "state",
      state: dependencies.readState(dependencies.activeThreadId(), { markActiveRead: false }),
    });
  }

  function readStateForProjectHostAction(host: Host, threadId = host.activeThreadId): DesktopState {
    return dependencies.isActiveProjectRuntimeHost(host)
      ? dependencies.readState(threadId)
      : dependencies.readState();
  }

  return {
    emitDesktopState,
    emitWorkflowEvent,
    emitWorkflowUpdated,
    emitOrchestrationUpdated,
    emitPluginCatalogUpdated,
    emitThreadUpdated,
    permissionAuditWorkspacePath,
    permissionGrantWorkspacePath,
    emitPermissionAuditCreated,
    emitPermissionGrantCreated,
    emitPermissionGrantRevoked,
    plannerPlanArtifactWorkspacePath,
    emitPlannerPlanArtifactUpdated,
    emitProjectScopedEvent,
    emitProjectStateIfActive,
    emitWorkflowRecordingLibraryStateChanged,
    readStateForProjectHostAction,
  };
}
