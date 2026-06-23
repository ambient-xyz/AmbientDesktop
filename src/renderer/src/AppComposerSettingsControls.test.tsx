import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import { AppComposerSettingsControls, type AppComposerSettingsControlsProps } from "./AppComposerSettingsControls";
import { projectBoardThreadPlanActionState } from "./projectBoardUiModel";

describe("AppComposerSettingsControls", () => {
  it("renders composer mode, thinking, project-board, and model controls without native title tooltips", () => {
    const markup = renderControls();

    expect(markup).toContain("composer-settings-controls");
    expect(markup).toContain("Switch to Agent mode");
    expect(markup).toContain("Use full access permission mode");
    expect(markup).toContain("Add Plan to Board");
    expect(markup).toContain("Choose whether assistant thinking is hidden, temporary, or retained.");
    expect(markup).toContain("Model: Model A");
    expect(markup).not.toContain("title=");
  });

  it("renders ready-plan picker entries when multiple plans are available", () => {
    const markup = renderControls({
      projectBoardThreadPlanAction: projectBoardThreadPlanActionState(true, 2),
      projectBoardPlanPickerOpen: true,
      readyPlannerPlanArtifacts: [
        plannerArtifact({ id: "plan-1", title: "First plan", summary: "One path" }),
        plannerArtifact({ id: "plan-2", title: "Second plan", summary: "" }),
      ],
    });

    expect(markup).toContain("project-board-plan-picker");
    expect(markup).toContain("First plan");
    expect(markup).toContain("One path");
    expect(markup).toContain("Second plan");
    expect(markup).toContain("0 steps");
  });
});

function renderControls(overrides: Partial<AppComposerSettingsControlsProps> = {}): string {
  const props: AppComposerSettingsControlsProps = {
    state: desktopState(),
    running: false,
    goalModeArmed: false,
    goalBusy: false,
    showRevisePlanControl: true,
    activeThreadSuppressesProjectBoard: false,
    projectBoardThreadPlanAction: projectBoardThreadPlanActionState(false, 1),
    projectBoardPlanPickerOpen: false,
    readyPlannerPlanArtifacts: [plannerArtifact()],
    modelPickerRef: createRef<HTMLDivElement>(),
    modelPickerButtonRef: createRef<HTMLButtonElement>(),
    modelPickerOpen: false,
    composerModelOptions: [{ id: "model-a", label: "Model A" }],
    selectedComposerModelOption: { id: "model-a", label: "Model A" },
    onCollaborationModeChange: vi.fn(),
    onToggleGoalMode: vi.fn(),
    onPermissionModeChange: vi.fn(),
    onReviseLatestPlannerPlan: vi.fn(),
    onRunProjectBoardThreadPlanAction: vi.fn(),
    onAddPlannerPlanToBoard: vi.fn(),
    onThinkingDisplayModeChange: vi.fn(),
    onThinkingLevelChange: vi.fn(),
    setModelPickerOpen: vi.fn(),
    onFocusModelPickerOption: vi.fn(),
    onSelectComposerModel: vi.fn(),
    ...overrides,
  };

  return renderToStaticMarkup(<AppComposerSettingsControls {...props} />);
}

function desktopState(): DesktopState {
  return {
    activeThreadGoal: undefined,
    settings: {
      collaborationMode: "agent",
      permissionMode: "full-access",
      model: "moonshotai/kimi-k2.7-code",
      thinkingLevel: "medium",
      thinkingDisplay: { mode: "transient", showRunStatusCard: true },
    },
  } as DesktopState;
}

function plannerArtifact(overrides: Partial<PlannerPlanArtifact> = {}): PlannerPlanArtifact {
  return {
    id: "plan-1",
    threadId: "thread-1",
    sourceMessageId: "message-1",
    status: "ready",
    workflowState: "durable_ready",
    title: "Implementation plan",
    summary: "Ready to apply",
    content: "",
    steps: [],
    openQuestions: [],
    risks: [],
    verification: [],
    decisionQuestions: [],
    createdAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-22T00:00:00.000Z",
    ...overrides,
  } as PlannerPlanArtifact;
}
