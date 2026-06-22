import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppProjectBoardControls, type AppProjectBoardControlsOptions } from "./AppProjectBoardControls";

const mocks = vi.hoisted(() => ({
  createAppProjectBoardActions: vi.fn(),
  useAppProjectBoardShellControls: vi.fn(),
  useAppWorkspaceProjectModel: vi.fn(),
}));

vi.mock("./AppProjectBoardActions", () => ({
  createAppProjectBoardActions: mocks.createAppProjectBoardActions,
}));

vi.mock("./AppProjectBoardShellControls", () => ({
  useAppProjectBoardShellControls: mocks.useAppProjectBoardShellControls,
}));

vi.mock("./AppWorkspaceProjectModel", () => ({
  useAppWorkspaceProjectModel: mocks.useAppWorkspaceProjectModel,
}));

describe("AppProjectBoardControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("wires project-board model, shell controls, actions, and callback bridge", () => {
    const project = { id: "project-1", name: "Project", path: "/workspace" };
    const readyPlan = { id: "plan-1", status: "ready" };
    const durablePlan = { id: "plan-2", status: "ready", durableArtifactPath: "/workspace/plan.md" };
    const model = {
      activeProject: project,
      activeWorkspaceIsPreparedLocalTask: false,
      errorNeedsSessionRecovery: false,
      latestDurablePlannerPlanArtifact: durablePlan,
      readyPlannerPlanArtifacts: [readyPlan, durablePlan],
      sessionContextMissing: false,
    };
    const shellControls = {
      activeProjectBoardBusy: true,
      activeProjectBoardTopbarAction: undefined,
      activeThreadSuppressesProjectBoard: false,
      projectBoardOpen: true,
      projectBoardPlanBusy: false,
      projectBoardPlanPickerOpen: false,
      projectBoardThreadPlanAction: { kind: "add_ready_plan", disabled: false },
      runProjectBoardThreadPlanAction: vi.fn(),
      setProjectBoardOpen: vi.fn(),
      setProjectBoardPlanBusy: vi.fn(),
      setProjectBoardPlanPickerOpen: vi.fn(),
    };
    const actions = {
      addPlannerPlanToBoard: vi.fn(),
      buildProjectBoard: vi.fn(),
      openProjectBoard: vi.fn(),
    };
    mocks.useAppWorkspaceProjectModel.mockReturnValue(model);
    mocks.useAppProjectBoardShellControls.mockReturnValue(shellControls);
    mocks.createAppProjectBoardActions.mockReturnValue(actions);

    let controls: ReturnType<typeof useAppProjectBoardControls> | undefined;
    const options = optionsStub();

    function Harness() {
      controls = useAppProjectBoardControls(options);
      return React.createElement("div");
    }

    renderToStaticMarkup(React.createElement(Harness));

    expect(mocks.useAppWorkspaceProjectModel).toHaveBeenCalledWith({
      activeWorkspacePath: "/workspace",
      contextUsage: options.contextUsage,
      error: "recoverable",
      plannerPlanArtifacts: options.plannerPlanArtifacts,
      projects: options.projects,
      workspacePath: "/workspace",
    });
    expect(mocks.useAppProjectBoardShellControls).toHaveBeenCalledWith(
      expect.objectContaining({
        activeProject: project,
        activeThread: options.activeThread,
        activeThreadId: "thread-1",
        activeWorkspacePath: "/workspace",
        projectBoardBusyProjectIds: options.projectBoardBusyProjectIds,
        readyPlannerPlanArtifacts: model.readyPlannerPlanArtifacts,
        workspaceName: "Workspace",
        workspacePath: "/workspace",
      }),
    );
    expect(mocks.createAppProjectBoardActions).toHaveBeenCalledWith(
      expect.objectContaining({
        activeThread: options.activeThread,
        activeWorkspacePath: "/workspace",
        applyCreatedThreadState: options.applyCreatedThreadState,
        applyProjectActionState: options.applyProjectActionState,
        previewArtifact: options.previewArtifact,
        setProjectBoardOpen: shellControls.setProjectBoardOpen,
        setProjectBoardPlanBusy: shellControls.setProjectBoardPlanBusy,
        setProjectBoardPlanPickerOpen: shellControls.setProjectBoardPlanPickerOpen,
        setState: options.setState,
        state: options.state,
      }),
    );

    expect(controls?.activeProject).toBe(project);
    expect(controls?.latestDurablePlannerPlanArtifact).toBe(durablePlan);
    expect(controls?.projectBoardOpen).toBe(true);
    expect(controls?.setProjectBoardOpen).toBe(shellControls.setProjectBoardOpen);
    expect(controls?.projectBoardActions).toBe(actions);

    const shellOptions = mocks.useAppProjectBoardShellControls.mock.calls[0][0];
    shellOptions.onBuildProjectBoard(project);
    shellOptions.onOpenProjectBoard(project);
    shellOptions.onAddPlannerPlanToBoard(readyPlan);

    expect(actions.buildProjectBoard).toHaveBeenCalledWith(project);
    expect(actions.openProjectBoard).toHaveBeenCalledWith(project);
    expect(actions.addPlannerPlanToBoard).toHaveBeenCalledWith(readyPlan);
  });
});

function optionsStub(): AppProjectBoardControlsOptions {
  return {
    activeThread: { id: "thread-1" },
    activeThreadId: "thread-1",
    activeWorkspacePath: "/workspace",
    applyCreatedThreadState: vi.fn(),
    applyProjectActionState: vi.fn(),
    contextUsage: { usedTokens: 10, maxTokens: 100 },
    error: "recoverable",
    plannerPlanArtifacts: [{ id: "plan-1", status: "ready" }],
    previewArtifact: vi.fn(),
    projects: [{ id: "project-1", name: "Project", path: "/workspace" }],
    projectBoardBusyProjectIds: new Set(["project-1"]),
    projectBoardKickoffDefaultsBusy: false,
    projectBoardResetDialog: undefined,
    selectProject: vi.fn(),
    selectThread: vi.fn(),
    setError: vi.fn(),
    setProjectBoardBusyProjectIds: vi.fn(),
    setProjectBoardFinalizeBusy: vi.fn(),
    setProjectBoardKickoffDefaultsBusy: vi.fn(),
    setProjectBoardProposalAnswerBusy: vi.fn(),
    setProjectBoardProposalApplyBusy: vi.fn(),
    setProjectBoardProposalCardReviewBusy: vi.fn(),
    setProjectBoardRefineBusy: vi.fn(),
    setProjectBoardRefineMode: vi.fn(),
    setProjectBoardResetDialog: vi.fn(),
    setProjectBoardRevisionBusy: vi.fn(),
    setProjectBoardSourceBusy: vi.fn(),
    setProjectBoardSourceImpactBusy: vi.fn(),
    setProjectBoardSynthesisDeferBusy: vi.fn(),
    setProjectBoardSynthesisPauseBusy: vi.fn(),
    setProjectBoardSynthesisRetryBusy: vi.fn(),
    setSidebarArea: vi.fn(),
    setState: vi.fn(),
    state: { activeThreadId: "thread-1" },
    workspaceName: "Workspace",
    workspacePath: "/workspace",
  } as unknown as AppProjectBoardControlsOptions;
}
