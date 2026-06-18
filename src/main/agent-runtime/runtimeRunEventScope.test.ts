import { describe, expect, it, vi } from "vitest";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import { createRuntimeRunEventScope } from "./runtimeRunEventScope";

const createdAt = "2026-06-15T00:00:00.000Z";

function plannerArtifact(overrides: Partial<PlannerPlanArtifact> = {}): PlannerPlanArtifact {
  return {
    id: "artifact-1",
    threadId: "thread-1",
    sourceMessageId: "message-1",
    status: "ready",
    workflowState: "finalizing",
    title: "Plan",
    summary: "Summary",
    content: "Content",
    steps: [],
    openQuestions: [],
    risks: [],
    verification: [],
    decisionQuestions: [],
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

describe("createRuntimeRunEventScope", () => {
  it("guards event emission and activity after workspace detachment", () => {
    const emitted: DesktopEvent[] = [];
    const onActivity = vi.fn();
    const listener = vi.fn();
    const scope = createRuntimeRunEventScope({
      runWorkspacePath: "/workspace",
      plannerFinalizationSources: [],
      getCurrentWorkspacePath: () => "/workspace",
      emit: (event) => emitted.push(event),
      finishPlannerPlanFinalizationAttempt: vi.fn(),
      onActivity,
    });
    const removeListener = scope.addActivityListener(listener);

    scope.emitRunEvent({ type: "run-status", threadId: "thread-1", status: "starting" });
    expect(scope.markRunActivity()).toBe(true);
    removeListener();
    expect(scope.markRunActivity()).toBe(true);
    scope.detachFromWorkspace();
    scope.emitRunEvent({ type: "run-status", threadId: "thread-1", status: "streaming" });

    expect(emitted).toEqual([{ type: "run-status", threadId: "thread-1", status: "starting" }]);
    expect(onActivity).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(scope.markRunActivity()).toBe(false);
  });

  it("treats workspace lookup errors or mismatches as inactive", () => {
    const emit = vi.fn();
    const mismatched = createRuntimeRunEventScope({
      runWorkspacePath: "/workspace",
      plannerFinalizationSources: [],
      getCurrentWorkspacePath: () => "/other",
      emit,
      finishPlannerPlanFinalizationAttempt: vi.fn(),
    });
    const throwing = createRuntimeRunEventScope({
      runWorkspacePath: "/workspace",
      plannerFinalizationSources: [],
      getCurrentWorkspacePath: () => {
        throw new Error("workspace closed");
      },
      emit,
      finishPlannerPlanFinalizationAttempt: vi.fn(),
    });

    mismatched.emitRunEvent({ type: "run-status", threadId: "thread-1", status: "streaming" });
    throwing.emitRunEvent({ type: "run-status", threadId: "thread-1", status: "streaming" });

    expect(mismatched.isRunStoreActive()).toBe(false);
    expect(throwing.isRunStoreActive()).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it("finishes planner finalization sources and emits updated artifacts", () => {
    const emitted: DesktopEvent[] = [];
    const artifact = plannerArtifact();
    const finishPlannerPlanFinalizationAttempt = vi.fn(() => artifact);
    const scope = createRuntimeRunEventScope({
      runWorkspacePath: "/workspace",
      plannerFinalizationSources: [{ id: "artifact-1" }],
      getCurrentWorkspacePath: () => "/workspace",
      emit: (event) => emitted.push(event),
      finishPlannerPlanFinalizationAttempt,
    });

    scope.finishPlannerFinalizationSources("failed", {
      error: "Finalization failed.",
      workflowState: "failed",
    });

    expect(finishPlannerPlanFinalizationAttempt).toHaveBeenCalledWith("artifact-1", {
      status: "failed",
      error: "Finalization failed.",
      workflowState: "failed",
    });
    expect(emitted).toEqual([{ type: "planner-plan-artifact-updated", artifact }]);
  });

  it("logs planner finalization failures and continues with later sources", () => {
    const emitted: DesktopEvent[] = [];
    const warnings: string[] = [];
    const secondArtifact = plannerArtifact({ id: "artifact-2" });
    const finishPlannerPlanFinalizationAttempt = vi.fn((artifactId: string) => {
      if (artifactId === "artifact-1") throw new Error("missing artifact");
      return secondArtifact;
    });
    const scope = createRuntimeRunEventScope({
      runWorkspacePath: "/workspace",
      plannerFinalizationSources: [{ id: "artifact-1" }, { id: "artifact-2" }],
      getCurrentWorkspacePath: () => "/workspace",
      emit: (event) => emitted.push(event),
      finishPlannerPlanFinalizationAttempt,
      logWarning: (message) => warnings.push(message),
    });

    scope.finishPlannerFinalizationSources("completed");

    expect(warnings).toEqual(["Failed to mark planner finalization completed: missing artifact"]);
    expect(emitted).toEqual([{ type: "planner-plan-artifact-updated", artifact: secondArtifact }]);
  });
});
