import { describe, expect, it, vi } from "vitest";

import type {
  PlannerDurableArtifactValidationResult,
  PlannerPlanArtifact,
  PlannerPlanWorkflowState,
} from "../../shared/plannerTypes";
import { PlannerDurableHtmlValidationError } from "./plannerDurableHtml";
import {
  createPlannerDurableArtifactDesktopService,
  type PlannerDurableArtifactStore,
  type PlannerDurableArtifactWriteInput,
} from "./plannerDurableArtifactDesktopService";

const okValidation: PlannerDurableArtifactValidationResult = {
  ok: true,
  checkedAt: "2026-05-11T00:00:00.000Z",
  errors: [],
  warnings: [],
};

const failedValidation: PlannerDurableArtifactValidationResult = {
  ok: false,
  checkedAt: "2026-05-11T00:00:00.000Z",
  errors: [{ code: "browser-svg-zero-size", message: "SVG was zero size." }],
  warnings: [],
};

function artifact(overrides: Partial<PlannerPlanArtifact> = {}): PlannerPlanArtifact {
  return {
    id: "plan-1",
    threadId: "thread-1",
    sourceMessageId: "message-1",
    status: "ready",
    workflowState: "answers_complete",
    title: "Durable Planner Plan",
    summary: "Turn a plan into a durable artifact.",
    content: "# Plan",
    steps: [],
    openQuestions: [],
    risks: [],
    verification: [],
    decisionQuestions: [
      {
        id: "storage",
        question: "Where should it live?",
        recommendedOptionId: "board",
        required: true,
        options: [{ id: "board", label: "Board plans", description: "Managed board plan folder." }],
        answer: { kind: "option", optionId: "board", answeredAt: "2026-05-11T00:00:00.000Z" },
      },
    ],
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T00:00:00.000Z",
    ...overrides,
  };
}

class FakePlannerStore implements PlannerDurableArtifactStore {
  current: PlannerPlanArtifact;
  promotedIds: string[] = [];

  constructor(initial: PlannerPlanArtifact = artifact()) {
    this.current = initial;
  }

  getPlannerPlanArtifact(artifactId: string): PlannerPlanArtifact {
    if (artifactId !== this.current.id) throw new Error(`Unknown artifact ${artifactId}`);
    return this.current;
  }

  getThread(threadId: string) {
    if (threadId !== this.current.threadId) throw new Error(`Unknown thread ${threadId}`);
    return { id: threadId, title: "Planner thread" };
  }

  getProjectArtifactWorkspacePath(): string {
    return "/tmp/project-artifacts";
  }

  updatePlannerPlanArtifact(
    artifactId: string,
    input: { workflowState?: PlannerPlanWorkflowState },
  ): PlannerPlanArtifact {
    this.current = {
      ...this.getPlannerPlanArtifact(artifactId),
      ...input,
      updatedAt: "2026-05-11T00:00:01.000Z",
    };
    return this.current;
  }

  setPlannerPlanDurableArtifact(
    artifactId: string,
    input: {
      path: string;
      generatedAt: string;
      validation?: PlannerDurableArtifactValidationResult;
      workflowState?: PlannerPlanWorkflowState;
    },
  ): PlannerPlanArtifact {
    this.current = {
      ...this.getPlannerPlanArtifact(artifactId),
      durableArtifactPath: input.path,
      durableArtifactGeneratedAt: input.generatedAt,
      durableArtifactValidation: input.validation,
      workflowState: input.workflowState ?? "durable_ready",
      updatedAt: "2026-05-11T00:00:02.000Z",
    };
    return this.current;
  }

  setPlannerPlanDurableArtifactValidation(
    artifactId: string,
    validation: PlannerDurableArtifactValidationResult,
    workflowState?: PlannerPlanWorkflowState,
  ): PlannerPlanArtifact {
    this.current = {
      ...this.getPlannerPlanArtifact(artifactId),
      durableArtifactValidation: validation,
      workflowState: workflowState ?? this.current.workflowState,
      updatedAt: "2026-05-11T00:00:03.000Z",
    };
    return this.current;
  }

