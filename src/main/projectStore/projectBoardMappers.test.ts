import { describe, expect, it } from "vitest";
import type { ProjectBoardDecisionImpactPreview } from "../../shared/projectBoardDecisionImpact";
import type { ProposalManifestArtifact } from "./projectStoreProjectBoardFacade";
import { defaultProjectBoardClaimAgentId } from "./projectStoreProjectBoardFacade";
import type { OrchestrationRun } from "../../shared/workflowTypes";
import type {
  ProjectBoardCard,
  ProjectBoardCardClarificationAnswer,
  ProjectBoardCardProofReview,
  ProjectBoardEvent,
} from "../../shared/projectBoardTypes";
import {
  firstMeaningfulLine,
  normalizeCardTextList,
  objectiveProvenanceJson,
  projectBoardCardPendingPiUpdateFromSynthesisCard,
  normalizeProjectBoardCardRunFeedback,
  normalizeProjectBoardCardRunFeedbackSource,
  normalizeProjectBoardCardExecutionSessionPolicy,
  normalizeProjectBoardCardTestPlan,
  normalizeProjectBoardClarificationAnswers,
  normalizeProjectBoardClarificationDecisions,
  normalizeProjectBoardClarificationQuestions,
  normalizeProjectBoardClarificationSuggestions,
  normalizeProjectBoardObjectiveProvenance,
  normalizeProjectBoardProofFollowUpSuggestion,
  normalizeProjectBoardSynthesisClarificationFields,
  normalizeProjectBoardSynthesisProposalAnswer,
  normalizeProjectBoardSynthesisProposalCard,
  projectBoardSynthesisProposalCardsFromDraft,
  normalizeRunFollowUps,
  normalizeProjectBoardUiMockRole,
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
  parseProjectBoardClarificationSuggestions,
  parseProjectBoardClarificationAnswers,
  parseProjectBoardClarificationDecisions,
  parseProjectBoardCardRunFeedback,
  projectBoardCardClosePolicyDescription,
  projectBoardCardTaskDescription,
  projectBoardCardBlockedByOpenUxMockGate,
  projectBoardCardIsUxMockGate,
  projectBoardCardMatchesRef,
  projectBoardCardMissingRequiredUxMockGate,
  projectBoardCardProofCount,
  projectBoardCardStatusWithProofReview,
  projectBoardCandidateStatusForSynthesisUpdate,
  projectBoardClarificationAnswerSection,
  projectBoardClarificationDecisionsEquivalent,
  projectBoardClarificationDecisionImpactEventSummary,
  projectBoardDescriptionWithClarificationAnswer,
  projectBoardDependencyArtifactKey,
  projectBoardDependencyArtifactPromptSection,
  projectBoardDecisionImpactEventMetadata,
  projectBoardDecisionImpactFeedbackText,
  projectBoardExecutionArtifactCardId,
  projectBoardExecutionArtifactHandoffFromArtifact,
  projectBoardExecutionArtifactProofFromArtifact,
  projectBoardExecutionArtifactStartedAt,
  projectBoardExecutionArtifactStatus,
  projectBoardExecutionArtifactUpdatedAt,
  projectBoardChangedClarificationAnswer,
  projectBoardHasDecisionImpactFeedback,
  projectBoardMaterialPendingPiUpdateForRow,
  projectBoardHasTrustworthyTaskCompletion,
  projectBoardOpenUxMockGateBlocker,
  projectBoardHasSourceImpactFeedback,
  projectBoardQuestionMatchesAnyVariant,
  projectBoardProofFollowUpOptionsFromSuggestion,
  projectBoardProofOfWorkForRun,
  projectBoardProofRevisionRunFeedback,
  projectBoardRequiresUiMockApprovalForSynthesisCard,
  projectBoardRunStatusCanCopySession,
  projectBoardRunHasReviewableProof,
  projectBoardRunStageFromArtifactProgress,
  projectBoardRunStageFromManifest,
  projectBoardRunStatusFromProposalManifest,
  projectBoardTerminalBlockerDetail,
  projectBoardCardsWithClaimSummaries,
  projectBoardClaimBlockedTaskIdsForRows,
  projectBoardClaimSummaryFromEvents,
  projectBoardClosedParentForRunFollowUp,
  projectBoardStatusForTask,
  projectBoardSynthesisCardRowProtectedFromDraftReplacement,
  projectBoardSynthesisDraftWithSourceIdNamespace,
  projectBoardSynthesisProposalCardReviewStatus,
  projectBoardSynthesisProposalCardReviewStillApplies,
  projectBoardSynthesisStartFreshCardSnapshot,
  projectBoardResolveInside,
  projectBoardTaskStateForProofReview,
  projectBoardTestPolicyRequiresProofSpec,
  projectBoardUiMockRoleForSynthesisCard,
  projectBoardUnansweredClarificationQuestions,
  projectBoardUxMockGateSatisfied,
  projectBoardUxMockRejectionRunFeedback,
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
  projectBoardCardPendingPiUpdateRow,
  projectBoardCardRow,
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

  it("maps project board claim summaries from persisted events", () => {
    const localAgentId = defaultProjectBoardClaimAgentId();
    const claimEvent = (input: {
      id: string;
      kind: ProjectBoardEvent["kind"];
      cardId: string;
      runId: string;
      agentId: string;
      createdAt: string;
      leaseUntil?: string;
      displayName?: string;
      workspaceBranch?: string;
      baseCommit?: string;
    }): ProjectBoardEvent => ({
      id: input.id,
      boardId: "board-claims",
      kind: input.kind,
      title: "Claim event",
      summary: "Claim event summary",
      entityKind: "project_board_card",
      entityId: input.cardId,
      metadata: {
        cardId: input.cardId,
        runId: input.runId,
        agentId: input.agentId,
        ...(input.leaseUntil ? { leaseUntil: input.leaseUntil } : {}),
        ...(input.displayName ? { displayName: input.displayName } : {}),
        ...(input.workspaceBranch ? { workspaceBranch: input.workspaceBranch } : {}),
        ...(input.baseCommit ? { baseCommit: input.baseCommit } : {}),
      },
      createdAt: input.createdAt,
    });

    const summary = projectBoardClaimSummaryFromEvents([
      claimEvent({
        id: "event-active",
        kind: "card_claimed",
        cardId: "card-active",
        runId: "run-active",
        agentId: localAgentId,
        createdAt: "2026-01-01T00:00:00.000Z",
        leaseUntil: "2099-01-01T00:15:00.000Z",
        displayName: "Local Ambient",
        workspaceBranch: "codex/card-active",
        baseCommit: "abc1234",
      }),
      claimEvent({
        id: "event-expired-claim",
        kind: "card_claimed",
        cardId: "card-expired",
        runId: "run-expired",
        agentId: "remote-agent",
        createdAt: "2026-01-01T00:01:00.000Z",
        leaseUntil: "2099-01-01T00:16:00.000Z",
      }),
      claimEvent({
        id: "event-expired-recorded",
        kind: "card_claim_expired",
        cardId: "card-expired",
        runId: "run-expired",
        agentId: "remote-agent",
        createdAt: "2026-01-01T00:02:00.000Z",
      }),
      claimEvent({
        id: "event-conflict-owner",
        kind: "card_claimed",
        cardId: "card-conflict",
        runId: "run-owner",
        agentId: localAgentId,
        createdAt: "2026-01-01T00:03:00.000Z",
        leaseUntil: "2099-01-01T00:18:00.000Z",
      }),
      claimEvent({
        id: "event-conflict",
        kind: "card_claimed",
        cardId: "card-conflict",
        runId: "run-conflict",
        agentId: "remote-agent",
        createdAt: "2026-01-01T00:04:00.000Z",
        leaseUntil: "2099-01-01T00:19:00.000Z",
      }),
    ]);

    expect(summary.active.find((claim) => claim.cardId === "card-active")).toMatchObject({
      status: "active",
      cardId: "card-active",
      runId: "run-active",
      agentId: localAgentId,
      eventId: "event-active",
      claimedAt: "2026-01-01T00:00:00.000Z",
      leaseUntil: "2099-01-01T00:15:00.000Z",
      displayName: "Local Ambient",
      workspaceBranch: "codex/card-active",
      baseCommit: "abc1234",
      ownedByLocal: true,
    });
    expect(summary.expired).toEqual([
      expect.objectContaining({
        status: "expired",
        cardId: "card-expired",
        runId: "run-expired",
        eventId: "event-expired-recorded",
        expiredAt: "2026-01-01T00:02:00.000Z",
        expirationRecorded: true,
        ownedByLocal: false,
      }),
    ]);
    expect(summary.conflicts).toEqual([
      expect.objectContaining({
        status: "conflict",
        cardId: "card-conflict",
        runId: "run-conflict",
        agentId: "remote-agent",
        blockedByRunId: "run-owner",
        claimedAt: "2026-01-01T00:04:00.000Z",
        ownedByLocal: false,
      }),
    ]);
  });

  it("overlays project board card claim summaries", () => {
    const activeClaim = {
      status: "active" as const,
      cardId: "card-active",
      runId: "run-active",
      agentId: "agent-active",
      eventId: "event-active",
      claimedAt: "2026-01-01T00:00:00.000Z",
      ownedByLocal: true,
    };
    const expiredClaim = {
      status: "expired" as const,
      cardId: "card-expired",
      runId: "run-expired",
      agentId: "agent-expired",
      eventId: "event-expired",
      claimedAt: "2026-01-01T00:01:00.000Z",
      expiredAt: "2026-01-01T00:02:00.000Z",
      ownedByLocal: false,
    };
    const conflict = {
      status: "conflict" as const,
      cardId: "card-active",
      runId: "run-conflict",
      agentId: "agent-conflict",
      eventId: "event-conflict",
      claimedAt: "2026-01-01T00:03:00.000Z",
      blockedByRunId: "run-active",
      ownedByLocal: false,
    };

    const cards = projectBoardCardsWithClaimSummaries(
      [projectBoardCard({ id: "card-active" }), projectBoardCard({ id: "card-expired" }), projectBoardCard({ id: "card-empty" })],
      {
        active: [activeClaim],
        expired: [expiredClaim],
        conflicts: [conflict],
      },
    );

    expect(cards[0]).toMatchObject({ id: "card-active", claim: activeClaim, claimConflicts: [conflict] });
    expect(cards[1]).toMatchObject({ id: "card-expired", claim: expiredClaim });
    expect(cards[1].claimConflicts).toBeUndefined();
    expect(cards[2].claim).toBeUndefined();
    expect(cards[2].claimConflicts).toBeUndefined();
  });

  it("maps project board claim-blocked task ids from card rows", () => {
    const remoteActive = {
      status: "active" as const,
      cardId: "card-remote",
      runId: "run-remote",
      agentId: "remote-agent",
      eventId: "event-remote",
      claimedAt: "2026-01-01T00:00:00.000Z",
      ownedByLocal: false,
    };
    const localActive = {
      status: "active" as const,
      cardId: "card-local",
      runId: "run-local",
      agentId: "local-agent",
      eventId: "event-local",
      claimedAt: "2026-01-01T00:01:00.000Z",
      ownedByLocal: true,
    };
    const conflict = {
      status: "conflict" as const,
      cardId: "card-conflict",
      runId: "run-conflict",
      agentId: "other-agent",
      eventId: "event-conflict",
      claimedAt: "2026-01-01T00:02:00.000Z",
      blockedByRunId: "run-owner",
      ownedByLocal: false,
    };

    expect(
      projectBoardClaimBlockedTaskIdsForRows(
        [
          projectBoardCardRow({ id: "card-remote", orchestration_task_id: "task-remote" }),
          projectBoardCardRow({ id: "card-local", orchestration_task_id: "task-local" }),
          projectBoardCardRow({ id: "card-conflict", orchestration_task_id: "task-conflict" }),
          projectBoardCardRow({ id: "card-no-task", orchestration_task_id: null }),
          projectBoardCardRow({ id: "card-expired", orchestration_task_id: "task-expired" }),
        ],
        {
          active: [remoteActive, localActive],
          expired: [
            {
              status: "expired",
              cardId: "card-expired",
              runId: "run-expired",
              agentId: "remote-agent",
              eventId: "event-expired",
              claimedAt: "2026-01-01T00:03:00.000Z",
              expiredAt: "2026-01-01T00:04:00.000Z",
              ownedByLocal: false,
            },
          ],
          conflicts: [conflict],
        },
      ),
    ).toEqual(["task-remote", "task-conflict"]);
  });

  it("identifies synthesis card rows protected from draft replacement", () => {
    const protectedClaimCardIds = new Set(["claimed-card"]);

    expect(projectBoardSynthesisCardRowProtectedFromDraftReplacement(projectBoardCardRow(), protectedClaimCardIds)).toBe(false);
    expect(projectBoardSynthesisCardRowProtectedFromDraftReplacement(projectBoardCardRow({ status: "ready" }), protectedClaimCardIds)).toBe(
      true,
    );
    expect(
      projectBoardSynthesisCardRowProtectedFromDraftReplacement(
        projectBoardCardRow({ orchestration_task_id: "task-1" }),
        protectedClaimCardIds,
      ),
    ).toBe(true);
    expect(
      projectBoardSynthesisCardRowProtectedFromDraftReplacement(projectBoardCardRow({ id: "claimed-card" }), protectedClaimCardIds),
    ).toBe(true);
    expect(
      projectBoardSynthesisCardRowProtectedFromDraftReplacement(
        projectBoardCardRow({ user_touched_fields_json: JSON.stringify(["title", "unsupported"]) }),
        protectedClaimCardIds,
      ),
    ).toBe(true);
    expect(
      projectBoardSynthesisCardRowProtectedFromDraftReplacement(
        projectBoardCardRow({ user_touched_fields_json: JSON.stringify(["unsupported"]) }),
        protectedClaimCardIds,
      ),
    ).toBe(false);
    for (const candidate_status of ["evidence", "duplicate", "rejected"] as const) {
      expect(
        projectBoardSynthesisCardRowProtectedFromDraftReplacement(projectBoardCardRow({ candidate_status }), protectedClaimCardIds),
      ).toBe(true);
    }
    expect(
      projectBoardSynthesisCardRowProtectedFromDraftReplacement(
        projectBoardCardRow({ pending_pi_update_json: JSON.stringify({ title: "Updated" }) }),
        protectedClaimCardIds,
      ),
    ).toBe(true);
  });

  it("maps start-fresh synthesis card row snapshots", () => {
    expect(
      projectBoardSynthesisStartFreshCardSnapshot(
        projectBoardCardRow({
          id: "card-start-fresh",
          title: "Build the visible shell",
          source_id: "synthesis:shell",
          status: "in_progress",
          candidate_status: "ready_to_create",
          user_touched_fields_json: JSON.stringify(["title", "bogus", "labels"]),
          orchestration_task_id: "task-1",
          execution_thread_id: "thread-1",
          clarification_questions_json: JSON.stringify(["Which shell?", 42, "Which route?"]),
        }),
      ),
    ).toEqual({
      cardId: "card-start-fresh",
      title: "Build the visible shell",
      sourceId: "synthesis:shell",
      status: "in_progress",
      candidateStatus: "ready_to_create",
      userTouchedFields: ["title", "labels"],
      orchestrationTaskId: "task-1",
      executionThreadId: "thread-1",
      clarificationQuestionCount: 2,
    });

    expect(
      projectBoardSynthesisStartFreshCardSnapshot(
        projectBoardCardRow({
          orchestration_task_id: null,
          execution_thread_id: null,
          user_touched_fields_json: "not json",
          clarification_questions_json: null,
        }),
      ),
    ).toMatchObject({
      userTouchedFields: [],
      clarificationQuestionCount: 0,
    });
  });

  it("normalizes project board card metadata values conservatively", () => {
    expect(normalizeProjectBoardUiMockRole("mock_gate")).toBe("mock_gate");
    expect(normalizeProjectBoardUiMockRole("gated_implementation")).toBe("gated_implementation");
    expect(normalizeProjectBoardUiMockRole("unsupported")).toBeUndefined();
    expect(normalizeProjectBoardCardExecutionSessionPolicy("fresh_context")).toBe("fresh_context");
    expect(normalizeProjectBoardCardExecutionSessionPolicy("reuse_card_session")).toBe("reuse_card_session");
    expect(normalizeProjectBoardCardExecutionSessionPolicy(null)).toBe("reuse_card_session");
    expect(normalizeProjectBoardCardExecutionSessionPolicy("unsupported")).toBe("reuse_card_session");
  });

  it("classifies project board UX mock gates and synthesis approval defaults", () => {
    const baseCard = {
      sourceId: "synthesis:shell",
      title: "Create shell",
      description: "Build the shell.",
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceRefs: [],
    };

    expect(projectBoardCardIsUxMockGate({ ...baseCard, sourceId: "synthesis:ux-mock-approval" })).toBe(true);
    expect(projectBoardCardIsUxMockGate({ ...baseCard, labels: ["ux-mock-approval"] })).toBe(true);
    expect(projectBoardCardIsUxMockGate({ ...baseCard, title: "Review UI mock before implementation" })).toBe(true);
    expect(projectBoardCardIsUxMockGate({ ...baseCard, uiMockRole: "mock_gate" })).toBe(true);
    expect(projectBoardCardIsUxMockGate(baseCard)).toBe(false);

    expect(projectBoardUxMockGateSatisfied({ status: "done", candidateStatus: "ready_to_create" })).toBe(true);
    expect(projectBoardUxMockGateSatisfied({ status: "draft", candidateStatus: "evidence" })).toBe(true);
    expect(projectBoardUxMockGateSatisfied({ status: "draft", candidateStatus: "ready_to_create" })).toBe(false);

    expect(projectBoardUiMockRoleForSynthesisCard({ ...baseCard, title: "Review UI mock before implementation" })).toBe("mock_gate");
    expect(projectBoardUiMockRoleForSynthesisCard({ ...baseCard, uiMockRole: "gated_implementation" })).toBe("gated_implementation");
    expect(projectBoardUiMockRoleForSynthesisCard(baseCard)).toBeUndefined();

    expect(projectBoardRequiresUiMockApprovalForSynthesisCard({ ...baseCard, requiresUiMockApproval: false })).toBe(false);
    expect(projectBoardRequiresUiMockApprovalForSynthesisCard({ ...baseCard, uiMockRole: "gated_implementation" })).toBe(true);
    expect(projectBoardRequiresUiMockApprovalForSynthesisCard({ ...baseCard, blockedBy: ["synthesis:ux-mock-approval"] })).toBe(true);
  });

  it("matches project board card references by stable ids and aliases", () => {
    const card = projectBoardCard({
      id: "card-123",
      sourceId: "synthesis:source-123",
      orchestrationTaskId: "task-123",
    });

    expect(projectBoardCardMatchesRef(card, " card-123 ")).toBe(true);
    expect(projectBoardCardMatchesRef(card, "synthesis:source-123")).toBe(true);
    expect(projectBoardCardMatchesRef(card, "task-123")).toBe(true);
    expect(projectBoardCardMatchesRef(card, "card:card-123")).toBe(true);
    expect(projectBoardCardMatchesRef(card, "project-board-card:card-123")).toBe(true);
    expect(projectBoardCardMatchesRef(card, " ")).toBe(false);
    expect(projectBoardCardMatchesRef(card, "other-card")).toBe(false);
  });

  it("finds closed parent cards for run follow-ups", () => {
    const doneParent = projectBoardCard({ id: "card-done-parent", title: "Done parent", status: "done" });
    const reviewDoneParent = projectBoardCard({
      id: "card-review-parent",
      title: "Review parent",
      proofReview: {
        status: "done",
        summary: "Proof accepted.",
        satisfied: [],
        missing: [],
        followUpCardIds: [],
        runId: "run-1",
        reviewedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    const evidenceParent = projectBoardCard({ id: "card-evidence-parent", title: "Evidence parent", candidateStatus: "evidence" });
    const openParent = projectBoardCard({ id: "card-open-parent", title: "Open parent", status: "review" });
    const followUp = projectBoardCard({
      id: "card-follow-up",
      sourceKind: "run_follow_up",
      blockedBy: ["card-open-parent", "card-done-parent"],
    });

    expect(projectBoardClosedParentForRunFollowUp(followUp, [followUp, openParent, doneParent])).toBe(doneParent);
    expect(
      projectBoardClosedParentForRunFollowUp(
        projectBoardCard({ id: "card-proof-follow-up", sourceKind: "run_follow_up", blockedBy: ["card-review-parent"] }),
        [reviewDoneParent],
      ),
    ).toBe(reviewDoneParent);
    expect(
      projectBoardClosedParentForRunFollowUp(
        projectBoardCard({ id: "card-evidence-follow-up", sourceKind: "run_follow_up", blockedBy: ["card-evidence-parent"] }),
        [evidenceParent],
      ),
    ).toBe(evidenceParent);
    const selfFollowUp = projectBoardCard({ id: "self", sourceKind: "run_follow_up", status: "done", blockedBy: ["self"] });
    expect(
      projectBoardClosedParentForRunFollowUp(projectBoardCard({ sourceKind: "board_synthesis", blockedBy: [doneParent.id] }), [doneParent]),
    ).toBeUndefined();
    expect(projectBoardClosedParentForRunFollowUp(selfFollowUp, [selfFollowUp])).toBeUndefined();
    expect(
      projectBoardClosedParentForRunFollowUp(projectBoardCard({ sourceKind: "run_follow_up", blockedBy: [openParent.id] }), [openParent]),
    ).toBeUndefined();
  });

  it("detects project board cards blocked by open or missing UX mock gates", () => {
    const gate = projectBoardCard({
      id: "gate-1",
      sourceId: "synthesis:ux-mock-approval",
      title: "Review UI mock",
      status: "draft",
      candidateStatus: "ready_to_create",
    });
    const implementation = projectBoardCard({
      id: "implementation-1",
      blockedBy: ["card:gate-1"],
      uiMockRole: "gated_implementation",
    });

    expect(projectBoardOpenUxMockGateBlocker(implementation, [gate, implementation])).toBe(gate);
    expect(projectBoardCardBlockedByOpenUxMockGate(implementation, [gate, implementation])).toBe(true);

    const satisfiedGate = projectBoardCard({ ...gate, status: "done" });
    expect(projectBoardOpenUxMockGateBlocker(implementation, [satisfiedGate, implementation])).toBeUndefined();
    expect(projectBoardCardMissingRequiredUxMockGate(implementation, [satisfiedGate, implementation])).toBe(false);
    expect(projectBoardCardBlockedByOpenUxMockGate(implementation, [satisfiedGate, implementation])).toBe(false);

    const missingGate = projectBoardCard({
      id: "implementation-2",
      requiresUiMockApproval: true,
      blockedBy: ["unrelated"],
    });
    expect(projectBoardCardMissingRequiredUxMockGate(missingGate, [missingGate])).toBe(true);
    expect(projectBoardCardBlockedByOpenUxMockGate(missingGate, [missingGate])).toBe(true);
    expect(projectBoardCardMissingRequiredUxMockGate(gate, [gate, missingGate])).toBe(false);
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

  it("normalizes project board clarification questions by trimming, deduping, and bounding length", () => {
    const longQuestion = `${"Which target should ship first? ".repeat(30)}This part is clipped.`;
    expect(
      normalizeProjectBoardClarificationQuestions(
        ["  Should the shell use Three.js or PixiJS?  ", "Should shell use Three.js or PixiJS", "", longQuestion, "Is mobile required?"],
        2,
      ),
    ).toEqual(["Should the shell use Three.js or PixiJS?", longQuestion.trim().slice(0, 500)]);
  });

  it("normalizes project board clarification suggestions conservatively", () => {
    expect(
      normalizeProjectBoardClarificationSuggestions([
        {
          question: "  Which renderer should the shell use?  ",
          suggestedAnswer: "  Keep the existing React renderer.  ",
          rationale: "  It keeps the first slice small.  ",
          confidence: "high",
          safeToAccept: true,
          questionKind: "expert_default",
        },
        {
          question: "Which renderer should the shell use",
          suggestedAnswer: "Use the current renderer and defer alternatives.",
          safeToAccept: true,
          questionKind: "user_preference",
        },
        {
          question: "Which theme is required?",
          suggestedAnswer: "",
        },
      ] as never),
    ).toEqual([
      {
        question: "Which renderer should the shell use",
        suggestedAnswer: "Use the current renderer and defer alternatives.",
        rationale: "Expert suggested answer from Ambient planning.",
        confidence: "low",
        safeToAccept: false,
        questionKind: "user_preference",
      },
    ]);

    expect(
      normalizeProjectBoardClarificationSuggestions(undefined, [
        {
          question: "  Is mobile required?  ",
          suggestedAnswer: "  Not for the first pass.  ",
          questionKind: "external_constraint",
        },
      ] as never),
    ).toEqual([
      {
        question: "Is mobile required?",
        suggestedAnswer: "Not for the first pass.",
        rationale: "Expert suggested answer from Ambient planning.",
        confidence: "low",
        safeToAccept: false,
        questionKind: "external_constraint",
      },
    ]);
  });

  it("parses project board clarification suggestions from JSON", () => {
    expect(
      parseProjectBoardClarificationSuggestions(
        JSON.stringify([
          {
            question: "Should proof be required?",
            suggestedAnswer: "Yes, require proof before Done.",
            rationale: "Matches the strict proof policy.",
            confidence: "medium",
            safeToAccept: true,
            questionKind: "expert_default",
          },
          { question: "Missing answer" },
        ]),
      ),
    ).toEqual([
      {
        question: "Should proof be required?",
        suggestedAnswer: "Yes, require proof before Done.",
        rationale: "Matches the strict proof policy.",
        confidence: "medium",
        safeToAccept: true,
        questionKind: "expert_default",
      },
    ]);
    expect(parseProjectBoardClarificationSuggestions("{}")).toEqual([]);
    expect(parseProjectBoardClarificationSuggestions("not json")).toEqual([]);
    expect(parseProjectBoardClarificationSuggestions(null)).toEqual([]);
  });

  it("normalizes project board clarification answers conservatively", () => {
    expect(
      normalizeProjectBoardClarificationAnswers([
        {
          question: " Which renderer should the shell use? ",
          answer: " Use the existing React renderer. ",
          answeredAt: " 2026-01-01T00:00:00.000Z ",
        },
        {
          question: "Which renderer should the shell use",
          answer: "Prefer the existing renderer and defer alternatives.",
          answeredAt: "2026-01-01T00:01:00.000Z",
        },
        {
          question: " ",
          answer: "Dropped.",
          answeredAt: "2026-01-01T00:02:00.000Z",
        },
        {
          question: "Which theme is required?",
          answer: "   ",
          answeredAt: "2026-01-01T00:03:00.000Z",
        },
      ]),
    ).toEqual([
      {
        question: "Which renderer should the shell use?",
        answer: "Prefer the existing renderer and defer alternatives.",
        answeredAt: "2026-01-01T00:01:00.000Z",
      },
    ]);

    expect(
      normalizeProjectBoardClarificationAnswers(undefined, [
        {
          question: " Is mobile required? ",
          answer: " Not for the first pass. ",
          answeredAt: "2026-01-01T00:04:00.000Z",
        },
      ]),
    ).toEqual([
      {
        question: "Is mobile required?",
        answer: "Not for the first pass.",
        answeredAt: "2026-01-01T00:04:00.000Z",
      },
    ]);
  });

  it("finds the changed project board clarification answer", () => {
    const previous: ProjectBoardCardClarificationAnswer[] = [
      {
        question: "Which renderer should the shell use?",
        answer: "Use the existing React renderer.",
        answeredAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const sameQuestionVariant: ProjectBoardCardClarificationAnswer = {
      question: "Which renderer should shell use",
      answer: "Use the existing React renderer.",
      answeredAt: "2026-01-01T00:00:00.000Z",
    };
    const changedAnswer: ProjectBoardCardClarificationAnswer = {
      ...sameQuestionVariant,
      answer: "Use the existing renderer and defer alternatives.",
    };
    const changedAnsweredAt: ProjectBoardCardClarificationAnswer = {
      ...sameQuestionVariant,
      answeredAt: "2026-01-01T00:05:00.000Z",
    };
    const newQuestion: ProjectBoardCardClarificationAnswer = {
      question: "Is mobile required?",
      answer: "Not for the first pass.",
      answeredAt: "2026-01-01T00:06:00.000Z",
    };

    expect(projectBoardChangedClarificationAnswer(previous, [sameQuestionVariant])).toBeUndefined();
    expect(projectBoardChangedClarificationAnswer(previous, [changedAnswer])).toBe(changedAnswer);
    expect(projectBoardChangedClarificationAnswer(previous, [changedAnsweredAt])).toBe(changedAnsweredAt);
    expect(projectBoardChangedClarificationAnswer(previous, [sameQuestionVariant, newQuestion])).toBe(newQuestion);
  });

  it("formats project board clarification answer sections", () => {
    expect(projectBoardClarificationAnswerSection(" Which renderer should the shell use? ", " Use React. ")).toBe(
      "- Q: Which renderer should the shell use?\n  A: Use React.",
    );
  });

  it("appends project board clarification answers to descriptions idempotently", () => {
    const question = "Which renderer should the shell use?";
    const answer = "Use React.";
    const entry = "- Q: Which renderer should the shell use?\n  A: Use React.";

    expect(projectBoardDescriptionWithClarificationAnswer("", question, answer)).toBe(`## Clarifications\n${entry}`);
    expect(projectBoardDescriptionWithClarificationAnswer("Build the shell.", question, answer)).toBe(
      `Build the shell.\n\n## Clarifications\n${entry}`,
    );
    expect(projectBoardDescriptionWithClarificationAnswer("Build the shell.\n\n## Clarifications", question, answer)).toBe(
      `Build the shell.\n\n## Clarifications\n${entry}`,
    );
    expect(projectBoardDescriptionWithClarificationAnswer(`Build the shell.\n\n## Clarifications\n${entry}`, question, answer)).toBe(
      `Build the shell.\n\n## Clarifications\n${entry}`,
    );
  });

  it("matches project board clarification questions against known variants", () => {
    expect(
      projectBoardQuestionMatchesAnyVariant("Which renderer should the shell use?", [
        "Which renderer should shell use",
        "Is mobile required?",
      ]),
    ).toBe(true);
    expect(projectBoardQuestionMatchesAnyVariant("Which renderer should the shell use?", ["Is mobile required?"])).toBe(false);
    expect(projectBoardQuestionMatchesAnyVariant("Which renderer should the shell use?", [])).toBe(false);
  });

  it("maps project board clarification decision impact events without model calls", () => {
    const impact: ProjectBoardDecisionImpactPreview = {
      visible: true,
      question: "Which renderer should the shell use?",
      answer: "Use the existing React renderer.",
      canonicalKey: "which-renderer-should-the-shell-use",
      answeredCardId: "card-answer",
      affectedCardIds: Array.from({ length: 45 }, (_, index) => `card-${index}`),
      unblockedDraftCount: 2,
      stillBlockedDraftCount: 1,
      duplicateHiddenCount: 3,
      readyFeedbackCount: 4,
      auditOnlyCount: 5,
      targetedRefreshOptional: true,
      modelCallRequired: false,
      headline: "Decision impact",
      detail: "2 draft gates clear and 4 cards need next-run feedback.",
      metrics: [],
      cards: [],
      recommendedActions: ["Create next-run feedback."],
    };

    expect(projectBoardClarificationDecisionImpactEventSummary("Shell card", impact)).toBe(
      "Shell card answered a clarification. 2 draft gates clear and 4 cards need next-run feedback. 0 model calls.",
    );
    expect(projectBoardClarificationDecisionImpactEventSummary("Shell card", { ...impact, visible: false })).toBe(
      "Shell card answered a clarification. No linked card impact; 0 model calls.",
    );
    expect(projectBoardDecisionImpactEventMetadata(impact)).toEqual({
      triggerType: "clarification_answer",
      question: "Which renderer should the shell use?",
      canonicalKey: "which-renderer-should-the-shell-use",
      answeredCardId: "card-answer",
      affectedCardCount: 45,
      affectedCardIds: Array.from({ length: 40 }, (_, index) => `card-${index}`),
      affectedCounts: {
        unblockedDrafts: 2,
        stillBlockedDrafts: 1,
        duplicateVariantsHidden: 3,
        readyFeedback: 4,
        auditOnly: 5,
      },
      targetedRefreshOptional: true,
      modelCallRequired: false,
      recommendedActions: ["Create next-run feedback."],
    });
  });

  it("formats project board decision impact feedback text", () => {
    expect(projectBoardDecisionImpactFeedbackText("Which renderer?", "Use React.")).toBe(
      "Clarification decision impact: Which renderer? Decision answer: Use React.. Apply this PM decision in the next run without rewriting the approved card silently.",
    );

    const longText = projectBoardDecisionImpactFeedbackText("Which renderer?", "Use React. ".repeat(200));
    expect(longText).toHaveLength(1500);
    expect(longText.startsWith("Clarification decision impact: Which renderer? Decision answer: Use React.")).toBe(true);
  });

  it("detects existing project board decision impact feedback by near-duplicate question", () => {
    const card = projectBoardCard({
      runFeedback: [
        {
          id: "feedback-1",
          feedback: "Apply the decision.",
          source: "decision_impact",
          decisionQuestion: "Which renderer should shell use",
          decisionAnswer: " Use React. ",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    expect(projectBoardHasDecisionImpactFeedback(card, "Which renderer should the shell use?", "Use React.")).toBe(true);
    expect(projectBoardHasDecisionImpactFeedback(card, "Which renderer should the shell use?", "Use Vue.")).toBe(false);
    expect(
      projectBoardHasDecisionImpactFeedback(
        projectBoardCard({ runFeedback: [{ ...card.runFeedback![0], source: "manual" }] }),
        "Which renderer?",
        "Use React.",
      ),
    ).toBe(false);
  });

  it("detects existing project board source impact feedback", () => {
    const card = projectBoardCard({
      runFeedback: [
        {
          id: "single-event",
          feedback: "Apply source impact.",
          source: "source_impact",
          sourceImpactEventId: "event-1",
          sourceIds: ["source-1"],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "multi-event",
          feedback: "Apply more source impact.",
          source: "source_impact",
          sourceImpactEventIds: ["event-2", "event-3"],
          sourceIds: ["source-2"],
          createdAt: "2026-01-01T00:01:00.000Z",
        },
      ],
    });

    expect(projectBoardHasSourceImpactFeedback(card, ["event-1"], [])).toBe(true);
    expect(projectBoardHasSourceImpactFeedback(card, ["event-3"], [])).toBe(true);
    expect(projectBoardHasSourceImpactFeedback(card, [], ["source-2"])).toBe(true);
    expect(projectBoardHasSourceImpactFeedback(card, ["event-missing"], ["source-2"])).toBe(false);
    expect(projectBoardHasSourceImpactFeedback(card, [], ["source-missing"])).toBe(false);
    expect(
      projectBoardHasSourceImpactFeedback(
        projectBoardCard({
          runFeedback: [
            {
              id: "manual",
              feedback: "Manual note.",
              source: "manual",
              sourceImpactEventId: "event-1",
              sourceIds: ["source-1"],
              createdAt: "2026-01-01T00:02:00.000Z",
            },
          ],
        }),
        ["event-1"],
        ["source-1"],
      ),
    ).toBe(false);
  });

  it("builds project board proof revision run feedback", () => {
    const previousReview: ProjectBoardCardProofReview = {
      status: "needs_follow_up",
      summary: "Proof lacked mobile evidence.",
      satisfied: ["Unit tests passed."],
      missing: ["Mobile screenshot", "Manual QA", "Trace", "Accessibility note", "Error capture", "Extra omitted"],
      followUpCardIds: [],
      runId: "run-1",
      reviewedAt: "2026-01-01T00:00:00.000Z",
      recommendedAction: "retry",
    };
    const feedback = projectBoardProofRevisionRunFeedback(
      previousReview,
      "Add mobile screenshot proof before closing.",
      "2026-01-01T00:05:00.000Z",
    );

    expect(feedback).toMatchObject({
      id: expect.any(String),
      source: "proof_review",
      decisionQuestion: "Why was this proof sent back for revision?",
      decisionAnswer: "Add mobile screenshot proof before closing.",
      createdAt: "2026-01-01T00:05:00.000Z",
      createdBy: "ambient-desktop",
    });
    expect(feedback?.feedback).toContain("Proof revision requested.");
    expect(feedback?.feedback).toContain("Reviewer note: Add mobile screenshot proof before closing.");
    expect(feedback?.feedback).toContain("Previous proof review: Proof lacked mobile evidence.");
    expect(feedback?.feedback).toContain("Missing evidence: Mobile screenshot; Manual QA; Trace; Accessibility note; Error capture");
    expect(feedback?.feedback).not.toContain("Extra omitted");
    expect(feedback?.feedback).toContain("Previous recommendation: retry");
    expect(projectBoardProofRevisionRunFeedback(undefined, undefined, "2026-01-01T00:00:00.000Z")).toBeUndefined();
  });

  it("builds project board UX mock rejection run feedback", () => {
    const previousReview: ProjectBoardCardProofReview = {
      status: "needs_follow_up",
      summary: "Mock misses narrow viewport.",
      satisfied: [],
      missing: ["Narrow viewport", "Hover state", "Keyboard focus", "Contrast", "Spacing", "Extra omitted"],
      followUpCardIds: [],
      runId: "run-ux",
      reviewedAt: "2026-01-01T00:00:00.000Z",
    };
    const feedback = projectBoardUxMockRejectionRunFeedback(previousReview, undefined, "2026-01-01T00:06:00.000Z");

    expect(feedback).toMatchObject({
      id: expect.any(String),
      source: "proof_review",
      decisionQuestion: "Why was this UX mock rejected?",
      decisionAnswer: "Mock misses narrow viewport.",
      createdAt: "2026-01-01T00:06:00.000Z",
      createdBy: "ambient-desktop",
    });
    expect(feedback.feedback).toContain("UX mock rejected.");
    expect(feedback.feedback).toContain("Previous mock review: Mock misses narrow viewport.");
    expect(feedback.feedback).toContain("Missing or rejected criteria: Narrow viewport; Hover state; Keyboard focus; Contrast; Spacing");
    expect(feedback.feedback).not.toContain("Extra omitted");

    const fallback = projectBoardUxMockRejectionRunFeedback(undefined, undefined, "2026-01-01T00:07:00.000Z");
    expect(fallback).toMatchObject({
      source: "proof_review",
      decisionAnswer: "UX mock rejected by user PM decision.",
      feedback: "UX mock rejected. Keep downstream UI implementation blocked until a revised mock is approved.",
    });
  });

  it("parses project board clarification answers from JSON", () => {
    expect(
      parseProjectBoardClarificationAnswers(
        JSON.stringify([
          {
            question: "Should proof be required?",
            answer: "Yes, require proof before Done.",
            answeredAt: "2026-01-01T00:00:00.000Z",
          },
          { question: "Missing answer" },
        ]),
      ),
    ).toEqual([
      {
        question: "Should proof be required?",
        answer: "Yes, require proof before Done.",
        answeredAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(parseProjectBoardClarificationAnswers("{}")).toEqual([]);
    expect(parseProjectBoardClarificationAnswers("not json")).toEqual([]);
    expect(parseProjectBoardClarificationAnswers(null)).toEqual([]);
  });

  it("normalizes project board clarification decisions conservatively", () => {
    const decisions = normalizeProjectBoardClarificationDecisions([
      {
        id: "decision-1",
        question: " Which renderer should the shell use? ",
        canonicalKey: " renderer shell ",
        source: "card",
        state: "open",
        suggestedAnswer: " Keep React. ",
        rationale: " Preserves the current stack. ",
        confidence: "high",
        safeToAccept: true,
        questionKind: "expert_default",
        createdAt: " 2026-01-01T00:00:00.000Z ",
        updatedAt: " 2026-01-01T00:01:00.000Z ",
      },
      {
        id: "decision-2",
        question: "Broken answered decision?",
        canonicalKey: "broken answered decision",
        source: "answer_history",
        state: "answered",
      },
    ] as never);

    expect(decisions).toHaveLength(2);
    expect(decisions[0]).toEqual({
      id: "clarification:renderer-shell",
      question: "Which renderer should the shell use?",
      canonicalKey: "renderer shell",
      source: "card",
      state: "open",
      duplicateOf: undefined,
      suggestedAnswer: "Keep React.",
      rationale: "Preserves the current stack.",
      confidence: "high",
      safeToAccept: true,
      questionKind: "expert_default",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
    });
    expect(decisions[1]).toMatchObject({
      id: "clarification:broken-answered-decision",
      question: "Broken answered decision?",
      source: "answer_history",
      state: "open",
    });
  });

  it("parses project board clarification decisions from JSON with fallback questions", () => {
    expect(
      parseProjectBoardClarificationDecisions(
        JSON.stringify([
          {
            id: "q1",
            question: "Should proof be required?",
            source: "unsupported",
            state: "answered",
            answer: " Yes, require proof before Done. ",
            answeredAt: "2026-01-01T00:00:00.000Z",
          },
          { answer: "Missing question" },
        ]),
      ),
    ).toEqual([
      {
        id: "clarification:proof-required",
        question: "Should proof be required?",
        canonicalKey: "proof required",
        source: "card",
        state: "answered",
        answer: "Yes, require proof before Done.",
        answeredAt: "2026-01-01T00:00:00.000Z",
        safeToAccept: false,
        createdAt: undefined,
        updatedAt: undefined,
      },
    ]);
    expect(
      parseProjectBoardClarificationDecisions(null, {
        clarificationQuestions: [" Is mobile required? "],
        createdAt: "2026-01-01T00:01:00.000Z",
        updatedAt: "2026-01-01T00:02:00.000Z",
      }),
    ).toMatchObject([
      {
        id: "clarification:mobile-required",
        question: "Is mobile required?",
        state: "open",
        createdAt: "2026-01-01T00:01:00.000Z",
        updatedAt: "2026-01-01T00:02:00.000Z",
      },
    ]);
    expect(parseProjectBoardClarificationDecisions("{}")).toEqual([]);
    expect(parseProjectBoardClarificationDecisions("not json")).toEqual([]);
  });

  it("normalizes project board synthesis clarification fields with answered questions filtered", () => {
    const answeredAt = "2026-01-01T00:00:00.000Z";
    const result = normalizeProjectBoardSynthesisClarificationFields({
      clarificationQuestions: [" Should proof be required? ", "Which renderer should ship first?"],
      clarificationAnswers: [
        {
          question: "Should proof be required?",
          answer: "Yes, require proof before Done.",
          answeredAt,
        },
      ],
      clarificationDecisions: [
        {
          id: "decision-1",
          question: "Which renderer should ship first?",
          canonicalKey: "renderer ship first",
          source: "card",
          state: "open",
          suggestedAnswer: " Use React. ",
          rationale: " Existing stack. ",
          confidence: "high",
          safeToAccept: true,
          questionKind: "expert_default",
        },
      ] as never,
      createdAt: "2026-01-01T00:01:00.000Z",
      updatedAt: "2026-01-01T00:02:00.000Z",
    });

    expect(result.clarificationQuestions).toEqual(["Which renderer should ship first?"]);
    expect(result.clarificationSuggestions).toEqual([
      {
        question: "Which renderer should ship first?",
        suggestedAnswer: "Use React.",
        rationale: "Existing stack.",
        confidence: "high",
        safeToAccept: true,
        questionKind: "expert_default",
      },
    ]);
    expect(result.clarificationDecisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          question: "Which renderer should ship first?",
          state: "open",
          suggestedAnswer: "Use React.",
        }),
        expect.objectContaining({
          question: "Should proof be required?",
          state: "answered",
          answer: "Yes, require proof before Done.",
        }),
      ]),
    );
  });

  it("derives project board clarification questions and suggestions from open decisions", () => {
    const result = normalizeProjectBoardSynthesisClarificationFields({
      clarificationDecisions: [
        {
          id: "decision-1",
          question: "Should mobile layout ship in the first pass?",
          canonicalKey: "mobile layout ship first pass",
          source: "card",
          state: "open",
          suggestedAnswer: "Defer mobile layout until desktop is stable.",
          safeToAccept: true,
          questionKind: "expert_default",
        },
      ] as never,
    });

    expect(result.clarificationQuestions).toEqual(["Should mobile layout ship in the first pass?"]);
    expect(result.clarificationSuggestions).toEqual([
      {
        question: "Should mobile layout ship in the first pass?",
        suggestedAnswer: "Defer mobile layout until desktop is stable.",
        rationale: "Suggested default from the structured clarification decision.",
        confidence: "low",
        safeToAccept: true,
        questionKind: "expert_default",
      },
    ]);
  });

  it("filters answered project board clarification questions", () => {
    expect(
      projectBoardUnansweredClarificationQuestions(
        [" Should proof be required? ", "Which renderer should ship first?"],
        [
          {
            question: "Should proof be required?",
            answer: "Yes, require proof before Done.",
            answeredAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      ),
    ).toEqual(["Which renderer should ship first?"]);
  });

  it("preserves candidate status when synthesis only reopens answered clarification gates", () => {
    const answeredDecision = {
      id: "clarification:proof-required",
      question: "Should proof be required?",
      canonicalKey: "proof required",
      source: "answer_history",
      state: "answered",
      answer: "Yes.",
      answeredAt: "2026-01-01T00:00:00.000Z",
    } as never;
    const openDecision = {
      id: "clarification:renderer",
      question: "Which renderer should ship first?",
      canonicalKey: "renderer",
      source: "card",
      state: "open",
    } as never;

    expect(projectBoardCandidateStatusForSynthesisUpdate("needs_clarification", "ready_to_create", [answeredDecision])).toBe(
      "ready_to_create",
    );
    expect(projectBoardCandidateStatusForSynthesisUpdate("needs_clarification", "ready_to_create", [openDecision])).toBe(
      "needs_clarification",
    );
    expect(projectBoardCandidateStatusForSynthesisUpdate("ready_to_create", "needs_clarification", [])).toBe("ready_to_create");
  });

  it("returns no project board pending Pi update when the synthesis card still matches the row", () => {
    expect(
      projectBoardCardPendingPiUpdateFromSynthesisCard(
        projectBoardCardPendingPiUpdateRow(),
        {
          sourceId: " synthesis:shell ",
          title: " Create shell ",
          description: " Build the shell. ",
          candidateStatus: "ready_to_create",
          priority: 2,
          phase: " Foundation ",
          labels: [" shell "],
          blockedBy: [],
          acceptanceCriteria: [" Canvas renders. "],
          testPlan: { unit: [" unit test "], integration: [], visual: [], manual: [] },
          sourceRefs: [" docs/architecture.md "],
        },
        "2026-01-01T00:02:00.000Z",
      ),
    ).toBeUndefined();
  });

  it("maps changed synthesis cards to project board pending Pi updates", () => {
    const update = projectBoardCardPendingPiUpdateFromSynthesisCard(
      projectBoardCardPendingPiUpdateRow({
        clarification_questions_json: JSON.stringify(["Renderer choice?"]),
        clarification_answers_json: JSON.stringify([
          {
            question: "Renderer choice?",
            answer: "Use React.",
            answeredAt: "2026-01-01T00:00:30.000Z",
          },
        ]),
      }),
      {
        sourceId: " synthesis:shell ",
        title: " Create shell v2 ",
        description: " Build the shell. ",
        candidateStatus: "needs_clarification",
        priority: 2.4,
        phase: " Foundation ",
        labels: [" shell ", "webgl"],
        blockedBy: [],
        acceptanceCriteria: [" Canvas renders. "],
        testPlan: { unit: [" unit test "], integration: [], visual: [], manual: [] },
        sourceRefs: [" docs/architecture.md "],
        clarificationQuestions: ["Renderer choice?"],
        uiMockRole: "mock_gate",
        requiresUiMockApproval: true,
      },
      "2026-01-01T00:02:00.000Z",
    );

    expect(update).toMatchObject({
      sourceId: "synthesis:shell",
      createdAt: "2026-01-01T00:02:00.000Z",
      title: "Create shell v2",
      description: "Build the shell.",
      candidateStatus: "ready_to_create",
      priority: 2,
      phase: "Foundation",
      labels: ["shell", "webgl"],
      blockedBy: [],
      acceptanceCriteria: ["Canvas renders."],
      testPlan: { unit: ["unit test"], integration: [], visual: [], manual: [] },
      sourceRefs: ["docs/architecture.md"],
      clarificationQuestions: [],
      uiMockRole: "mock_gate",
      requiresUiMockApproval: true,
      changedFields: expect.arrayContaining(["title", "labels", "uiMockMetadata"]),
    });
    expect(update?.changedFields).not.toContain("candidateStatus");
    expect(update?.changedFields).not.toContain("clarificationQuestions");
  });

  it("materializes no project board pending Pi update when staged values match the row", () => {
    expect(
      projectBoardMaterialPendingPiUpdateForRow(projectBoardCardPendingPiUpdateRow(), {
        sourceId: "synthesis:shell",
        createdAt: "2026-01-01T00:02:00.000Z",
        changedFields: ["title", "labels"],
        title: " Create shell ",
        labels: [" shell "],
      }),
    ).toBeUndefined();
  });

  it("recomputes project board pending Pi update changed fields against the row", () => {
    expect(
      projectBoardMaterialPendingPiUpdateForRow(projectBoardCardPendingPiUpdateRow(), {
        sourceId: "synthesis:shell",
        createdAt: "2026-01-01T00:02:00.000Z",
        changedFields: ["description"],
        title: " Create shell v2 ",
        labels: ["shell", "webgl"],
      }),
    ).toMatchObject({
      sourceId: "synthesis:shell",
      title: " Create shell v2 ",
      labels: ["shell", "webgl"],
      changedFields: ["title", "labels"],
    });
  });

  it("compares project board clarification decisions using the persisted gate shape", () => {
    const answeredLeft = {
      id: "clarification:proof-required",
      question: "Should proof be required?",
      canonicalKey: "proof required",
      source: "answer_history",
      state: "answered",
      answer: "Yes.",
      answeredAt: "2026-01-01T00:00:00.000Z",
      suggestedAnswer: "Maybe.",
      safeToAccept: true,
    } as never;
    const answeredRight = {
      id: "different-id",
      question: "Should proof be required?",
      canonicalKey: "proof required",
      source: "card",
      state: "answered",
      answer: "Yes.",
      answeredAt: "2026-01-02T00:00:00.000Z",
      suggestedAnswer: "No.",
      safeToAccept: false,
    } as never;
    const openLeft = {
      id: "clarification:renderer",
      question: "Which renderer should ship first?",
      canonicalKey: "renderer",
      source: "card",
      state: "open",
      suggestedAnswer: "Use React.",
      confidence: "high",
      safeToAccept: true,
      questionKind: "expert_default",
    } as never;
    const openRight = {
      id: "clarification:renderer",
      question: "Which renderer should ship first?",
      canonicalKey: "renderer",
      source: "card",
      state: "open",
      suggestedAnswer: "Use Canvas.",
      confidence: "high",
      safeToAccept: true,
      questionKind: "expert_default",
    } as never;

    expect(projectBoardClarificationDecisionsEquivalent([answeredLeft], [answeredRight])).toBe(true);
    expect(projectBoardClarificationDecisionsEquivalent([openLeft], [openRight])).toBe(false);
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
