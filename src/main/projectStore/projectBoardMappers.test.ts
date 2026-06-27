import { describe, expect, it } from "vitest";
import type { OrchestrationRun } from "../../shared/workflowTypes";
import type { ProjectBoardCard } from "../../shared/projectBoardTypes";
import {
  firstMeaningfulLine,
  normalizeCardTextList,
  normalizeProjectBoardCardTestPlan,
  normalizeProjectBoardProofFollowUpSuggestion,
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
  projectBoardCardProofCount,
  projectBoardCardStatusWithProofReview,
  projectBoardHasTrustworthyTaskCompletion,
  projectBoardProofFollowUpOptionsFromSuggestion,
  projectBoardProofOfWorkForRun,
  projectBoardRunHasReviewableProof,
  projectBoardTerminalBlockerDetail,
  projectBoardStatusForTask,
  projectBoardTaskStateForProofReview,
  projectBoardTestPolicyRequiresProofSpec,
  resolveProjectBoardTaskBlockers,
} from "./projectBoardMappers";
import { projectBoardCard, plannerPlanArtifact, orchestrationTask } from "./projectBoardMappersTestSupport";

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
});