  promotePlannerDurableArtifactToBoardSource(artifactId: string): unknown {
    this.promotedIds.push(artifactId);
    return { id: `source-${artifactId}` };
  }
}

function durableResult(path = ".ambient/board/plans/plan.html") {
  return {
    relativePath: path,
    absolutePath: `/tmp/project-artifacts/${path}`,
    manifestRelativePath: path.replace(/\.html$/, ".manifest.json"),
    contentSha256: "a".repeat(64),
    generatedAt: "2026-05-11T00:00:00.000Z",
    byteSize: 1200,
    validation: okValidation,
  };
}

function serviceFor(store = new FakePlannerStore()) {
  const host = { store };
  const emitPlannerPlanArtifactUpdated = vi.fn();
  const emitProjectStateIfActive = vi.fn();
  const writePlannerDurableHtmlArtifact = vi.fn<(input: PlannerDurableArtifactWriteInput) => Promise<ReturnType<typeof durableResult>>>()
    .mockResolvedValue(durableResult());
  const plannerDurableFallbackWarnings = vi.fn(() => [{ code: "fallback", message: "Used deterministic diagrams." }]);
  const commitGitPaths = vi.fn().mockResolvedValue(undefined);
  const warn = vi.fn();
  const validatePlannerDurableHtmlFileInBrowser = vi.fn();
  const service = createPlannerDurableArtifactDesktopService({
    requireProjectRuntimeHostForPlannerPlanArtifact: vi.fn(() => host),
    emitPlannerPlanArtifactUpdated,
    emitProjectStateIfActive,
    writePlannerDurableHtmlArtifact,
    plannerDurableFallbackWarnings,
    validatePlannerDurableHtmlFileInBrowser,
    commitGitPaths,
    warn,
  });
  return {
    commitGitPaths,
    emitPlannerPlanArtifactUpdated,
    emitProjectStateIfActive,
    host,
    plannerDurableFallbackWarnings,
    service,
    store,
    validatePlannerDurableHtmlFileInBrowser,
    warn,
    writePlannerDurableHtmlArtifact,
  };
}

