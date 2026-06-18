import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type {
  GeneratePlannerDurableArtifactInput,
  PlannerPlanArtifact,
} from "../../shared/plannerTypes";
import {
  plannerPlanAnswerQuestionIpcChannels,
  plannerPlanGenerateDurableArtifactIpcChannels,
  plannerPlanUpdateIpcChannels,
  type PlannerPlanAnswerQuestionAnswer,
  type PlannerPlanAnswerQuestionStore,
  registerPlannerPlanAnswerQuestionIpc,
  registerPlannerPlanGenerateDurableArtifactIpc,
  type RegisterPlannerPlanGenerateDurableArtifactIpcDependencies,
  type PlannerPlanUpdatePatch,
  registerPlannerPlanUpdateIpc,
  type RegisterPlannerPlanAnswerQuestionIpcDependencies,
  type PlannerPlanUpdateStore,
  type RegisterPlannerPlanUpdateIpcDependencies,
} from "./registerPlannerPlanIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

interface FakeHost {
  store: FakeStore;
}

interface FakeStore extends PlannerPlanUpdateStore<FakeArtifact> {
  updatePlannerPlanArtifact: ReturnType<typeof vi.fn<(artifactId: string, input: PlannerPlanUpdatePatch) => FakeArtifact>>;
}

interface FakeAnswerQuestionHost {
  store: FakeAnswerQuestionStore;
}

interface FakeAnswerQuestionStore extends PlannerPlanAnswerQuestionStore<FakeArtifact> {
  answerPlannerDecisionQuestion: ReturnType<typeof vi.fn<(
    artifactId: string,
    questionId: string,
    answer: PlannerPlanAnswerQuestionAnswer,
  ) => FakeArtifact>>;
}

type FakeArtifact = Pick<PlannerPlanArtifact, "id" | "threadId" | "status" | "workflowState">;

describe("registerPlannerPlanUpdateIpc", () => {
  it("registers the planner plan update channel", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...plannerPlanUpdateIpcChannels]);
  });

  it("updates a planner plan artifact, emits it, and returns it", async () => {
    const artifact = sampleArtifact({
      status: "implemented",
      workflowState: "durable_ready",
    });
    const { deps, host, invoke } = registerWithFakes({ artifact });

    await expect(invoke("planner-plan:update", {
      artifactId: "artifact-1",
      status: "implemented",
      workflowState: "durable_ready",
    })).resolves.toEqual(artifact);

    expect(deps.requireProjectRuntimeHostForPlannerPlanArtifact).toHaveBeenCalledWith("artifact-1");
    expect(host.store.updatePlannerPlanArtifact).toHaveBeenCalledWith("artifact-1", {
      status: "implemented",
      workflowState: "durable_ready",
    });
    expect(deps.emitPlannerPlanArtifactUpdated).toHaveBeenCalledWith(artifact, host.store);
  });

  it("rejects invalid planner plan updates before resolving a host", () => {
    const { deps, host, invoke } = registerWithFakes();

    expect(() => invoke("planner-plan:update", { artifactId: "" })).toThrow();
    expect(() => invoke("planner-plan:update", { artifactId: "artifact-1" })).toThrow();
    expect(() => invoke("planner-plan:update", { artifactId: "artifact-1", status: "done" })).toThrow();
    expect(deps.requireProjectRuntimeHostForPlannerPlanArtifact).not.toHaveBeenCalled();
    expect(host.store.updatePlannerPlanArtifact).not.toHaveBeenCalled();
    expect(deps.emitPlannerPlanArtifactUpdated).not.toHaveBeenCalled();
  });
});

describe("registerPlannerPlanGenerateDurableArtifactIpc", () => {
  it("registers the planner plan durable artifact generation channel", () => {
    const { handlers } = registerGenerateDurableArtifactWithFakes();

    expect([...handlers.keys()]).toEqual([...plannerPlanGenerateDurableArtifactIpcChannels]);
  });

  it("generates a durable planner artifact and returns it", async () => {
    const artifact = sampleArtifact({
      status: "implemented",
      workflowState: "durable_ready",
    });
    const { deps, invoke } = registerGenerateDurableArtifactWithFakes({ artifact });

    await expect(invoke("planner-plan:generate-durable-artifact", {
      artifactId: "artifact-1",
    })).resolves.toEqual(artifact);

    expect(deps.generatePlannerDurableArtifact).toHaveBeenCalledWith({ artifactId: "artifact-1" });
  });

  it("rejects invalid durable artifact generation input before generating", async () => {
    const { deps, invoke } = registerGenerateDurableArtifactWithFakes();

    await expect(invoke("planner-plan:generate-durable-artifact", { artifactId: "" })).rejects.toThrow();
    expect(deps.generatePlannerDurableArtifact).not.toHaveBeenCalled();
  });
});

