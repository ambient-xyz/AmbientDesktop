import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  useAppProjectBoardControls,
  useAppProjectBoardControlsForApp,
  type AppProjectBoardControlsForAppInput,
  type AppProjectBoardControlsOptions,
} from "./AppProjectBoardControls";

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

  it("maps App owner state into project-board controls", () => {
    const model = {
      activeProject: { id: "project-1", name: "Project", path: "/workspace" },
      activeWorkspaceIsPreparedLocalTask: false,
      errorNeedsSessionRecovery: false,
      latestDurablePlannerPlanArtifact: undefined,
      readyPlannerPlanArtifacts: [],
      sessionContextMissing: false,
    };
    const shellControls = {
      activeProjectBoardBusy: false,
      activeProjectBoardTopbarAction: undefined,
      activeThreadSuppressesProjectBoard: false,
      projectBoardOpen: false,
      projectBoardPlanBusy: false,
      projectBoardPlanPickerOpen: false,
      projectBoardThreadPlanAction: undefined,
      runProjectBoardThreadPlanAction: vi.fn(),
      setProjectBoardOpen: vi.fn(),
      setProjectBoardPlanBusy: vi.fn(),
      setProjectBoardPlanPickerOpen: vi.fn(),
    };
    const actions = { openProjectBoard: vi.fn() };
    mocks.useAppWorkspaceProjectModel.mockReturnValue(model);
    mocks.useAppProjectBoardShellControls.mockReturnValue(shellControls);
    mocks.createAppProjectBoardActions.mockReturnValue(actions);

    const options = optionsStub();
    const input = forAppInputStub(options);

    function Harness() {
      useAppProjectBoardControlsForApp(input);
      return React.createElement("div");
    }

    renderToStaticMarkup(React.createElement(Harness));

    expect(mocks.useAppWorkspaceProjectModel).toHaveBeenCalledWith({
      activeWorkspacePath: "/workspace",
      contextUsage: options.contextUsage,
      error: options.error,
      plannerPlanArtifacts: options.plannerPlanArtifacts,
      projects: options.projects,
      workspacePath: "/workspace",
    });
    expect(mocks.useAppProjectBoardShellControls).toHaveBeenCalledWith(
      expect.objectContaining({
        activeThread: options.activeThread,
        activeThreadId: "thread-1",
        activeWorkspacePath: "/workspace",
        projectBoardBusyProjectIds: options.projectBoardBusyProjectIds,
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
        projectBoardBusyProjectIds: options.projectBoardBusyProjectIds,
        projectBoardKickoffDefaultsBusy: options.projectBoardKickoffDefaultsBusy,
        projectBoardResetDialog: options.projectBoardResetDialog,
        selectProject: options.selectProject,
        selectThread: options.selectThread,
        setError: options.setError,
        setProjectBoardBusyProjectIds: options.setProjectBoardBusyProjectIds,
        setProjectBoardFinalizeBusy: options.setProjectBoardFinalizeBusy,
        setProjectBoardKickoffDefaultsBusy: options.setProjectBoardKickoffDefaultsBusy,
        setProjectBoardOpen: shellControls.setProjectBoardOpen,
        setProjectBoardPlanBusy: shellControls.setProjectBoardPlanBusy,
        setProjectBoardPlanPickerOpen: shellControls.setProjectBoardPlanPickerOpen,
        setProjectBoardProposalAnswerBusy: options.setProjectBoardProposalAnswerBusy,
        setProjectBoardProposalApplyBusy: options.setProjectBoardProposalApplyBusy,
        setProjectBoardProposalCardReviewBusy: options.setProjectBoardProposalCardReviewBusy,
        setProjectBoardRefineBusy: options.setProjectBoardRefineBusy,
        setProjectBoardRefineMode: options.setProjectBoardRefineMode,
        setProjectBoardResetDialog: options.setProjectBoardResetDialog,
        setProjectBoardRevisionBusy: options.setProjectBoardRevisionBusy,
        setProjectBoardSourceBusy: options.setProjectBoardSourceBusy,
        setProjectBoardSourceImpactBusy: options.setProjectBoardSourceImpactBusy,
        setProjectBoardSynthesisDeferBusy: options.setProjectBoardSynthesisDeferBusy,
        setProjectBoardSynthesisPauseBusy: options.setProjectBoardSynthesisPauseBusy,
        setProjectBoardSynthesisRetryBusy: options.setProjectBoardSynthesisRetryBusy,
        setSidebarArea: options.setSidebarArea,
        setState: options.setState,
        state: options.state,
      }),
    );
  });
});

