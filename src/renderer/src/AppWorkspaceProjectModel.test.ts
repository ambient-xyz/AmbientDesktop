import { describe, expect, it } from "vitest";

import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import type { ProjectSummary } from "../../shared/projectBoardTypes";
import type { ContextUsageSnapshot } from "../../shared/threadTypes";
import {
  activeProjectForWorkspace,
  activeWorkspaceIsPreparedLocalTaskWorkspace,
  appWorkspaceProjectModel,
  appWorkspaceRecoveryFlags,
  latestDurablePlannerPlanArtifactForWorkspace,
  readyPlannerPlanArtifactsForWorkspace,
} from "./AppWorkspaceProjectModel";

describe("AppWorkspaceProjectModel", () => {
  it("selects the active project for the current workspace path", () => {
    const first = project({ id: "project-1", path: "/workspace/one" });
    const second = project({ id: "project-2", path: "/workspace/two" });

    expect(activeProjectForWorkspace([first, second], "/workspace/two")).toBe(second);
    expect(activeProjectForWorkspace([first], undefined)).toBeUndefined();
  });

  it("filters ready planner artifacts and finds the latest durable ready artifact", () => {
    const ready = plannerArtifact({ id: "ready", sourceMessageId: "message-1", status: "ready" });
    const durable = plannerArtifact({
      id: "durable",
      sourceMessageId: "message-2",
      status: "ready",
      durableArtifactPath: "/workspace/plan.html",
    });
    const implemented = plannerArtifact({ id: "done", sourceMessageId: "message-3", status: "implemented" });

    const readyArtifacts = readyPlannerPlanArtifactsForWorkspace([implemented, ready, durable]);
    expect(readyArtifacts.map((artifact) => artifact.id)).toEqual(["ready", "durable"]);
    expect(latestDurablePlannerPlanArtifactForWorkspace(readyArtifacts)).toBe(durable);
  });

  it("detects prepared local-task workspaces under the active project root", () => {
    expect(activeWorkspaceIsPreparedLocalTaskWorkspace({
      workspacePath: "/workspace/project",
      activeWorkspacePath: "/workspace/project/.ambient-codex/orchestration/workspaces/task-1",
    })).toBe(true);
    expect(activeWorkspaceIsPreparedLocalTaskWorkspace({
      workspacePath: "/workspace/project",
      activeWorkspacePath: "/workspace/project",
    })).toBe(false);
  });

  it("derives session recovery flags from context and transient error state", () => {
    const contextUsage: ContextUsageSnapshot = {
      threadId: "thread-1",
      source: "unavailable",
      compactionCount: 0,
      diagnostics: {
        activeSession: false,
        piSessionFile: "/tmp/pi-session.json",
        message: "Session context is missing",
      },
      updatedAt: "2026-06-13T00:00:00.000Z",
    };

    expect(appWorkspaceRecoveryFlags({
      contextUsage,
      error: "Model context is not available for this chat because the Pi session file is missing.",
    })).toEqual({
      errorNeedsSessionRecovery: true,
      sessionContextMissing: true,
    });
  });

  it("builds the workspace project model without owning shell state", () => {
    const activeProject = project({ id: "project-1", path: "/workspace/project" });
    const durable = plannerArtifact({
      id: "durable",
      sourceMessageId: "message-1",
      status: "ready",
      durableArtifactPath: "/workspace/plan.html",
    });

    const model = appWorkspaceProjectModel({
      activeWorkspacePath: "/workspace/project/.ambient-codex/orchestration/workspaces/task-1",
      contextUsage: undefined,
      error: undefined,
      plannerPlanArtifacts: [plannerArtifact({ status: "superseded" }), durable],
      projects: [activeProject],
      workspacePath: "/workspace/project",
    });

    expect(model.activeProject).toBe(activeProject);
    expect(model.activeWorkspaceIsPreparedLocalTask).toBe(true);
    expect(model.latestDurablePlannerPlanArtifact).toBe(durable);
    expect(model.readyPlannerPlanArtifacts).toEqual([durable]);
    expect(model.sessionContextMissing).toBe(false);
    expect(model.errorNeedsSessionRecovery).toBe(false);
  });
});

function project(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: overrides.id ?? "project",
    name: overrides.name ?? "Project",
    path: overrides.path ?? "/workspace/project",
    statePath: overrides.statePath ?? "/workspace/project/.ambient/state.json",
    sessionPath: overrides.sessionPath ?? "/workspace/project/.ambient/session",
    createdAt: overrides.createdAt ?? "2026-06-13T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-13T00:00:00.000Z",
    threads: overrides.threads ?? [],
    ...overrides,
  };
}

function plannerArtifact(overrides: Partial<PlannerPlanArtifact> = {}): PlannerPlanArtifact {
  return {
    id: overrides.id ?? "plan",
    threadId: overrides.threadId ?? "thread-1",
    sourceMessageId: overrides.sourceMessageId ?? "message-1",
    status: overrides.status ?? "ready",
    workflowState: overrides.workflowState ?? "draft",
    title: overrides.title ?? "Plan",
    summary: overrides.summary ?? "Summary",
    content: overrides.content ?? "Content",
    steps: overrides.steps ?? [],
    openQuestions: overrides.openQuestions ?? [],
    risks: overrides.risks ?? [],
    verification: overrides.verification ?? [],
    decisionQuestions: overrides.decisionQuestions ?? [],
    createdAt: overrides.createdAt ?? "2026-06-13T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-13T00:00:00.000Z",
    ...overrides,
  };
}
