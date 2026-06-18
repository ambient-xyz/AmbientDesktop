import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import type { PlannerDecisionQuestion, PlannerPlanArtifact } from "../../shared/plannerTypes";
import type { RunStatus } from "../../shared/threadTypes";
import type { PlannerRevisionDialogState } from "./AppActionDialogs";
import {
  createAppPlannerActions,
  plannerPlanArtifactsWithUpdated,
} from "./AppPlannerActions";

describe("App planner actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("replaces updated planner artifacts without reordering siblings", () => {
    const first = plannerArtifact({ id: "plan-1", title: "First" });
    const second = plannerArtifact({ id: "plan-2", title: "Second" });
    const updated = { ...first, title: "Updated" };

    expect(plannerPlanArtifactsWithUpdated([first, second], updated)).toEqual([updated, second]);
  });

  it("blocks implementation until required decisions are answered", async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal("window", { ambientDesktop: { sendMessage } });
    const controller = createController();
    const artifact = plannerArtifact({
      decisionQuestions: [plannerQuestion({ required: true })],
    });

    await controller.actions.implementPlannerPlan(artifact);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(controller.calls.errors).toEqual(["Answer required planner decisions before implementing this plan."]);
  });

  it("implements an approved plan with the existing update and send sequence", async () => {
    const artifact = plannerArtifact();
    const implemented = { ...artifact, status: "implemented" as const };
    const updatePlannerPlanArtifact = vi.fn(async () => implemented);
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("window", {
      ambientDesktop: {
        sendMessage,
        updatePlannerPlanArtifact,
      },
    });
    const controller = createController({ state: desktopState([artifact]) });

    await controller.actions.implementPlannerPlan(artifact);

    expect(controller.calls.errors).toEqual([undefined]);
    expect(controller.resetRunActivityLines).toHaveBeenCalledWith("Approved plan started as a goal implementation.");
    expect(controller.runStatus.value).toBe("starting");
    expect(controller.threadRunStatuses.value).toEqual({ "thread-1": "starting" });
    expect(controller.updateThreadSettings).toHaveBeenCalledWith({ collaborationMode: "agent" });
    expect(updatePlannerPlanArtifact).toHaveBeenCalledWith({ artifactId: "plan-1", status: "implemented" });
    expect(controller.state.value?.plannerPlanArtifacts).toEqual([implemented]);
    expect(sendMessage).toHaveBeenCalledWith({
      threadId: "thread-1",
      content: expect.stringContaining("Implement the approved Planner Mode plan"),
      permissionMode: "full-access",
      collaborationMode: "agent",
      goalMode: { enabled: true },
      model: "ambient",
      thinkingLevel: "medium",
      delivery: "prompt",
      context: [],
    });
  });

  it("marks finalization failed when the planner send fails after entering finalizing", async () => {
    const artifact = plannerArtifact({
      decisionQuestions: [plannerQuestion({ answer: { kind: "option", optionId: "yes", answeredAt: "2026-06-13T00:00:00.000Z" } })],
    });
    const finalizing = { ...artifact, workflowState: "finalizing" as const };
    const failed = { ...artifact, workflowState: "failed" as const };
    const updatePlannerPlanArtifact = vi
      .fn()
      .mockImplementation(async (input: { workflowState?: string }) => (input.workflowState === "failed" ? failed : finalizing));
    vi.stubGlobal("window", {
      ambientDesktop: {
        sendMessage: vi.fn(async () => {
          throw new Error("send failed");
        }),
        updatePlannerPlanArtifact,
      },
    });
    const controller = createController({ state: desktopState([artifact]) });

    await controller.actions.finalizePlannerPlan(artifact);

    expect(updatePlannerPlanArtifact).toHaveBeenNthCalledWith(1, { artifactId: "plan-1", workflowState: "finalizing" });
    expect(updatePlannerPlanArtifact).toHaveBeenNthCalledWith(2, { artifactId: "plan-1", workflowState: "failed" });
    expect(controller.resetRunActivityLines).toHaveBeenCalledWith("Plan finalization sent to Ambient.");
    expect(controller.calls.errors).toEqual([undefined, "send failed"]);
    expect(controller.runStatus.value).toBe("error");
  });

  it("sends durable revisions and clears the composer when requested", async () => {
    const artifact = plannerArtifact();
    const finalizing = { ...artifact, workflowState: "finalizing" as const };
    const updatePlannerPlanArtifact = vi.fn(async () => finalizing);
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("window", {
      ambientDesktop: {
        sendMessage,
        updatePlannerPlanArtifact,
      },
    });
    const controller = createController({ state: desktopState([artifact]) });

    await controller.actions.sendPlannerDurableRevision(artifact, "  tighten diagrams  ", { clearComposer: true });

    expect(updatePlannerPlanArtifact).toHaveBeenCalledWith({ artifactId: "plan-1", workflowState: "finalizing" });
    expect(controller.resetRunActivityLines).toHaveBeenCalledWith("Plan revision sent to Ambient.");
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      collaborationMode: "planner",
      content: expect.stringContaining("tighten diagrams"),
      context: [],
      delivery: "prompt",
    }));
    expect(controller.calls.composerDrafts).toEqual([""]);
    expect(controller.calls.composerDraftOptions).toEqual([{ clearSlashCommandSelection: true }]);
  });

  it("keeps planner revision dialog error handling outside App", async () => {
    const artifact = plannerArtifact();
    vi.stubGlobal("window", { ambientDesktop: {} });
    const dialog = statefulSetter<PlannerRevisionDialogState | undefined>({
      artifact,
      initialFeedback: "",
    });
    const controller = createController({
      plannerRevisionDialog: dialog.value,
      setPlannerRevisionDialog: dialog.set,
      state: desktopState([artifact]),
    });

    await controller.actions.submitPlannerRevisionDialog("   ");

    expect(dialog.calls).toEqual([
      { artifact, initialFeedback: "", busy: true, error: undefined },
      { artifact, initialFeedback: "", busy: false, error: "Enter feedback for the plan revision." },
    ]);
  });

  it("answers required decisions and auto-finalizes when planner settings allow it", async () => {
    const before = plannerArtifact({
      decisionQuestions: [plannerQuestion({ required: true })],
    });
    const answered = plannerArtifact({
      decisionQuestions: [plannerQuestion({ answer: { kind: "option", optionId: "yes", answeredAt: "2026-06-13T00:00:00.000Z" }, required: true })],
    });
    const finalizing = { ...answered, workflowState: "finalizing" as const };
    const answerPlannerDecisionQuestion = vi.fn(async () => answered);
    const updatePlannerPlanArtifact = vi.fn(async () => finalizing);
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("window", {
      ambientDesktop: {
        answerPlannerDecisionQuestion,
        sendMessage,
        updatePlannerPlanArtifact,
      },
    });
    const controller = createController({ state: desktopState([before]) });

    await controller.actions.answerPlannerDecisionQuestion(before, "question-1", { kind: "option", optionId: "yes" });

    expect(answerPlannerDecisionQuestion).toHaveBeenCalledWith({
      artifactId: "plan-1",
      questionId: "question-1",
      answer: { kind: "option", optionId: "yes" },
    });
    expect(updatePlannerPlanArtifact).toHaveBeenCalledWith({ artifactId: "plan-1", workflowState: "finalizing" });
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      collaborationMode: "planner",
      content: expect.stringContaining("Apply the answered Planner decisions"),
    }));
  });
});