describe("registerPlannerPlanAnswerQuestionIpc", () => {
  it("registers the planner plan answer question channel", () => {
    const { handlers } = registerAnswerQuestionWithFakes();

    expect([...handlers.keys()]).toEqual([...plannerPlanAnswerQuestionIpcChannels]);
  });

  it("answers a planner decision question, emits the artifact, and returns it", async () => {
    const artifact = sampleArtifact({
      status: "ready",
      workflowState: "answers_complete",
    });
    const answer: PlannerPlanAnswerQuestionAnswer = { kind: "option", optionId: "option-1" };
    const { deps, host, invoke } = registerAnswerQuestionWithFakes({ artifact });

    await expect(invoke("planner-plan:answer-question", {
      artifactId: "artifact-1",
      questionId: "question-1",
      answer,
    })).resolves.toEqual(artifact);

    expect(deps.requireProjectRuntimeHostForPlannerPlanArtifact).toHaveBeenCalledWith("artifact-1");
    expect(host.store.answerPlannerDecisionQuestion).toHaveBeenCalledWith("artifact-1", "question-1", answer);
    expect(deps.emitPlannerPlanArtifactUpdated).toHaveBeenCalledWith(artifact, host.store);
  });

  it("trims custom planner decision answers before storing them", async () => {
    const { host, invoke } = registerAnswerQuestionWithFakes();

    await expect(invoke("planner-plan:answer-question", {
      artifactId: "artifact-1",
      questionId: "question-1",
      answer: { kind: "custom", customText: "  choose this path  " },
    })).resolves.toEqual(sampleArtifact());

    expect(host.store.answerPlannerDecisionQuestion).toHaveBeenCalledWith("artifact-1", "question-1", {
      kind: "custom",
      customText: "choose this path",
    });
  });

  it("rejects invalid planner decision answers before resolving a host", () => {
    const { deps, host, invoke } = registerAnswerQuestionWithFakes();

    expect(() => invoke("planner-plan:answer-question", {
      artifactId: "",
      questionId: "question-1",
      answer: { kind: "option", optionId: "option-1" },
    })).toThrow();
    expect(() => invoke("planner-plan:answer-question", {
      artifactId: "artifact-1",
      questionId: "",
      answer: { kind: "option", optionId: "option-1" },
    })).toThrow();
    expect(() => invoke("planner-plan:answer-question", {
      artifactId: "artifact-1",
      questionId: "question-1",
      answer: { kind: "custom", customText: "   " },
    })).toThrow();
    expect(deps.requireProjectRuntimeHostForPlannerPlanArtifact).not.toHaveBeenCalled();
    expect(host.store.answerPlannerDecisionQuestion).not.toHaveBeenCalled();
    expect(deps.emitPlannerPlanArtifactUpdated).not.toHaveBeenCalled();
  });
});

function registerWithFakes({
  artifact = sampleArtifact(),
}: {
  artifact?: FakeArtifact;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const host: FakeHost = {
    store: {
      updatePlannerPlanArtifact: vi.fn(() => artifact),
    },
  };
  const deps: RegisterPlannerPlanUpdateIpcDependencies<FakeArtifact, FakeStore, FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForPlannerPlanArtifact: vi.fn(() => host),
    emitPlannerPlanArtifactUpdated: vi.fn(),
  };
  registerPlannerPlanUpdateIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerAnswerQuestionWithFakes({
  artifact = sampleArtifact(),
}: {
  artifact?: FakeArtifact;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const host: FakeAnswerQuestionHost = {
    store: {
      answerPlannerDecisionQuestion: vi.fn(() => artifact),
    },
  };
  const deps: RegisterPlannerPlanAnswerQuestionIpcDependencies<
    FakeArtifact,
    FakeAnswerQuestionStore,
    FakeAnswerQuestionHost
  > = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForPlannerPlanArtifact: vi.fn(() => host),
    emitPlannerPlanArtifactUpdated: vi.fn(),
  };
  registerPlannerPlanAnswerQuestionIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerGenerateDurableArtifactWithFakes({
  artifact = sampleArtifact(),
}: {
  artifact?: FakeArtifact;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterPlannerPlanGenerateDurableArtifactIpcDependencies<FakeArtifact> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    generatePlannerDurableArtifact: vi.fn(async (_input: GeneratePlannerDurableArtifactInput) => artifact),
  };
  registerPlannerPlanGenerateDurableArtifactIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function sampleArtifact(overrides: Partial<FakeArtifact> = {}): FakeArtifact {
  return {
    id: "artifact-1",
    threadId: "thread-1",
    status: overrides.status ?? "ready",
    workflowState: overrides.workflowState ?? "draft",
  };
}
