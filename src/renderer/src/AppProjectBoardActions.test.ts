import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  DesktopState,
  ProjectSummary,
} from "../../shared/types";
import type { ProjectBoardResetDialogState } from "./AppActionDialogs";
import {
  PROJECT_BOARD_RESET_BRIDGE_UNAVAILABLE_MESSAGE,
  createAppProjectBoardActions,
  projectBoardBusyProjectIdsWith,
  projectBoardProposalCardReviewBusyKey,
  projectBoardProposalQuestionBusyKey,
  projectBoardSynthesisPauseReason,
} from "./AppProjectBoardActions";

describe("App project board actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("updates project busy ids immutably", () => {
    const current = new Set(["existing"]);
    const withBusy = projectBoardBusyProjectIdsWith(current, "project-1", true);
    const withoutBusy = projectBoardBusyProjectIdsWith(withBusy, "project-1", false);

    expect([...current]).toEqual(["existing"]);
    expect([...withBusy].sort()).toEqual(["existing", "project-1"]);
    expect([...withoutBusy]).toEqual(["existing"]);
    expect(withBusy).not.toBe(current);
    expect(withoutBusy).not.toBe(withBusy);
  });

  it("keeps synthesis busy keys and pause reason stable", () => {
    expect(projectBoardProposalQuestionBusyKey("proposal-1", 2)).toBe("proposal-1:2");
    expect(projectBoardProposalCardReviewBusyKey("proposal-1", "source-1")).toBe("proposal-1:source-1");
    expect(projectBoardSynthesisPauseReason()).toBe("Pause requested from the project-board progress panel.");
  });

  it("builds a project board with the same busy/open/apply sequence", async () => {
    const nextState = desktopState();
    const createProjectBoard = vi.fn(async () => nextState);
    const { actions, calls, busyIds } = createController({
      ambientDesktop: { createProjectBoard },
    });

    await actions.buildProjectBoard(projectSummary({ id: "project-1" }));

    expect(createProjectBoard).toHaveBeenCalledWith({ projectId: "project-1" });
    expect(busyIds.calls.map((ids) => [...ids])).toEqual([["project-1"], []]);
    expect(calls.errors).toEqual([undefined]);
    expect(calls.sidebarAreas).toEqual(["projects"]);
    expect(calls.projectBoardOpen).toEqual([true, true]);
    expect(calls.projectActionStates).toEqual([nextState]);
  });

  it("does not build boards for workflow-recording threads", async () => {
    const createProjectBoard = vi.fn(async () => desktopState());
    const { actions, calls, busyIds } = createController({
      activeThread: { workflowRecording: { enabled: true } },
      ambientDesktop: { createProjectBoard },
    });

    await actions.buildProjectBoard(projectSummary({ id: "project-1" }));

    expect(createProjectBoard).not.toHaveBeenCalled();
    expect(busyIds.calls).toEqual([]);
    expect(calls.projectBoardOpen).toEqual([]);
  });

  it("keeps reset-board bridge fallback copy and dialog state stable", async () => {
    const project = projectSummary({ id: "project-1", boardId: "board-1" });
    const resetDialog = statefulSetter<ProjectBoardResetDialogState | undefined>({
      project,
      board: project.board!,
    });
    const { actions, calls } = createController({
      ambientDesktop: {},
      projectBoardResetDialog: resetDialog.value,
      setProjectBoardResetDialog: resetDialog.set,
    });

    await actions.confirmProjectBoardReset();

    expect(resetDialog.calls).toEqual([
      { project, board: project.board!, busy: true },
      {
        project,
        board: project.board!,
        busy: false,
        error: PROJECT_BOARD_RESET_BRIDGE_UNAVAILABLE_MESSAGE,
      },
    ]);
    expect(calls.errors).toEqual([undefined, PROJECT_BOARD_RESET_BRIDGE_UNAVAILABLE_MESSAGE]);
  });
});

type AmbientDesktopMock = Partial<typeof window.ambientDesktop>;