describe("createPlannerDurableArtifactDesktopService", () => {
  it("generates a durable artifact, promotes it to the board, commits it, and emits updates", async () => {
    const fixture = serviceFor();

    await expect(fixture.service.generatePlannerDurableArtifact({ artifactId: "plan-1" })).resolves.toMatchObject({
      id: "plan-1",
      workflowState: "durable_ready",
      durableArtifactPath: ".ambient/board/plans/plan.html",
    });

    expect(fixture.writePlannerDurableHtmlArtifact).toHaveBeenCalledWith({
      artifact: expect.objectContaining({ workflowState: "durable_generating" }),
      threadTitle: "Planner thread",
      workspacePath: "/tmp/project-artifacts",
      browserValidator: fixture.validatePlannerDurableHtmlFileInBrowser,
    });
    expect(fixture.store.promotedIds).toEqual(["plan-1"]);
    expect(fixture.commitGitPaths).toHaveBeenCalledWith("/tmp/project-artifacts", {
      paths: [".ambient/board/plans/plan.html", ".ambient/board/plans/plan.manifest.json"],
      message: "Add durable plan: Durable Planner Plan",
      force: true,
    });
    expect(fixture.emitPlannerPlanArtifactUpdated).toHaveBeenCalledTimes(2);
    expect(fixture.emitProjectStateIfActive).toHaveBeenCalledWith(fixture.host);
  });

  it("uses deterministic fallback diagrams when browser validation rejects provided diagrams", async () => {
    const fixture = serviceFor();
    fixture.writePlannerDurableHtmlArtifact
      .mockRejectedValueOnce(new PlannerDurableHtmlValidationError(failedValidation))
      .mockResolvedValueOnce(durableResult(".ambient/board/plans/fallback.html"));

    await expect(fixture.service.generatePlannerDurableArtifact({ artifactId: "plan-1" })).resolves.toMatchObject({
      workflowState: "durable_ready_with_fallbacks",
      durableArtifactPath: ".ambient/board/plans/fallback.html",
    });

    expect(fixture.plannerDurableFallbackWarnings).toHaveBeenCalledWith(failedValidation);
    expect(fixture.writePlannerDurableHtmlArtifact).toHaveBeenLastCalledWith({
      artifact: expect.objectContaining({ workflowState: "durable_generating" }),
      threadTitle: "Planner thread",
      workspacePath: "/tmp/project-artifacts",
      browserValidator: fixture.validatePlannerDurableHtmlFileInBrowser,
      diagramMode: "deterministic",
      validationWarnings: [{ code: "fallback", message: "Used deterministic diagrams." }],
    });
    expect(fixture.commitGitPaths).toHaveBeenCalledWith("/tmp/project-artifacts", {
      paths: [".ambient/board/plans/fallback.html", ".ambient/board/plans/fallback.manifest.json"],
      message: "Add durable plan: Durable Planner Plan",
      force: true,
    });
  });

  it("marks the artifact failed when durable HTML generation throws a non-validation error", async () => {
    const fixture = serviceFor();
    const failure = new Error("disk full");
    fixture.writePlannerDurableHtmlArtifact.mockRejectedValueOnce(failure);

    await expect(fixture.service.generatePlannerDurableArtifact({ artifactId: "plan-1" })).rejects.toThrow("disk full");

    expect(fixture.store.current.workflowState).toBe("failed");
    expect(fixture.emitPlannerPlanArtifactUpdated).toHaveBeenLastCalledWith(
      expect.objectContaining({ workflowState: "failed" }),
      fixture.store,
    );
    expect(fixture.emitProjectStateIfActive).toHaveBeenCalledWith(fixture.host);
  });

  it("records validation failure when fallback durable HTML also fails validation", async () => {
    const fixture = serviceFor();
    fixture.writePlannerDurableHtmlArtifact
      .mockRejectedValueOnce(new PlannerDurableHtmlValidationError(failedValidation))
      .mockRejectedValueOnce(new PlannerDurableHtmlValidationError(failedValidation));

    await expect(fixture.service.generatePlannerDurableArtifact({ artifactId: "plan-1" })).rejects.toThrow(
      PlannerDurableHtmlValidationError,
    );

    expect(fixture.store.current).toMatchObject({
      workflowState: "failed",
      durableArtifactValidation: failedValidation,
    });
    expect(fixture.emitPlannerPlanArtifactUpdated).toHaveBeenLastCalledWith(
      expect.objectContaining({ workflowState: "failed", durableArtifactValidation: failedValidation }),
      fixture.store,
    );
  });

  it("rejects non-ready artifacts and unanswered required decisions before writing", async () => {
    const implemented = serviceFor(new FakePlannerStore(artifact({ status: "implemented" })));
    await expect(implemented.service.generatePlannerDurableArtifact({ artifactId: "plan-1" })).rejects.toThrow(
      "Only ready planner plans can generate durable artifacts.",
    );
    expect(implemented.writePlannerDurableHtmlArtifact).not.toHaveBeenCalled();

    const unanswered = serviceFor(new FakePlannerStore(artifact({
      decisionQuestions: [
        {
          id: "storage",
          question: "Where should it live?",
          recommendedOptionId: "board",
          required: true,
          options: [{ id: "board", label: "Board plans", description: "Managed board plan folder." }],
        },
      ],
    })));
    await expect(unanswered.service.generatePlannerDurableArtifact({ artifactId: "plan-1" })).rejects.toThrow(
      "Answer required planner decisions before generating a durable plan.",
    );
    expect(unanswered.writePlannerDurableHtmlArtifact).not.toHaveBeenCalled();
  });

  it("logs and continues when the best-effort durable artifact commit fails", async () => {
    const fixture = serviceFor();
    fixture.commitGitPaths.mockRejectedValueOnce(new Error("not a git repo"));

    await expect(fixture.service.generatePlannerDurableArtifact({ artifactId: "plan-1" })).resolves.toMatchObject({
      workflowState: "durable_ready",
    });

    expect(fixture.warn).toHaveBeenCalledWith("[planner] Failed to commit durable plan artifact: not a git repo");
  });
});