type AmbientDesktopMock = Partial<typeof window.ambientDesktop>;

function createController({
  ambientDesktop,
  draft = "Existing feedback",
  plannerRevisionDialog,
  running = false,
  setPlannerRevisionDialog,
  state = desktopState(),
}: {
  ambientDesktop?: AmbientDesktopMock;
  draft?: string;
  plannerRevisionDialog?: PlannerRevisionDialogState;
  running?: boolean;
  setPlannerRevisionDialog?: Dispatch<SetStateAction<PlannerRevisionDialogState | undefined>>;
  state?: DesktopState;
} = {}) {
  if (ambientDesktop) vi.stubGlobal("window", { ambientDesktop });
  const stateState = statefulSetter<DesktopState | undefined>(state);
  const contextError = statefulSetter<string | undefined>(undefined);
  const runStatus = statefulSetter<RunStatus>("idle");
  const threadRunStatuses = statefulSetter<Record<string, RunStatus>>({});
  const plannerDialog = statefulSetter<PlannerRevisionDialogState | undefined>(plannerRevisionDialog);
  const calls: {
    composerDrafts: string[];
    composerDraftOptions: Array<{ clearSlashCommandSelection?: boolean } | undefined>;
    errors: Array<string | undefined>;
  } = {
    composerDrafts: [],
    composerDraftOptions: [],
    errors: [],
  };
  const resetRunActivityLines = vi.fn();
  const updateThreadSettings = vi.fn(async () => undefined);

  const actions = createAppPlannerActions({
    getComposerDraft: () => draft,
    plannerRevisionDialog,
    resetRunActivityLines,
    running,
    setComposerDraft: (value, options) => {
      calls.composerDrafts.push(value);
      calls.composerDraftOptions.push(options);
    },
    setContextError: contextError.set,
    setError: (message) => calls.errors.push(message),
    setPlannerRevisionDialog: setPlannerRevisionDialog ?? plannerDialog.set,
    setRunStatus: runStatus.set,
    setState: stateState.set,
    setThreadRunStatuses: threadRunStatuses.set,
    state,
    updateThreadSettings,
  });

  return {
    actions,
    calls,
    resetRunActivityLines,
    runStatus,
    state: stateState,
    threadRunStatuses,
    updateThreadSettings,
  };
}

function desktopState(plannerPlanArtifacts: PlannerPlanArtifact[] = []): DesktopState {
  return {
    activeThreadId: "thread-1",
    plannerPlanArtifacts,
    settings: {
      collaborationMode: "planner",
      model: "ambient",
      permissionMode: "full-access",
      planner: { autoFinalize: true },
      thinkingLevel: "medium",
    },
  } as unknown as DesktopState;
}

function plannerArtifact(overrides: Partial<PlannerPlanArtifact> = {}): PlannerPlanArtifact {
  return {
    id: "plan-1",
    threadId: "thread-1",
    sourceMessageId: "message-1",
    status: "ready",
    workflowState: "draft",
    title: "Simplify renderer shell",
    summary: "Move planner actions out of App.",
    content: "Plan content",
    steps: [{ id: "step-1", title: "Extract actions" }],
    openQuestions: [],
    risks: [],
    verification: [],
    decisionQuestions: [],
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
    ...overrides,
  };
}

function plannerQuestion(overrides: Partial<PlannerDecisionQuestion> = {}): PlannerDecisionQuestion {
  return {
    id: "question-1",
    question: "Which slice first?",
    recommendedOptionId: "yes",
    required: false,
    options: [
      {
        id: "yes",
        label: "Planner",
        description: "Extract planner actions.",
      },
    ],
    ...overrides,
  };
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
  const set: Dispatch<SetStateAction<T>> = (next) => {
    state.value = typeof next === "function" ? (next as (current: T) => T)(state.value) : next;
    state.calls.push(state.value);
  };
  return {
    get calls() {
      return state.calls;
    },
    set,
    get value() {
      return state.value;
    },
  };
}