function createController({
  activeThread,
  ambientDesktop,
  projectBoardResetDialog,
  setProjectBoardResetDialog,
}: {
  activeThread?: { workflowRecording?: unknown };
  ambientDesktop: AmbientDesktopMock;
  projectBoardResetDialog?: ProjectBoardResetDialogState;
  setProjectBoardResetDialog?: Dispatch<SetStateAction<ProjectBoardResetDialogState | undefined>>;
}) {
  vi.stubGlobal("window", { ambientDesktop });

  const busyIds = statefulSetter<Set<string>>(new Set());
  const noopBoolean = statefulSetter(false);
  const noopString = statefulSetter<string | undefined>(undefined);
  const noopMode = statefulSetter<"board_synthesis" | "charter_review" | "source_elaboration" | undefined>(undefined);
  const noopDialog = statefulSetter<ProjectBoardResetDialogState | undefined>(projectBoardResetDialog);
  const calls: {
    createdThreadStates: DesktopState[];
    errors: Array<string | undefined>;
    projectActionStates: DesktopState[];
    projectBoardOpen: boolean[];
    sidebarAreas: string[];
  } = {
    createdThreadStates: [],
    errors: [],
    projectActionStates: [],
    projectBoardOpen: [],
    sidebarAreas: [],
  };

  const actions = createAppProjectBoardActions({
    activeThread,
    activeWorkspacePath: "/repo",
    applyCreatedThreadState: (next) => calls.createdThreadStates.push(next),
    applyProjectActionState: (next) => calls.projectActionStates.push(next),
    projectBoardBusyProjectIds: busyIds.value,
    projectBoardKickoffDefaultsBusy: false,
    projectBoardResetDialog,
    previewArtifact: vi.fn(),
    selectProject: vi.fn(async () => undefined),
    selectThread: vi.fn(async () => undefined),
    setError: (message) => calls.errors.push(message),
    setProjectBoardBusyProjectIds: busyIds.set,
    setProjectBoardFinalizeBusy: noopBoolean.set,
    setProjectBoardKickoffDefaultsBusy: noopBoolean.set,
    setProjectBoardOpen: (value) => {
      calls.projectBoardOpen.push(typeof value === "function" ? value(false) : value);
    },
    setProjectBoardPlanBusy: noopBoolean.set,
    setProjectBoardPlanPickerOpen: noopBoolean.set,
    setProjectBoardProposalAnswerBusy: noopString.set,
    setProjectBoardProposalApplyBusy: noopBoolean.set,
    setProjectBoardProposalCardReviewBusy: noopString.set,
    setProjectBoardRefineBusy: noopBoolean.set,
    setProjectBoardRefineMode: noopMode.set,
    setProjectBoardResetDialog: setProjectBoardResetDialog ?? noopDialog.set,
    setProjectBoardRevisionBusy: noopBoolean.set,
    setProjectBoardSourceBusy: noopBoolean.set,
    setProjectBoardSourceImpactBusy: noopBoolean.set,
    setProjectBoardSynthesisDeferBusy: noopBoolean.set,
    setProjectBoardSynthesisPauseBusy: noopBoolean.set,
    setProjectBoardSynthesisRetryBusy: noopBoolean.set,
    setSidebarArea: (value) => calls.sidebarAreas.push(typeof value === "function" ? value("projects") : value),
    setState: vi.fn(),
    state: desktopState(),
  });

  return { actions, busyIds, calls };
}

function statefulSetter<T>(initial: T): {
  calls: T[];
  set: Dispatch<SetStateAction<T>>;
  value: T;
} {
  const state = {
    calls: [] as T[],
    value: initial,
  };
  return {
    calls: state.calls,
    get value() {
      return state.value;
    },
    set(next) {
      state.value = typeof next === "function" ? (next as (current: T) => T)(state.value) : next;
      state.calls.push(state.value);
    },
  };
}

function desktopState(): DesktopState {
  return {
    activeThreadId: "thread-1",
    activeWorkspace: { path: "/repo" },
    workspace: { path: "/repo", name: "Repo" },
    plannerPlanArtifacts: [],
  } as unknown as DesktopState;
}

function projectSummary({
  boardId,
  id,
}: {
  boardId?: string;
  id: string;
}): ProjectSummary {
  return {
    id,
    path: "/repo",
    board: boardId ? { id: boardId } : undefined,
  } as unknown as ProjectSummary;
}
