import { describe, expect, it } from "vitest";
import type { ProposalManifestArtifact } from "./projectStoreProjectBoardFacade";
import type { OrchestrationRun } from "../../shared/workflowTypes";
import type { ProjectBoardCard } from "../../shared/projectBoardTypes";
import {
  firstMeaningfulLine,
  normalizeCardTextList,
  objectiveProvenanceJson,
  normalizeProjectBoardCardRunFeedback,
  normalizeProjectBoardCardRunFeedbackSource,
  normalizeProjectBoardCardTestPlan,
  normalizeProjectBoardObjectiveProvenance,
  normalizeProjectBoardProofFollowUpSuggestion,
  normalizeProjectBoardSynthesisProposalAnswer,
  normalizeProjectBoardSynthesisProposalCard,
  projectBoardSynthesisProposalCardsFromDraft,
  normalizeRunFollowUps,
  normalizeTaskLabels,
  normalizeTaskReferences,
  normalizeTaskState,
  normalizeUnknownProjectBoardTestPlan,
  plannerPlanCandidateStatus,
  plannerPlanClarificationDecisions,
  plannerPlanClarificationQuestions,
  plannerPlanDraftCards,
  plannerPlanShouldStayCompact,
  orchestrationTaskHasActiveBlocker,
  plannerVerificationToTestPlan,
  parseProjectBoardCardRunFeedback,
  projectBoardCardClosePolicyDescription,
  projectBoardCardTaskDescription,
  projectBoardCardProofCount,
  projectBoardCardStatusWithProofReview,
  projectBoardDependencyArtifactKey,
  projectBoardDependencyArtifactPromptSection,
  projectBoardExecutionArtifactCardId,
  projectBoardExecutionArtifactHandoffFromArtifact,
  projectBoardExecutionArtifactProofFromArtifact,
  projectBoardExecutionArtifactStartedAt,
  projectBoardExecutionArtifactStatus,
  projectBoardExecutionArtifactUpdatedAt,
  projectBoardHasTrustworthyTaskCompletion,
  projectBoardProofFollowUpOptionsFromSuggestion,
  projectBoardProofOfWorkForRun,
  projectBoardRunStatusCanCopySession,
  projectBoardRunHasReviewableProof,
  projectBoardRunStageFromArtifactProgress,
  projectBoardRunStageFromManifest,
  projectBoardRunStatusFromProposalManifest,
  projectBoardTerminalBlockerDetail,
  projectBoardStatusForTask,
  projectBoardSynthesisDraftWithSourceIdNamespace,
  projectBoardSynthesisProposalCardReviewStatus,
  projectBoardSynthesisProposalCardReviewStillApplies,
  projectBoardResolveInside,
  projectBoardTaskStateForProofReview,
  projectBoardTestPolicyRequiresProofSpec,
  renderProjectBoardCardDependencyExecutionContext,
  resolveProjectBoardTaskBlockers,
  splitProjectBoardCardDescription,
} from "./projectBoardMappers";
import {
  runManifestArtifact,
  runProofArtifact,
  runHandoffArtifact,
  projectBoardCard,
  plannerPlanArtifact,
  orchestrationTask,
} from "./projectBoardMappersTestSupport";