function optionsStub(): AppProjectBoardControlsOptions {
  const contextUsage = { usedTokens: 10, maxTokens: 100 };
  const plannerPlanArtifacts = [{ id: "plan-1", status: "ready" }];
  const projects = [{ id: "project-1", name: "Project", path: "/workspace" }];
  return {
    activeThread: { id: "thread-1" },
    activeThreadId: "thread-1",
    activeWorkspacePath: "/workspace",
    applyCreatedThreadState: vi.fn(),
    applyProjectActionState: vi.fn(),
    contextUsage,
    error: "recoverable",
    plannerPlanArtifacts,
    previewArtifact: vi.fn(),
    projects,
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
    state: {
      activeThreadId: "thread-1",
      activeWorkspace: { path: "/workspace" },
      contextUsage,
      plannerPlanArtifacts,
      projects,
      workspace: { name: "Workspace", path: "/workspace" },
    },
    workspaceName: "Workspace",
    workspacePath: "/workspace",
  } as unknown as AppProjectBoardControlsOptions;
}

function forAppInputStub(options: AppProjectBoardControlsOptions): AppProjectBoardControlsForAppInput {
  return {
    activeThread: options.activeThread,
    appDesktopStateAppliers: {
      applyCreatedThreadState: options.applyCreatedThreadState,
      applyProjectActionState: options.applyProjectActionState,
    },
    navigationActions: {
      selectProject: options.selectProject,
      selectThread: options.selectThread,
    },
    projectShellState: {
      projectBoardBusyProjectIds: options.projectBoardBusyProjectIds,
      projectBoardFinalizeBusy: false,
      projectBoardKickoffDefaultsBusy: options.projectBoardKickoffDefaultsBusy,
      projectBoardProposalAnswerBusy: false,
      projectBoardProposalApplyBusy: false,
      projectBoardProposalCardReviewBusy: false,
      projectBoardRefineBusy: false,
      projectBoardRefineMode: "inline",
      projectBoardResetDialog: options.projectBoardResetDialog,
      projectBoardRevisionBusy: false,
      projectBoardSourceBusy: false,
      projectBoardSourceImpactBusy: false,
      projectBoardSynthesisDeferBusy: false,
      projectBoardSynthesisPauseBusy: false,
      projectBoardSynthesisRetryBusy: false,
      setProjectBoardBusyProjectIds: options.setProjectBoardBusyProjectIds,
      setProjectBoardFinalizeBusy: options.setProjectBoardFinalizeBusy,
      setProjectBoardKickoffDefaultsBusy: options.setProjectBoardKickoffDefaultsBusy,
      setProjectBoardProposalAnswerBusy: options.setProjectBoardProposalAnswerBusy,
      setProjectBoardProposalApplyBusy: options.setProjectBoardProposalApplyBusy,
      setProjectBoardProposalCardReviewBusy: options.setProjectBoardProposalCardReviewBusy,
      setProjectBoardRefineBusy: options.setProjectBoardRefineBusy,
      setProjectBoardRefineMode: options.setProjectBoardRefineMode,
      setProjectBoardResetDialog: options.setProjectBoardResetDialog,
      setProjectBoardRevisionBusy: options.setProjectBoardRevisionBusy,
      setProjectBoardSourceBusy: options.setProjectBoardSourceBusy,
      setProjectBoardSourceImpactBusy: options.setProjectBoardSourceImpactBusy,
      setProjectBoardSynthesisDeferBusy: options.setProjectBoardSynthesisDeferBusy,
      setProjectBoardSynthesisPauseBusy: options.setProjectBoardSynthesisPauseBusy,
      setProjectBoardSynthesisRetryBusy: options.setProjectBoardSynthesisRetryBusy,
    },
    rightPanelState: {
      previewArtifact: options.previewArtifact,
    },
    setState: options.setState,
    shellUiState: {
      error: options.error,
      setError: options.setError,
      setSidebarArea: options.setSidebarArea,
    },
    state: options.state,
  } as unknown as AppProjectBoardControlsForAppInput;
}