describe("project board store mappers", () => {
  it("normalizes card text lists by trimming, deduping, dropping blanks, and applying a limit", () => {
    expect(normalizeCardTextList(["  first  ", "", "second", "first", "third"], 2)).toEqual(["first", "second"]);
  });

  it("normalizes project board task labels and references", () => {
    expect(normalizeTaskLabels([" UI ", "ui", "Backend", "", " backend "])).toEqual(["ui", "backend"]);
    expect(normalizeTaskReferences([" card-1 ", "card-1", "", ...Array.from({ length: 55 }, (_, index) => `ref-${index}`)])).toEqual([
      "card-1",
      ...Array.from({ length: 49 }, (_, index) => `ref-${index}`),
    ]);
  });

  it("resolves project board blocker cards to linked task identifiers", () => {
    const dependencyTask = orchestrationTask({ id: "task-dependency", identifier: "TASK-17" });
    const fallbackTask = orchestrationTask({ id: "task-fallback", identifier: "TASK-18" });
    const dependencyCard = projectBoardCard({
      id: "card-dependency",
      sourceId: "synthesis:dependency",
      orchestrationTaskId: dependencyTask.id,
    });
    const fallbackCard = projectBoardCard({
      id: "card-fallback",
      sourceId: "synthesis:fallback",
      orchestrationTaskId: fallbackTask.id,
    });
    const current = projectBoardCard({
      id: "card-current",
      blockedBy: [" card-dependency ", "synthesis:fallback", "card-current", "missing-card", "TASK-17", "missing-card"],
    });

    expect(resolveProjectBoardTaskBlockers(current, [current, dependencyCard, fallbackCard], [dependencyTask])).toEqual([
      "TASK-17",
      fallbackTask.id,
      "card-current",
      "missing-card",
    ]);
  });

  it("does not resolve terminal audit candidates into active task blockers", () => {
    const duplicateCard = projectBoardCard({ id: "card-duplicate", title: "Duplicate auth", candidateStatus: "duplicate" });
    const rejectedCard = projectBoardCard({ id: "card-rejected", title: "Rejected auth", candidateStatus: "rejected" });
    const coveredCard = projectBoardCard({ id: "card-covered", title: "Covered auth", candidateStatus: "evidence" });
    const current = projectBoardCard({
      id: "card-current",
      blockedBy: ["card-duplicate", "card-rejected", "card-covered", "missing-card"],
    });

    expect(resolveProjectBoardTaskBlockers(current, [current, duplicateCard, rejectedCard, coveredCard], [])).toEqual(["missing-card"]);
  });

  it("maps orchestration task state and blockers to project board status", () => {
    const doneBlocker = orchestrationTask({ id: "done", identifier: "DONE-1", state: "done" });
    const activeBlocker = orchestrationTask({ id: "active", identifier: "ACTIVE-1", state: "in progress" });

    expect(normalizeTaskState(" In Progress ")).toBe("in_progress");
    expect(normalizeTaskState(" ")).toBe("todo");
    expect(projectBoardStatusForTask(orchestrationTask({ state: "needs review" }), [])).toBe("review");
    expect(projectBoardStatusForTask(orchestrationTask({ state: "needs_info" }), [])).toBe("blocked");
    expect(projectBoardStatusForTask(orchestrationTask({ state: "duplicate" }), [])).toBe("done");
    expect(orchestrationTaskHasActiveBlocker(orchestrationTask({ blockedBy: ["DONE-1"] }), [doneBlocker])).toBe(false);
    expect(orchestrationTaskHasActiveBlocker(orchestrationTask({ blockedBy: ["active"] }), [activeBlocker])).toBe(true);
    expect(orchestrationTaskHasActiveBlocker(orchestrationTask({ blockedBy: ["missing"] }), [])).toBe(true);
    expect(projectBoardStatusForTask(orchestrationTask({ blockedBy: ["active"] }), [activeBlocker])).toBe("blocked");
  });

  it("overlays project board proof review status on task-derived status", () => {
    const proofReview = (status: "ready_for_review" | "needs_follow_up" | "terminally_blocked" | "retry_recommended" | "done") => ({
      status,
      summary: "Reviewed",
      satisfied: [],
      missing: [],
      followUpCardIds: [],
      runId: "run-1",
      reviewedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(projectBoardCardStatusWithProofReview("ready", undefined)).toBe("ready");
    expect(projectBoardCardStatusWithProofReview("ready", proofReview("ready_for_review"))).toBe("review");
    expect(projectBoardCardStatusWithProofReview("done", proofReview("ready_for_review"))).toBe("done");
    expect(projectBoardCardStatusWithProofReview("ready", proofReview("needs_follow_up"))).toBe("blocked");
    expect(projectBoardCardStatusWithProofReview("ready", proofReview("retry_recommended"))).toBe("blocked");
    expect(projectBoardCardStatusWithProofReview("ready", proofReview("terminally_blocked"))).toBe("blocked");
    expect(projectBoardCardStatusWithProofReview("blocked", proofReview("done"))).toBe("done");
  });

  it("maps project board proof review status to orchestration task state", () => {
    expect(projectBoardTaskStateForProofReview("done")).toBe("done");
    expect(projectBoardTaskStateForProofReview("ready_for_review")).toBe("needs_review");
    expect(projectBoardTaskStateForProofReview("terminally_blocked")).toBe("terminal_blocker");
    expect(projectBoardTaskStateForProofReview("needs_follow_up")).toBe("needs_info");
    expect(projectBoardTaskStateForProofReview("retry_recommended")).toBe("needs_info");
  });

  it("reads the first meaningful planner content line", () => {
    expect(firstMeaningfulLine("\n\n# Main Goal\n\nDetails")).toBe("Main Goal");
    expect(firstMeaningfulLine("###   Nested Heading  \nBody")).toBe("Nested Heading");
    expect(firstMeaningfulLine("\n \n")).toBe("");
  });

  it("maps planner verification text into test plan buckets", () => {
    expect(
      plannerVerificationToTestPlan([" run unit tests ", "Capture a browser screenshot", "E2E smoke flow", "Review release notes", ""]),
    ).toEqual({
      unit: ["run unit tests"],
      integration: ["E2E smoke flow"],
      visual: ["Capture a browser screenshot"],
      manual: ["Review release notes"],
    });

    expect(plannerVerificationToTestPlan([" ", ""])).toEqual({
      unit: [],
      integration: [],
      visual: [],
      manual: ["Review changed behavior against the plan."],
    });
  });

  it("derives project board candidate status from planner plan questions", () => {
    expect(plannerPlanCandidateStatus(plannerPlanArtifact())).toBe("ready_to_create");
    expect(plannerPlanCandidateStatus(plannerPlanArtifact({ openQuestions: ["Which renderer?"] }))).toBe("needs_clarification");
    expect(
      plannerPlanCandidateStatus(
        plannerPlanArtifact({
          openQuestions: [
            "Risk: Minimal — single-file vanilla app with no dependencies.",
            'Open question: Should we add a "Clear" button or a history of past picks? (Out of scope for "simple" but easy to add later)',
          ],
        }),
      ),
    ).toBe("ready_to_create");
    expect(
      plannerPlanCandidateStatus(
        plannerPlanArtifact({
          decisionQuestions: [
            {
              id: "decision-1",
              question: "Which renderer?",
              recommendedOptionId: "react",
              required: true,
              options: [{ id: "react", label: "React", description: "Use React." }],
            },
          ],
        }),
      ),
    ).toBe("needs_clarification");
    expect(plannerPlanClarificationQuestions(plannerPlanArtifact({ openQuestions: [" Which renderer? "] }))).toEqual(["Which renderer?"]);
    expect(
      plannerPlanClarificationDecisions(
        plannerPlanArtifact({
          decisionQuestions: [
            {
              id: "decision-1",
              question: "Which renderer?",
              recommendedOptionId: "react",
              required: true,
              options: [{ id: "react", label: "React", description: "Use React." }],
            },
          ],
        }),
        "2026-01-01T00:00:00.000Z",
      ),
    ).toEqual([
      expect.objectContaining({
        question: "Which renderer?",
        state: "open",
        suggestedAnswer: "React: Use React.",
      }),
    ]);
  });

  it("maps single-card planner plans into project board draft cards", () => {
    expect(
      plannerPlanDraftCards(
        plannerPlanArtifact({
          title: "  ",
          summary: "  ",
          content: "# Durable plan\n\nImplement the first card.",
          verification: ["unit coverage"],
        }),
      ),
    ).toEqual([
      {
        title: "Planner plan",
        description: "Durable plan",
        sourceId: "plan-1",
        labels: ["plan"],
        blockedBy: [],
        acceptanceCriteria: ["Plan goals are implemented and verified."],
        testPlan: { unit: ["unit coverage"], integration: [], visual: [], manual: [] },
      },
    ]);
  });

  it("maps multi-step planner plans into a compact source-backed seed card", () => {
    const cards = plannerPlanDraftCards(
      plannerPlanArtifact({
        id: "artifact-1",
        title: " Dashboard rollout ",
        summary: " Ship the dashboard in slices. ",
        steps: [
          { id: "setup data", title: " Create data model ", detail: "- Persist the model\n- Add tests" },
          { id: "Render UI!", title: " Render dashboard UI ", detail: "Show the shell." },
        ],
        verification: ["integration smoke", "visual screenshot"],
      }),
    );

    expect(cards).toEqual([
      {
        title: "Dashboard rollout",
        description: "Ship the dashboard in slices.",
        sourceId: "artifact-1",
        labels: ["plan"],
        blockedBy: [],
        acceptanceCriteria: ["Create data model", "Render dashboard UI"],
        testPlan: { unit: [], integration: ["integration smoke"], visual: ["visual screenshot"], manual: [] },
      },
    ]);
  });

  it("keeps simple local single-file planner plans compact", () => {
    const artifact = plannerPlanArtifact({
      id: "random-picker-plan",
      title: "Local Random Option Picker",
      summary: "A simple local app where you paste options, click Pick, and see one random choice.",
      content: [
        "Scope Contract",
        "Requested: A simple local app where you paste options, click Pick, and see one random choice.",
        "Constraints: No backend, no auth, no deployment.",
        "Assumed: Single HTML file with inline CSS/JS. Pure HTML + CSS + JS in one file.",
        "Out of scope: History of picks, weighted choices, saving/sharing, deployment/build step.",
      ].join("\n"),
      steps: [
        { id: "textarea", title: "Create textarea for one option per line" },
        { id: "button", title: "Add Pick button" },
        { id: "split", title: "Split textarea by newlines and filter blanks" },
        { id: "pick", title: "Choose one option with Math.random" },
        { id: "display", title: "Display the selected option" },
      ],
      verification: ["Open random-picker/index.html via browser_local_preview."],
    });
    const cards = plannerPlanDraftCards(artifact);

    expect(plannerPlanShouldStayCompact(artifact)).toBe(true);
    expect(cards).toEqual([
      {
        title: "Local Random Option Picker",
        description: "A simple local app where you paste options, click Pick, and see one random choice.",
        sourceId: "random-picker-plan",
        labels: ["plan"],
        blockedBy: [],
        acceptanceCriteria: [
          "Create textarea for one option per line",
          "Add Pick button",
          "Split textarea by newlines and filter blanks",
          "Choose one option with Math.random",
          "Display the selected option",
        ],
        testPlan: { unit: [], integration: [], visual: ["Open random-picker/index.html via browser_local_preview."], manual: [] },
      },
    ]);
  });

  it("namespaces synthesis draft source ids and matching blockers", () => {
    const draft = {
      summary: "Draft",
      goal: "Goal",
      currentState: "Current",
      targetUser: "User",
      qualityBar: "Quality",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: " shell ",
          title: "Shell",
          description: "Build shell.",
          candidateStatus: "ready_to_create" as const,
          labels: [],
          blockedBy: [],
          acceptanceCriteria: [],
          testPlan: { unit: [], integration: [], visual: [], manual: [] },
          sourceRefs: [],
        },
        {
          sourceId: "controls",
          title: "Controls",
          description: "Build controls.",
          candidateStatus: "ready_to_create" as const,
          labels: [],
          blockedBy: ["shell", " unknown "],
          acceptanceCriteria: [],
          testPlan: { unit: [], integration: [], visual: [], manual: [] },
          sourceRefs: [],
        },
        {
          sourceId: "fresh:already",
          title: "Already namespaced",
          description: "Keep existing namespace.",
          candidateStatus: "ready_to_create" as const,
          labels: [],
          blockedBy: ["controls"],
          acceptanceCriteria: [],
          testPlan: { unit: [], integration: [], visual: [], manual: [] },
          sourceRefs: [],
        },
      ],
    };

    expect(projectBoardSynthesisDraftWithSourceIdNamespace(draft, " ")).toBe(draft);
    expect(projectBoardSynthesisDraftWithSourceIdNamespace(draft, "fresh:")).toMatchObject({
      cards: [
        { sourceId: "fresh:shell", blockedBy: [] },
        { sourceId: "fresh:controls", blockedBy: ["fresh:shell", " unknown "] },
        { sourceId: "fresh:already", blockedBy: ["fresh:controls"] },
      ],
    });
  });

  it("normalizes project board card test plans per bucket", () => {
    expect(
      normalizeProjectBoardCardTestPlan({
        unit: [" unit check ", "unit check"],
        integration: [" integration check "],
        visual: ["  "],
        manual: [" manual check "],
      }),
    ).toEqual({
      unit: ["unit check"],
      integration: ["integration check"],
      visual: [],
      manual: ["manual check"],
    });
  });

  it("counts project board proof expectations across all test-plan buckets", () => {
    expect(
      projectBoardCardProofCount({
        testPlan: {
          unit: ["mapper test", "parser test"],
          integration: ["import/export flow"],
          visual: ["browser screenshot"],
          manual: ["review release notes", "confirm copy"],
        },
      }),
    ).toBe(6);

    expect(projectBoardCardProofCount({ testPlan: { unit: [], integration: [], visual: [], manual: [] } })).toBe(0);
  });

  it("detects project board proof requirements from charter test policy", () => {
    expect(projectBoardTestPolicyRequiresProofSpec({ requireProofSpec: true })).toBe(true);
    expect(
      projectBoardTestPolicyRequiresProofSpec({ requireProofSpec: false, defaultProof: "Must include visual proof before closing." }),
    ).toBe(true);
    expect(projectBoardTestPolicyRequiresProofSpec({ defaultProof: "Needs unit and manual proof." })).toBe(true);
    expect(projectBoardTestPolicyRequiresProofSpec({ defaultProof: "Prefer screenshots where useful." })).toBe(false);
    expect(projectBoardTestPolicyRequiresProofSpec({ defaultProof: ["must include proof"] })).toBe(false);
  });

  it("scopes project board proof task actions to the active run and card", () => {
    const scoped = {
      action: "task_report_proof",
      actionId: "proof-current",
      runId: "run-1",
      taskId: "task-1",
      cardId: "card-1",
      createdAt: "2026-01-01T00:02:00.000Z",
      metadata: { transport: "native_tool" },
      summary: "Scoped proof.",
      commands: ["pnpm test"],
      changedFiles: ["src/main/projectStore/projectStore.ts"],
      screenshots: [],
      browserTraces: [],
      visualChecks: [],
      manualChecks: [],
    };
    const unrelated = {
      ...scoped,
      actionId: "proof-other",
      runId: "run-2",
      summary: "Other run proof.",
    };

    expect(
      projectBoardProofOfWorkForRun(
        {
          kind: "agent-run",
          taskToolActions: [unrelated, scoped],
          taskActionDiagnostics: { stale: true },
        },
        { id: "run-1", taskId: "task-1" },
        { id: "card-1" },
      ),
    ).toMatchObject({
      kind: "agent-run",
      taskToolActions: [scoped],
      taskActionDiagnostics: {
        actionCount: 1,
        nativeToolActionCount: 1,
        nativeToolUsed: true,
        latestAction: "task_report_proof",
        latestActionId: "proof-current",
      },
    });
  });

  it("drops unscoped project board proof task-action fields when no run actions match", () => {
    expect(
      projectBoardProofOfWorkForRun(
        {
          kind: "agent-run",
          lastAssistantText: "No scoped proof.",
          taskToolActions: [
            {
              action: "task_heartbeat",
              actionId: "heartbeat-other",
              runId: "run-2",
              taskId: "task-1",
              cardId: "card-1",
              createdAt: "2026-01-01T00:01:00.000Z",
              metadata: {},
              summary: "Other run heartbeat.",
              completed: [],
              remaining: ["Continue."],
            },
          ],
          taskActions: [{ action: "task_magic" }],
          modelTaskActions: [{ action: "task_magic" }],
          taskActionDiagnostics: { stale: true },
        },
        { id: "run-1", taskId: "task-1" },
        { id: "card-1" },
      ),
    ).toEqual({
      kind: "agent-run",
      lastAssistantText: "No scoped proof.",
    });

    expect(projectBoardProofOfWorkForRun(undefined, { id: "run-1", taskId: "task-1" })).toBeUndefined();
  });

  it("detects trustworthy task completion only when task_complete proof is valid", () => {
    const completedAction = {
      action: "task_complete",
      actionId: "complete-current",
      createdAt: "2026-01-01T00:03:00.000Z",
      metadata: { transport: "native_tool" },
      summary: "Completed the mapper extraction.",
      completed: ["Moved helper into mapper module."],
      remaining: [],
      risks: [],
      commands: ["pnpm test"],
      changedFiles: ["src/main/projectStore/projectBoardMappers.ts"],
      screenshots: [],
      browserTraces: [],
      visualChecks: [],
      manualChecks: [],
    };

    expect(projectBoardHasTrustworthyTaskCompletion(undefined)).toBe(false);
    expect(
      projectBoardHasTrustworthyTaskCompletion({
        taskToolActions: [
          {
            action: "task_report_proof",
            actionId: "proof-current",
            createdAt: "2026-01-01T00:02:00.000Z",
            metadata: {},
            summary: "Proof without completion.",
            commands: ["pnpm test"],
            changedFiles: [],
            screenshots: [],
            browserTraces: [],
            visualChecks: [],
            manualChecks: [],
          },
        ],
      }),
    ).toBe(false);
    expect(projectBoardHasTrustworthyTaskCompletion({ taskToolActions: [completedAction] })).toBe(true);
    expect(
      projectBoardHasTrustworthyTaskCompletion({
        taskToolActions: [
          {
            ...completedAction,
            actionId: "proof-1",
            summary: "summarize the actual proof collected in this run.",
          },
        ],
      }),
    ).toBe(false);
  });

  it("detects reviewable proof for a project board run", () => {
    const runWithProof = (proofOfWork: Record<string, unknown> | undefined, overrides: Partial<OrchestrationRun> = {}) =>
      ({
        id: "run-1",
        taskId: "task-1",
        proofOfWork,
        error: undefined,
        workspacePath: "/workspace/app",
        ...overrides,
      }) as OrchestrationRun;
    const card = { id: "card-1" } as ProjectBoardCard;
    const scopedCompletion = {
      action: "task_complete",
      actionId: "complete-current",
      runId: "run-1",
      taskId: "task-1",
      cardId: "card-1",
      createdAt: "2026-01-01T00:03:00.000Z",
      metadata: { transport: "native_tool" },
      summary: "Completed the mapper extraction.",
      completed: [],
      remaining: [],
      risks: [],
      commands: [],
      changedFiles: [],
      screenshots: [],
      browserTraces: [],
      visualChecks: [],
      manualChecks: [],
    };

    expect(projectBoardRunHasReviewableProof(runWithProof(undefined), card)).toBe(false);
    expect(projectBoardRunHasReviewableProof(runWithProof({ lastAssistantText: "Proof collected." }), card)).toBe(true);
    expect(projectBoardRunHasReviewableProof(runWithProof({ changedFiles: ["src/main/projectStore/projectStore.ts"] }), card)).toBe(true);
    expect(projectBoardRunHasReviewableProof(runWithProof({ taskToolActions: [scopedCompletion] }), card)).toBe(true);
    expect(
      projectBoardRunHasReviewableProof(
        runWithProof({
          taskToolActions: [{ ...scopedCompletion, actionId: "complete-other", runId: "run-2" }],
        }),
        card,
      ),
    ).toBe(false);
  });

  it("detects terminal blocker details from direct, narrative, error, and proof text sources", () => {
    expect(
      projectBoardTerminalBlockerDetail(undefined, { blockerQuestion: "Needs an API key for the production smoke endpoint." }, ""),
    ).toBe("Needs an API key for the production smoke endpoint.");

    expect(
      projectBoardTerminalBlockerDetail(
        undefined,
        {
          lastAssistantText:
            "I finished the local setup.\n- Blocked by missing credential access for the deployment smoke test.\nI can continue afterwards.",
        },
        "",
      ),
    ).toBe("Blocked by missing credential access for the deployment smoke test.");

    expect(projectBoardTerminalBlockerDetail("Run stopped while waiting on product decision for the scope split.", undefined, "")).toBe(
      "Run stopped while waiting on product decision for the scope split.",
    );

    expect(
      projectBoardTerminalBlockerDetail(
        undefined,
        undefined,
        "Proof is incomplete because the worker cannot continue without user permission.",
      ),
    ).toBe("Proof is incomplete because the worker cannot continue without user permission.");

    expect(projectBoardTerminalBlockerDetail(undefined, { lastAssistantText: "Retryable test failure." }, "")).toBeUndefined();
  });

  it("normalizes unknown project board test plans from untrusted records", () => {
    expect(
      normalizeUnknownProjectBoardTestPlan({
        unit: [" unit check ", "unit check", 42],
        integration: "not an array",
        visual: [" screenshot "],
        manual: [false, " review "],
      }),
    ).toEqual({
      unit: ["unit check", "42"],
      integration: [],
      visual: ["screenshot"],
      manual: ["false", "review"],
    });
  });

  it("normalizes project board proof follow-up suggestions conservatively", () => {
    expect(
      normalizeProjectBoardProofFollowUpSuggestion({
        title: "  Follow up on API edge case  ",
        description: "  Reproduce and fix the edge case.  ",
        acceptanceCriteria: ["  Edge case covered.  ", "Edge case covered.", 42],
        testPlan: {
          unit: [" mapper test "],
          integration: ["  "],
          visual: [" screenshot "],
          manual: [],
        },
        clarificationQuestions: [" Which API version? ", "which api version?", "How should failure be surfaced?"],
        labels: [" Follow-Up ", "follow-up", "API"],
        rationale: "  Pi identified a missing edge case.  ",
      }),
    ).toEqual({
      title: "Follow up on API edge case",
      description: "Reproduce and fix the edge case.",
      acceptanceCriteria: ["Edge case covered.", "42"],
      testPlan: { unit: ["mapper test"], integration: [], visual: ["screenshot"], manual: [] },
      clarificationQuestions: ["Which API version?", "How should failure be surfaced?"],
      labels: ["follow-up", "api"],
      rationale: "Pi identified a missing edge case.",
    });

    expect(normalizeProjectBoardProofFollowUpSuggestion({ labels: ["label-only"], rationale: "No scope." })).toBeUndefined();
    expect(normalizeProjectBoardProofFollowUpSuggestion(null)).toBeUndefined();
  });

  it("normalizes project board run follow-ups conservatively", () => {
    expect(
      normalizeRunFollowUps([
        "  Check empty-state copy  ",
        "",
        {
          title: "  Add retry affordance  ",
          description: "  Let users retry.  ",
          acceptanceCriteria: [" Retry button appears. ", "Retry button appears.", 42],
          testPlan: { unit: [" reducer test "], integration: "ignored", visual: [" screenshot "], manual: [] },
        },
        {
          description: "Missing title should get an index fallback.",
          acceptanceCriteria: [],
        },
        null,
      ]),
    ).toEqual([
      {
        title: "Check empty-state copy",
        description: "Follow-up proposed by a completed project board run.",
        acceptanceCriteria: ["Resolve follow-up: Check empty-state copy"],
        testPlan: { unit: [], integration: [], visual: [], manual: ["Review follow-up scope before ticketization."] },
      },
      {
        title: "Add retry affordance",
        description: "Let users retry.",
        acceptanceCriteria: ["Retry button appears.", "42"],
        testPlan: { unit: ["reducer test"], integration: [], visual: ["screenshot"], manual: [] },
      },
      {
        title: "Run follow-up 4",
        description: "Missing title should get an index fallback.",
        acceptanceCriteria: [],
        testPlan: { unit: [], integration: [], visual: [], manual: ["Review follow-up scope before ticketization."] },
      },
    ]);

    expect(normalizeRunFollowUps(Array.from({ length: 25 }, (_, index) => `Follow-up ${index}`))).toHaveLength(20);
    expect(normalizeRunFollowUps("not an array")).toEqual([]);
  });

  it("maps project board proof follow-up suggestions to insert options", () => {
    expect(
      projectBoardProofFollowUpOptionsFromSuggestion({
        title: "  Clarify deployment path  ",
        description: "  Ask how deployment should work.  ",
        acceptanceCriteria: [" Deployment path is explicit. "],
        testPlan: { manual: [" User confirms path. "], unit: [], integration: [], visual: [] },
        clarificationQuestions: [" Where should this deploy? "],
        labels: [" Deploy ", "deploy"],
      }),
    ).toEqual({
      title: "Clarify deployment path",
      description: "Ask how deployment should work.",
      acceptanceCriteria: ["Deployment path is explicit."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["User confirms path."] },
      clarificationQuestions: ["Where should this deploy?"],
      labels: ["pi-suggested-follow-up", "deploy"],
    });

    expect(projectBoardProofFollowUpOptionsFromSuggestion(undefined)).toBeUndefined();
    expect(projectBoardProofFollowUpOptionsFromSuggestion({ labels: ["label-only"] })).toBeUndefined();
  });

  it("renders project board card close policy with bounded runtime defaults and overrides", () => {
    expect(projectBoardCardClosePolicyDescription()).toContain("after 6 focus passes or about 20m of worker runtime.");
    expect(
      projectBoardCardClosePolicyDescription({
        maxPassesPerCard: "1",
        maxRuntimeMinutesPerCard: "90",
      }),
    ).toContain("after 1 focus pass or about 1h 30m of worker runtime.");
    expect(
      projectBoardCardClosePolicyDescription({
        maxPassesPerCard: "0",
        maxRuntimeMsPerCard: 45_000,
        maxRuntimeMinutesPerCard: "90",
      }),
    ).toContain("after 6 focus passes or about 45s of worker runtime.");
    expect(projectBoardCardClosePolicyDescription({ maxRuntimeMinutesPerCard: "0.02" })).toContain("about 1s of worker runtime.");
  });

  it("formats split project board card descriptions", () => {
    expect(
      splitProjectBoardCardDescription(
        projectBoardCard({
          title: "Parent card",
          description: " Parent description. ",
        }),
        "Child scope",
      ),
    ).toBe("Parent description.\n\nSplit from: Parent card\n\nScope: Child scope");
    expect(
      splitProjectBoardCardDescription(
        projectBoardCard({
          title: "Parent card",
          description: "   ",
        }),
        "Child scope",
      ),
    ).toBe("Split from: Parent card\n\nScope: Child scope");
  });

  it("renders project board card task descriptions with execution, proof, feedback, and UX mock sections", () => {
    const description = projectBoardCardTaskDescription(
      projectBoardCard({
        description: " Build the shell. ",
        blockedBy: ["card-data-model"],
        acceptanceCriteria: ["Canvas renders."],
        testPlan: { unit: ["unit test"], integration: [], visual: ["screenshot"], manual: ["PM review"] },
        executionSessionPolicy: "fresh_context",
        uiMockRole: "mock_gate",
        requiresUiMockApproval: true,
        runFeedback: [
          {
            id: "feedback-1",
            source: "decision_impact",
            feedback: "Use the approved renderer.",
            decisionQuestion: "Which renderer?",
            decisionAnswer: "React",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
      { maxPassesPerCard: 2, maxRuntimeMsPerCard: 45_000 },
    );

    expect(description).toContain("Build the shell.");
    expect(description).toContain("Start from a fresh Pi context for each prepared run of this card.");
    expect(description).toContain("after 2 focus passes or about 45s of worker runtime.");
    expect(description).toContain("UX mock approval artifact requirements:");
    expect(description).toContain("Acceptance criteria:\n- Canvas renders.");
    expect(description).toContain("Dependencies / blockers:\n- card-data-model");
    expect(description).toContain("decision impact (Which renderer? -> React): Use the approved renderer.");
    expect(description).toContain("Proof expectations:");
    expect(description).toContain("- Visual: screenshot");
    expect(description).toContain("Visual proof artifact requirements:");
  });

  it("renders project board dependency execution context for available and pending blockers", () => {
    const description = renderProjectBoardCardDependencyExecutionContext({
      available: [
        {
          ref: "card-data-model",
          title: "Create shared data model",
          cardStatus: "done",
          taskIdentifier: "LOCAL-1",
          taskState: "done",
          latestRunId: "run-1",
          latestRunStatus: "completed",
          workspacePath: "/workspace/dependency",
          branchName: "ambient/LOCAL-1",
          proofSummary: "Data model complete.",
          changedFiles: ["model.mjs"],
          commands: ["node --test model.test.mjs"],
          manualChecks: ["Clean import smoke passed."],
          completed: ["model.mjs exports parseBoard."],
        },
      ],
      pending: ["card-renderer"],
    });

    expect(description).toContain("Dependency execution context:");
    expect(description).toContain(
      "LOCAL-1: Create shared data model (card done, task done, latest run completed); blocker ref: card-data-model",
    );
    expect(description).toContain("Dependency run: run-1");
    expect(description).toContain("Read-only fallback dependency workspace: /workspace/dependency");
    expect(description).toContain("Dependency branch: ambient/LOCAL-1");
    expect(description).toContain("Declared import files: model.mjs");
    expect(description).toContain("Proof commands: node --test model.test.mjs");
    expect(description).toContain("Manual checks: Clean import smoke passed.");
    expect(description).toContain("Completed items: model.mjs exports parseBoard.");
    expect(description).toContain("Proof summary: Data model complete.");
    expect(description).toContain("Still-blocking or unresolved dependencies:\n- card-renderer");
  });

  it("maps project board dependency artifact paths and keys", () => {
    expect(projectBoardResolveInside("/workspace/project", "dist/output.txt")).toBe("/workspace/project/dist/output.txt");
    expect(projectBoardResolveInside("/workspace/project", "dist/../proof/output.txt")).toBe("/workspace/project/proof/output.txt");
    expect(() => projectBoardResolveInside("/workspace/project", "")).toThrow("Deliverable path must be workspace-relative");
    expect(() => projectBoardResolveInside("/workspace/project", "/tmp/output.txt")).toThrow("Deliverable path must be workspace-relative");
    expect(() => projectBoardResolveInside("/workspace/project", "../output.txt")).toThrow("Deliverable path escapes its root");
    expect(
      projectBoardDependencyArtifactKey(
        {
          ref: "card-1",
          title: "Create dependency model",
          taskIdentifier: "Task 01",
          taskId: "task-1",
          changedFiles: [],
          commands: [],
          manualChecks: [],
          completed: [],
        },
        "run-1",
      ),
    ).toBe("Task-01-6394206e2b3b");
    expect(
      projectBoardDependencyArtifactKey(
        {
          ref: "dep/ref",
          title: "!!!",
          changedFiles: [],
          commands: [],
          manualChecks: [],
          completed: [],
        },
        "run-1",
      ),
    ).toBe("dependency-94ed32431c4c");
  });

  it("formats project board dependency artifact prompt sections", () => {
    expect(projectBoardDependencyArtifactPromptSection()).toBe("");
    expect(
      projectBoardDependencyArtifactPromptSection({
        kind: "project_board_dependency_artifact_import_result",
        version: 1,
        boardId: "board-1",
        dependentCardId: "card-dependent",
        dependentTaskId: "task-dependent",
        workspacePath: "/workspace/dependent",
        artifactRoot: "/workspace/dependent/.ambient/dependency-artifacts",
        manifestPath: "/workspace/dependent/.ambient/dependency-artifacts/manifest.json",
        importedAt: "2026-01-01T00:00:00.000Z",
        imports: [
          {
            kind: "project_board_dependency_artifact_import",
            version: 1,
            key: "LOCAL-1-abcd1234",
            boardId: "board-1",
            dependentCardId: "card-dependent",
            dependentTaskId: "task-dependent",
            dependencyRef: "card-model",
            dependencyTitle: "Create data model",
            dependencyCardId: "card-model",
            dependencyTaskId: "task-model",
            dependencyTaskIdentifier: "LOCAL-1",
            dependencyRunId: "run-model",
            sourceWorkspacePath: "/workspace/model",
            importPath: "/workspace/dependent/.ambient/dependency-artifacts/LOCAL-1-abcd1234",
            filesRoot: "/workspace/dependent/.ambient/dependency-artifacts/LOCAL-1-abcd1234/files",
            manifestPath: "/workspace/dependent/.ambient/dependency-artifacts/LOCAL-1-abcd1234/manifest.json",
            declaredMaterialFiles: [],
            materialFiles: Array.from({ length: 13 }, (_, index) => `file-${index + 1}.txt`),
            skippedFiles: Array.from({ length: 9 }, (_, index) => `missing-${index + 1}.txt`),
            excludedFiles: [],
            changedFiles: [],
            commands: Array.from({ length: 6 }, (_, index) => `command-${index + 1}`),
            manualChecks: [],
            completed: [],
            proofSummary: "Data model exported parseBoard.",
            importedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        pending: Array.from({ length: 9 }, (_, index) => `pending-${index + 1}`),
      }),
    ).toBe(
      [
        "Dependency artifact imports:",
        "- Ambient has staged available dependency artifacts into this run workspace. Prefer these imported files over copying from sibling task workspaces.",
        "- Artifact root: /workspace/dependent/.ambient/dependency-artifacts",
        "- Import manifest: /workspace/dependent/.ambient/dependency-artifacts/manifest.json",
        "Available imported dependency bundles:",
        "- LOCAL-1: Create data model; blocker ref: card-model",
        "  - Files root: /workspace/dependent/.ambient/dependency-artifacts/LOCAL-1-abcd1234/files",
        "  - Bundle manifest: /workspace/dependent/.ambient/dependency-artifacts/LOCAL-1-abcd1234/manifest.json",
        "  - Imported material files: file-1.txt, file-2.txt, file-3.txt, file-4.txt, file-5.txt, file-6.txt, file-7.txt, file-8.txt, file-9.txt, file-10.txt, file-11.txt, file-12.txt",
        "  - Missing or skipped files: missing-1.txt, missing-2.txt, missing-3.txt, missing-4.txt, missing-5.txt, missing-6.txt, missing-7.txt, missing-8.txt",
        "  - Source proof commands: command-1 | command-2 | command-3 | command-4 | command-5",
        "  - Source proof summary: Data model exported parseBoard.",
        "Pending dependency artifact imports:",
        "- pending-1",
        "- pending-2",
        "- pending-3",
        "- pending-4",
        "- pending-5",
        "- pending-6",
        "- pending-7",
        "- pending-8",
      ].join("\n"),
    );
  });

  it("normalizes project board card run feedback conservatively", () => {
    expect(normalizeProjectBoardCardRunFeedbackSource("source_impact")).toBe("source_impact");
    expect(normalizeProjectBoardCardRunFeedbackSource("unsupported")).toBe("manual");

    expect(
      normalizeProjectBoardCardRunFeedback([
        {
          id: " feedback-1 ",
          feedback: "  Review the next run evidence.  ",
          source: "source_impact",
          decisionQuestion: " Which source changed? ",
          decisionAnswer: " README.md ",
          sourceImpactEventId: " event-1 ",
          sourceImpactEventIds: [" event-1 ", "event-2", "event-1", ""],
          sourceIds: [" source-1 ", "source-2", "source-1", ""],
          createdAt: " 2026-01-01T00:00:00.000Z ",
          createdBy: " ambient-desktop ",
        },
        {
          id: "feedback-1",
          feedback: "Duplicate id should be ignored.",
          source: "manual",
          createdAt: "2026-01-01T00:01:00.000Z",
        },
        {
          id: "blank",
          feedback: "   ",
          source: "manual",
          createdAt: "2026-01-01T00:02:00.000Z",
        },
        {
          id: "feedback-2",
          feedback: "Unsupported source falls back.",
          source: "unsupported",
          createdAt: "2026-01-01T00:03:00.000Z",
        },
      ] as never),
    ).toEqual([
      {
        id: "feedback-1",
        feedback: "Review the next run evidence.",
        source: "source_impact",
        decisionQuestion: "Which source changed?",
        decisionAnswer: "README.md",
        sourceImpactEventId: "event-1",
        sourceImpactEventIds: ["event-1", "event-2"],
        sourceIds: ["source-1", "source-2"],
        createdAt: "2026-01-01T00:00:00.000Z",
        createdBy: "ambient-desktop",
      },
      {
        id: "feedback-2",
        feedback: "Unsupported source falls back.",
        source: "manual",
        decisionQuestion: undefined,
        decisionAnswer: undefined,
        sourceImpactEventId: undefined,
        createdAt: "2026-01-01T00:03:00.000Z",
        createdBy: undefined,
      },
    ]);

    expect(
      normalizeProjectBoardCardRunFeedback(undefined, [
        {
          id: "fallback",
          feedback: "Fallback feedback.",
          source: "manual",
          createdAt: "2026-01-01T00:04:00.000Z",
        },
      ]),
    ).toEqual([
      {
        id: "fallback",
        feedback: "Fallback feedback.",
        source: "manual",
        decisionQuestion: undefined,
        decisionAnswer: undefined,
        sourceImpactEventId: undefined,
        createdAt: "2026-01-01T00:04:00.000Z",
        createdBy: undefined,
      },
    ]);
  });

  it("keeps the newest run feedback entries when a card exceeds the 20-entry cap", () => {
    const entries = Array.from({ length: 25 }, (_, index) => ({
      id: `feedback-${index + 1}`,
      feedback: `Run feedback entry ${index + 1}.`,
      source: "manual" as const,
      createdAt: `2026-01-01T00:${String(index).padStart(2, "0")}:00.000Z`,
    }));

    const normalized = normalizeProjectBoardCardRunFeedback(entries as never);

    expect(normalized).toHaveLength(20);
    // Appends go to the end of the list, so the newest entry must survive the cap.
    expect(normalized[0].id).toBe("feedback-6");
    expect(normalized.at(-1)?.id).toBe("feedback-25");
  });

  it("parses project board card run feedback from JSON", () => {
    expect(
      parseProjectBoardCardRunFeedback(
        JSON.stringify([
          {
            id: "feedback-1",
            feedback: "Follow up on coverage.",
            source: "proof_review",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          { feedback: "Missing source.", createdAt: "2026-01-01T00:01:00.000Z" },
        ]),
      ),
    ).toEqual([
      {
        id: "feedback-1",
        feedback: "Follow up on coverage.",
        source: "proof_review",
        decisionQuestion: undefined,
        decisionAnswer: undefined,
        sourceImpactEventId: undefined,
        createdAt: "2026-01-01T00:00:00.000Z",
        createdBy: undefined,
      },
    ]);
    expect(parseProjectBoardCardRunFeedback("{}")).toEqual([]);
    expect(parseProjectBoardCardRunFeedback("not json")).toEqual([]);
    expect(parseProjectBoardCardRunFeedback(null)).toEqual([]);
  });

  it("normalizes project board objective provenance conservatively", () => {
    expect(
      normalizeProjectBoardObjectiveProvenance({
        objective: "  Ship the checkout flow  ",
        groundingMode: "selected_sources",
        selectedSourceIds: ["source-1", 7, "source-2", "source-1"],
        sourceRefCount: 2.6,
        sourceGap: "  Missing mobile copy source.  ",
      }),
    ).toEqual({
      objective: "Ship the checkout flow",
      groundingMode: "selected_sources",
      selectedSourceIds: ["source-1", "source-2"],
      sourceRefCount: 3,
      weakGrounding: false,
      sourceGap: "Missing mobile copy source.",
    });
    expect(
      normalizeProjectBoardObjectiveProvenance({
        objective: "Fallback grounding",
        groundingMode: "unsupported",
      }),
    ).toMatchObject({
      groundingMode: "objective_only",
      selectedSourceIds: [],
      sourceRefCount: 0,
      weakGrounding: true,
    });
    expect(normalizeProjectBoardObjectiveProvenance({ objective: "   " })).toBeUndefined();
    expect(normalizeProjectBoardObjectiveProvenance(null)).toBeUndefined();
  });

  it("serializes project board objective provenance JSON only when normalized", () => {
    expect(
      JSON.parse(
        objectiveProvenanceJson({
          objective: "  Ship the checkout flow  ",
          groundingMode: "selected_sources",
          selectedSourceIds: ["source-1", "source-1", "source-2"],
          sourceRefCount: 1.4,
        }) ?? "",
      ),
    ).toEqual({
      objective: "Ship the checkout flow",
      groundingMode: "selected_sources",
      selectedSourceIds: ["source-1", "source-2"],
      sourceRefCount: 1,
      weakGrounding: false,
    });
    expect(objectiveProvenanceJson({ objective: "   " })).toBeNull();
  });

  it("maps imported project board execution artifact identity and timing", () => {
    const manifest = runManifestArtifact({ cardId: "card-from-manifest", status: "blocked" });
    const proof = runProofArtifact({ cardId: "card-from-proof" });
    const handoff = runHandoffArtifact({ cardId: "card-from-handoff" });

    expect(projectBoardExecutionArtifactStatus(manifest, proof, handoff)).toBe("blocked");
    expect(projectBoardExecutionArtifactStatus(undefined, proof, handoff)).toBe("completed");
    expect(projectBoardExecutionArtifactStatus(undefined, proof)).toBe("review");
    expect(projectBoardExecutionArtifactStatus()).toBe("prepared");

    expect(projectBoardExecutionArtifactCardId(manifest, proof, handoff)).toBe("card-from-manifest");
    expect(projectBoardExecutionArtifactCardId(undefined, proof, handoff)).toBe("card-from-proof");
    expect(projectBoardExecutionArtifactCardId(undefined, undefined, handoff)).toBe("card-from-handoff");
    expect(projectBoardExecutionArtifactCardId()).toBeUndefined();

    expect(projectBoardExecutionArtifactStartedAt(manifest, proof, handoff)).toBe("2026-01-01T00:00:00.000Z");
    expect(projectBoardExecutionArtifactStartedAt(undefined, proof, handoff)).toBe("2026-01-01T00:02:00.000Z");
    expect(projectBoardExecutionArtifactStartedAt(undefined, undefined, handoff)).toBe("2026-01-01T00:03:00.000Z");

    expect(projectBoardExecutionArtifactUpdatedAt(manifest, proof, handoff)).toBe("2026-01-01T00:01:00.000Z");
    expect(projectBoardExecutionArtifactUpdatedAt(undefined, proof, handoff)).toBe("2026-01-01T00:03:00.000Z");
    expect(projectBoardExecutionArtifactUpdatedAt(undefined, proof)).toBe("2026-01-01T00:02:00.000Z");
  });

  it("maps imported project board execution proof and handoff artifact payloads", () => {
    expect(projectBoardExecutionArtifactProofFromArtifact(runProofArtifact())).toEqual({
      summary: "Proof summary",
      commands: ["pnpm test"],
      changedFiles: ["src/main/example.ts"],
      screenshots: ["screenshots/proof.png"],
      browserTraces: ["traces/proof.zip"],
      visualChecks: [{ name: "canvas", status: "passed" }],
      manualChecks: ["Reviewed proof"],
      createdAt: "2026-01-01T00:02:00.000Z",
    });
    expect(projectBoardExecutionArtifactHandoffFromArtifact(runHandoffArtifact())).toEqual({
      summary: "Handoff summary",
      completed: ["Done"],
      remaining: ["Later"],
      risks: ["Risk"],
      followUps: [{ title: "Follow up", reason: "Needs polish", blockedBy: ["card-manifest"] }],
      createdAt: "2026-01-01T00:03:00.000Z",
    });
  });

  it("maps imported project board proposal run manifest stages", () => {
    expect(projectBoardRunStageFromManifest({ status: "failed", stage: "source_scan" } as ProposalManifestArtifact)).toBe("failed");
    expect(projectBoardRunStageFromManifest({ status: "abandoned", stage: "planning" } as ProposalManifestArtifact)).toBe("paused");
    expect(projectBoardRunStageFromManifest({ status: "paused", stage: "source_scan" } as ProposalManifestArtifact)).toBe("paused");
    expect(projectBoardRunStageFromManifest({ status: "succeeded", stage: "source_scan" } as ProposalManifestArtifact)).toBe("source_scan");
    expect(projectBoardRunStageFromManifest({ status: "succeeded", stage: "source_classification" } as ProposalManifestArtifact)).toBe(
      "source_classification",
    );
    expect(projectBoardRunStageFromManifest({ status: "succeeded", stage: "importing" } as ProposalManifestArtifact)).toBe(
      "schema_validation",
    );
    expect(projectBoardRunStageFromManifest({ status: "succeeded", stage: "completed" } as ProposalManifestArtifact)).toBe(
      "proposal_created",
    );
    expect(projectBoardRunStageFromManifest({ status: "succeeded", stage: "planning" } as ProposalManifestArtifact)).toBe("model_request");
  });

  it("maps imported project board progress stages", () => {
    expect(projectBoardRunStageFromArtifactProgress(" source_scan ")).toBe("source_scan");
    expect(projectBoardRunStageFromArtifactProgress("sources_persisted")).toBe("sources_persisted");
    expect(projectBoardRunStageFromArtifactProgress("source_classification")).toBe("source_classification");
    expect(projectBoardRunStageFromArtifactProgress("deterministic_baseline")).toBe("deterministic_baseline");
    expect(projectBoardRunStageFromArtifactProgress("model_request")).toBe("model_request");
    expect(projectBoardRunStageFromArtifactProgress("model_response")).toBe("model_response");
    expect(projectBoardRunStageFromArtifactProgress("importing")).toBe("schema_validation");
    expect(projectBoardRunStageFromArtifactProgress("board_applied")).toBe("board_applied");
    expect(projectBoardRunStageFromArtifactProgress("completed")).toBe("proposal_created");
    expect(projectBoardRunStageFromArtifactProgress("planning_paused")).toBe("paused");
    expect(projectBoardRunStageFromArtifactProgress("failed")).toBe("failed");
    expect(projectBoardRunStageFromArtifactProgress("unknown-stage")).toBe("model_response");
  });

  it("maps imported project board proposal run manifest statuses", () => {
    expect(projectBoardRunStatusFromProposalManifest({ status: "abandoned" } as ProposalManifestArtifact)).toBe("abandoned");
    expect(projectBoardRunStatusFromProposalManifest({ status: "pause_requested" } as ProposalManifestArtifact)).toBe("pause_requested");
    expect(projectBoardRunStatusFromProposalManifest({ status: "paused" } as ProposalManifestArtifact)).toBe("paused");
    expect(projectBoardRunStatusFromProposalManifest({ status: "failed" } as ProposalManifestArtifact)).toBe("failed");
    expect(projectBoardRunStatusFromProposalManifest({ status: "running" } as ProposalManifestArtifact)).toBe("running");
    expect(projectBoardRunStatusFromProposalManifest({ status: "succeeded" } as ProposalManifestArtifact)).toBe("succeeded");
  });

  it("normalizes project board synthesis proposal answers conservatively", () => {
    const fallbackAnsweredAt = "2026-01-01T00:00:00.000Z";
    expect(
      normalizeProjectBoardSynthesisProposalAnswer(
        {
          questionIndex: 1,
          question: "Which renderer should the shell use?",
          answer: "Use the existing React renderer.",
          answeredAt: "2026-01-01T00:01:00.000Z",
        },
        fallbackAnsweredAt,
      ),
    ).toEqual([
      {
        questionIndex: 1,
        question: "Which renderer should the shell use?",
        answer: "Use the existing React renderer.",
        answeredAt: "2026-01-01T00:01:00.000Z",
      },
    ]);
    expect(
      normalizeProjectBoardSynthesisProposalAnswer(
        {
          questionIndex: 0,
          answer: "Use the default.",
        },
        fallbackAnsweredAt,
      ),
    ).toEqual([{ questionIndex: 0, question: "", answer: "Use the default.", answeredAt: fallbackAnsweredAt }]);
    expect(normalizeProjectBoardSynthesisProposalAnswer({ questionIndex: -1, answer: "Nope" }, fallbackAnsweredAt)).toEqual([]);
    expect(normalizeProjectBoardSynthesisProposalAnswer({ questionIndex: 1.5, answer: "Nope" }, fallbackAnsweredAt)).toEqual([]);
    expect(normalizeProjectBoardSynthesisProposalAnswer({ questionIndex: 1, answer: "   " }, fallbackAnsweredAt)).toEqual([]);
    expect(normalizeProjectBoardSynthesisProposalAnswer(null, fallbackAnsweredAt)).toEqual([]);
  });

  it("normalizes project board synthesis proposal cards conservatively", () => {
    expect(
      normalizeProjectBoardSynthesisProposalCard({
        sourceId: "synthesis:shell",
        title: "Create shell",
        description: "Build the first shell.",
        candidateStatus: "ready_to_create",
        priority: 2,
        phase: "Foundation",
        labels: ["webgl", 7, "shell"],
        blockedBy: ["synthesis:setup", null],
        acceptanceCriteria: ["Canvas renders.", 42],
        testPlan: { unit: [" test helper ", "test helper"], integration: [], visual: [" screenshot "], manual: [] },
        sourceRefs: ["docs/architecture.md", false],
        clarificationQuestions: ["Renderer choice?", undefined],
        clarificationSuggestions: [
          {
            question: " Renderer choice? ",
            suggestedAnswer: " Use the existing renderer. ",
            rationale: " Keeps scope small. ",
            confidence: "medium",
            safeToAccept: true,
            questionKind: "expert_default",
          },
        ],
        objectiveProvenance: {
          objective: "  Ship the render shell.  ",
          groundingMode: "source_scan",
          sourceRefCount: 1,
        },
        uiMockRole: "mock_gate",
        requiresUiMockApproval: true,
        reviewStatus: "accepted",
        reviewReason: "Reviewed.",
        mergeTargetCardId: "card-1",
        reviewedAt: "2026-01-01T00:01:00.000Z",
      } as never),
    ).toEqual({
      sourceId: "synthesis:shell",
      title: "Create shell",
      description: "Build the first shell.",
      candidateStatus: "ready_to_create",
      priority: 2,
      phase: "Foundation",
      labels: ["webgl", "shell"],
      blockedBy: ["synthesis:setup"],
      acceptanceCriteria: ["Canvas renders."],
      testPlan: { unit: ["test helper"], integration: [], visual: ["screenshot"], manual: [] },
      sourceRefs: ["docs/architecture.md"],
      clarificationQuestions: ["Renderer choice?"],
      clarificationSuggestions: [
        {
          question: "Renderer choice?",
          suggestedAnswer: "Use the existing renderer.",
          rationale: "Keeps scope small.",
          confidence: "medium",
          safeToAccept: true,
          questionKind: "expert_default",
        },
      ],
      objectiveProvenance: {
        objective: "Ship the render shell.",
        groundingMode: "source_scan",
        selectedSourceIds: [],
        sourceRefCount: 1,
        weakGrounding: false,
      },
      uiMockRole: "mock_gate",
      requiresUiMockApproval: true,
      reviewStatus: "accepted",
      reviewReason: "Reviewed.",
      mergeTargetCardId: "card-1",
      reviewedAt: "2026-01-01T00:01:00.000Z",
    });

    expect(
      normalizeProjectBoardSynthesisProposalCard({
        reviewStatus: "unsupported",
        reviewReason: "   ",
        mergeTargetCardId: "   ",
        reviewedAt: "   ",
      } as never),
    ).toEqual({
      sourceId: "",
      title: "",
      description: "",
      candidateStatus: "needs_clarification",
      priority: undefined,
      phase: undefined,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceRefs: [],
      clarificationQuestions: [],
      clarificationSuggestions: [],
      objectiveProvenance: undefined,
      uiMockRole: undefined,
      requiresUiMockApproval: false,
      reviewStatus: "pending",
      reviewReason: undefined,
      mergeTargetCardId: undefined,
      reviewedAt: undefined,
    });
  });

  it("maps project board synthesis proposal card review statuses", () => {
    expect(projectBoardSynthesisProposalCardReviewStatus("accepted")).toBe("accepted");
    expect(projectBoardSynthesisProposalCardReviewStatus("merged")).toBe("merged");
    expect(projectBoardSynthesisProposalCardReviewStatus("unsupported")).toBeUndefined();
    expect(projectBoardSynthesisProposalCardReviewStatus(undefined)).toBeUndefined();
  });

  it("detects project board run statuses that can copy sessions", () => {
    expect(projectBoardRunStatusCanCopySession("completed")).toBe(true);
    expect(projectBoardRunStatusCanCopySession("failed")).toBe(true);
    expect(projectBoardRunStatusCanCopySession("canceled")).toBe(true);
    expect(projectBoardRunStatusCanCopySession("stalled")).toBe(true);
    expect(projectBoardRunStatusCanCopySession("running")).toBe(false);
    expect(projectBoardRunStatusCanCopySession("paused")).toBe(false);
  });

  it("keeps project board synthesis proposal reviews only while card content still matches", () => {
    const accepted = {
      sourceId: "synthesis:shell",
      title: "Create shell",
      description: "Build the first shell.",
      candidateStatus: "ready_to_create" as const,
      priority: 2,
      phase: "Foundation",
      labels: ["webgl", "shell"],
      blockedBy: ["synthesis:setup"],
      acceptanceCriteria: ["Canvas renders."],
      testPlan: { unit: ["unit test"], integration: ["integration test"], visual: ["screenshot"], manual: ["review"] },
      sourceRefs: ["docs/architecture.md"],
      clarificationQuestions: ["Renderer choice?"],
      clarificationSuggestions: [
        {
          question: "Renderer choice?",
          suggestedAnswer: "Use the existing renderer.",
          rationale: "Keeps scope small.",
          confidence: "medium" as const,
          safeToAccept: true,
          questionKind: "expert_default" as const,
        },
      ],
      objectiveProvenance: {
        objective: "Ship the render shell.",
        groundingMode: "source_scan" as const,
        selectedSourceIds: [],
        sourceRefCount: 1,
        weakGrounding: false,
      },
      uiMockRole: "mock_gate" as const,
      requiresUiMockApproval: true,
      reviewStatus: "accepted" as const,
      reviewReason: "Reviewed.",
      reviewedAt: "2026-01-01T00:01:00.000Z",
    };

    expect(projectBoardSynthesisProposalCardReviewStillApplies(accepted, { ...accepted, reviewStatus: "pending" })).toBe(true);
    expect(projectBoardSynthesisProposalCardReviewStillApplies({ ...accepted, reviewStatus: "pending" }, accepted)).toBe(false);
    expect(projectBoardSynthesisProposalCardReviewStillApplies(accepted, { ...accepted, labels: ["shell", "webgl"] })).toBe(false);
    expect(
      projectBoardSynthesisProposalCardReviewStillApplies(accepted, { ...accepted, testPlan: { ...accepted.testPlan, visual: [] } }),
    ).toBe(false);
    expect(
      projectBoardSynthesisProposalCardReviewStillApplies(accepted, {
        ...accepted,
        objectiveProvenance: { ...accepted.objectiveProvenance, sourceRefCount: 2 },
      }),
    ).toBe(false);
  });

  it("maps project board synthesis draft cards into pending proposal cards", () => {
    const cards = projectBoardSynthesisProposalCardsFromDraft({
      summary: "Build the shell.",
      goal: "Ship it.",
      currentState: "Nothing exists.",
      targetUser: "Operators",
      qualityBar: "Works end to end.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "   ",
          title: "Skipped",
          description: "Blank source id.",
          candidateStatus: "ready_to_create",
          labels: [],
          blockedBy: [],
          acceptanceCriteria: [],
          testPlan: { unit: [], integration: [], visual: [], manual: [] },
          sourceRefs: [],
        },
        {
          sourceId: "synthesis:blank-title",
          title: "  ",
          description: "Blank title.",
          candidateStatus: "ready_to_create",
          labels: [],
          blockedBy: [],
          acceptanceCriteria: [],
          testPlan: { unit: [], integration: [], visual: [], manual: [] },
          sourceRefs: [],
        },
        {
          sourceId: " synthesis:shell ",
          title: " Create shell ",
          description: " Build the first shell. ",
          candidateStatus: "ready_to_create",
          priority: 1.6,
          phase: " Foundation ",
          labels: [" shell ", "shell", "webgl"],
          blockedBy: [" synthesis:setup ", "synthesis:setup"],
          acceptanceCriteria: [" Canvas renders. ", "Canvas renders."],
          testPlan: { unit: [" unit test "], integration: [], visual: [" screenshot "], manual: [] },
          sourceRefs: [" docs/architecture.md "],
          clarificationQuestions: [" Renderer choice? "],
          clarificationSuggestions: [
            {
              question: " Renderer choice? ",
              suggestedAnswer: " Use the existing renderer. ",
              rationale: " Keeps scope small. ",
              confidence: "medium",
              safeToAccept: true,
              questionKind: "expert_default",
            },
          ],
          objectiveProvenance: {
            objective: " Build the shell. ",
            groundingMode: "source_scan",
            selectedSourceIds: [],
            sourceRefCount: 1,
            weakGrounding: false,
          },
          uiMockRole: "mock_gate",
          requiresUiMockApproval: true,
        },
      ],
    });

    expect(cards).toEqual([
      {
        sourceId: "synthesis:shell",
        title: "Create shell",
        description: "Build the first shell.",
        candidateStatus: "ready_to_create",
        priority: 2,
        phase: "Foundation",
        labels: ["shell", "webgl"],
        blockedBy: ["synthesis:setup"],
        acceptanceCriteria: ["Canvas renders."],
        testPlan: { unit: ["unit test"], integration: [], visual: ["screenshot"], manual: [] },
        sourceRefs: ["docs/architecture.md"],
        clarificationQuestions: ["Renderer choice?"],
        clarificationSuggestions: [
          {
            question: "Renderer choice?",
            suggestedAnswer: "Use the existing renderer.",
            rationale: "Keeps scope small.",
            confidence: "medium",
            safeToAccept: true,
            questionKind: "expert_default",
          },
        ],
        objectiveProvenance: {
          objective: "Build the shell.",
          groundingMode: "source_scan",
          selectedSourceIds: [],
          sourceRefCount: 1,
          weakGrounding: false,
        },
        uiMockRole: "mock_gate",
        requiresUiMockApproval: true,
        reviewStatus: "pending",
      },
    ]);
  });

  it("preserves project board synthesis proposal card reviews when draft content still matches", () => {
    const draft = {
      summary: "Build the shell.",
      goal: "Ship it.",
      currentState: "Nothing exists.",
      targetUser: "Operators",
      qualityBar: "Works end to end.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "synthesis:shell",
          title: "Create shell",
          description: "Build the first shell.",
          candidateStatus: "ready_to_create" as const,
          priority: 2,
          phase: "Foundation",
          labels: ["shell"],
          blockedBy: [],
          acceptanceCriteria: ["Canvas renders."],
          testPlan: { unit: ["unit test"], integration: [], visual: [], manual: [] },
          sourceRefs: ["docs/architecture.md"],
        },
      ],
    };
    const [existing] = projectBoardSynthesisProposalCardsFromDraft(draft);
    const reviewed = {
      ...existing,
      reviewStatus: "accepted" as const,
      reviewReason: "Looks good.",
      mergeTargetCardId: "card-existing",
      reviewedAt: "2026-01-01T00:01:00.000Z",
    };

    expect(projectBoardSynthesisProposalCardsFromDraft(draft, [reviewed])[0]).toEqual(reviewed);
  });

  it("resets project board synthesis proposal card reviews when draft content changes", () => {
    const draft = {
      summary: "Build the shell.",
      goal: "Ship it.",
      currentState: "Nothing exists.",
      targetUser: "Operators",
      qualityBar: "Works end to end.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "synthesis:shell",
          title: "Create shell",
          description: "Build the first shell.",
          candidateStatus: "ready_to_create" as const,
          priority: 2,
          phase: "Foundation",
          labels: ["shell"],
          blockedBy: [],
          acceptanceCriteria: ["Canvas renders."],
          testPlan: { unit: ["unit test"], integration: [], visual: [], manual: [] },
          sourceRefs: ["docs/architecture.md"],
        },
      ],
    };
    const [existing] = projectBoardSynthesisProposalCardsFromDraft(draft);
    const reviewed = { ...existing, reviewStatus: "accepted" as const, reviewedAt: "2026-01-01T00:01:00.000Z" };
    const changedDraft = { ...draft, cards: [{ ...draft.cards[0], labels: ["shell", "changed"] }] };

    const [next] = projectBoardSynthesisProposalCardsFromDraft(changedDraft, [reviewed]);

    expect(next).toMatchObject({
      sourceId: "synthesis:shell",
      labels: ["shell", "changed"],
      reviewStatus: "pending",
    });
    expect(next.reviewedAt).toBeUndefined();
  });
});
