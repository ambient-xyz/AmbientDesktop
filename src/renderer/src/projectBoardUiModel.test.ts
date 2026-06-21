import { describe, expect, it } from "vitest";
import type { ProjectBoardCard, ProjectBoardEvent, ProjectBoardExecutionArtifact, ProjectBoardGitSyncStatus, ProjectBoardPlanningSnapshot, ProjectBoardPmReviewReport, ProjectBoardSource, ProjectBoardSummary, ProjectBoardSynthesisRun, ProjectSummary } from "../../shared/projectBoardTypes";
import type { OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";
import {
  projectBoardActionState,
  projectBoardActiveCardDetail,
  projectBoardActiveCardOverviewModel,
  projectBoardAddCardsSourceScope,
  projectBoardCollaborationReadiness,
  projectBoardComplexityEstimate,
  defaultProjectBoardTab,
  projectBoardCandidateClarificationItems,
  projectBoardPlanningWarningActionTitle,
  projectBoardPlanningWarningsForCard,
  projectBoardClarificationAnswerInput,
  projectBoardCardEditWithClarificationAnswerInput,
  projectBoardCardCanSplit,
  projectBoardCardSourceBasis,
  projectBoardCharterReviewActionState,
  projectBoardCardsForSourceGroup,
  projectBoardCardClaimActionState,
  projectBoardCardClaimBlocksLocalTicketization,
  projectBoardCardClaimLabel,
  projectBoardCardEditCanSave,
  projectBoardCardEditDraft,
  projectBoardCardEditInput,
  projectBoardCardCanEditDependencies,
  projectBoardCardDependencyBadges,
  projectBoardCardIsDraftInboxCandidate,
  projectBoardBoardDecisionImpactRail,
  projectBoardBoardTabShowsDraftCallout,
  projectBoardBoardTabShowsExecutionPanels,
  projectBoardBoardTabStatusLabel,
  projectBoardCanonicalCardProjection,
  projectBoardColumns,
  projectBoardDecisionQueue,
  projectBoardDeliverableIntegrationQueue,
  projectBoardDependencyEditOptions,
  projectBoardDependencyChangeImpactPreview,
  projectBoardDependencyHealth,
  projectBoardDependencyRows,
  projectBoardDraftColumns,
  projectBoardDraftColumnMoveState,
  projectBoardDraftInboxCreateReadyPreview,
  projectBoardDraftInboxFilterOptions,
  projectBoardPiUpdateReviewQueue,
  projectBoardEmptyMessage,
  projectBoardEventGroups,
  projectBoardEventHasSupersededCardReview,
  projectBoardEventKindLabel,
  projectBoardEventSummary,
  projectBoardHistoryCollaborationAudit,
  projectBoardHistoryImpactAudit,
  projectBoardHistoryRecoveryQueue,
  projectBoardLiveSessionPreviewModel,
  projectBoardOverviewModel,
  projectBoardImpactQueue,
  projectBoardExecutionControlModel,
  projectBoardExecutionOverview,
  projectBoardExecutionReadinessRail,
  projectBoardExecutionPmReview,
  projectBoardWorkflowImpactPreview,
  projectBoardPhaseGroups,
  projectBoardPendingClarificationQuestions,
  projectBoardPlanningSnapshotTicketizationState,
  projectBoardCardCanMarkReady,
  projectBoardCardVisualTone,
  projectBoardPrimaryBlockingCard,
  projectBoardCreateReadyTasksState,
  projectBoardHasActiveSynthesisRun,
  projectBoardPmReviewReportUiModel,
  projectBoardProofDecisionModel,
  projectBoardProofEvidenceModel,
  projectBoardProofFollowUpImpactModel,
  projectBoardProofInspectionNavigationModel,
  projectBoardProofCoverageForBoard,
  projectBoardProofReviewQueueSummary,
  projectBoardProjectionReview,
  projectBoardProjectionReviewResolutionState,
  projectBoardReadyTicketizationCards,
  projectBoardSynthesisRunProofScopeWarnings,
  projectBoardSynthesisRunControlState,
  projectBoardSynthesisRunPromptBudgetAudit,
  projectBoardSynthesisRunPromptBudgetMetrics,
  projectBoardResetImpact,
  projectBoardRequiresProofSpec,
  projectBoardStatusLabel,
  projectBoardSupersededCardReview,
  projectBoardSuppressedForWorkflowRecordingThread,
  projectBoardSourceChangeDetail,
  projectBoardSourceChangeFilterItems,
  projectBoardSourceChangeSummary,
  projectBoardSourceGroupsForChangeFilter,
  projectBoardSourceGroupsForFilter,
  projectBoardSourceFilterItems,
  projectBoardSourceGroupCanElaborate,
  projectBoardSourceGroupIncludedSourceIds,
  projectBoardSourceGroups,
  projectBoardSourceImpactPreview,
  projectBoardSourceInclusion,
  projectBoardSourceObservationLabel,
  projectBoardSourcesForFilter,
  projectBoardTabs,
  projectBoardTestSummary,
  projectBoardTestSummaryForBoard,
  projectBoardThreadPlanActionState,
  projectBoardUiMockReviewPanelModel,
  projectBoardUiMockReviewBadges,
  projectBoardKickoffDefaultAnswer,
  projectBoardKickoffDefaultProviderErrorMessage,
  projectBoardUnattachedLocalTasks,
} from "./projectBoardUiModel";

function project(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    path: "/workspace/app",
    name: "App",
    statePath: "/workspace/app/.ambient-codex",
    sessionPath: "/workspace/app/.ambient-codex/sessions",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    threads: [],
    ...overrides,
    id: overrides.id ?? "project-1",
  };
}

function claimSummary(
  overrides: {
    status?: "active" | "expired" | "conflict";
    ownedByLocal?: boolean;
    expirationRecorded?: boolean;
  } = {},
) {
  return {
    status: overrides.status ?? ("active" as const),
    cardId: "card-1",
    runId: "run-1",
    agentId: overrides.ownedByLocal ? "desktop-local" : "desktop-remote",
    eventId: "evt-claim-1",
    claimedAt: "2026-01-01T00:00:00.000Z",
    leaseUntil: overrides.status === "expired" ? "2026-01-01T00:15:00.000Z" : "2099-01-01T00:00:00.000Z",
    expirationRecorded: overrides.expirationRecorded,
    ownedByLocal: overrides.ownedByLocal,
  };
}

function gitStatus(overrides: Partial<ProjectBoardGitSyncStatus> = {}): ProjectBoardGitSyncStatus {
  return {
    boardId: "board-1",
    projectRoot: "/workspace/app",
    artifactRoot: "/workspace/app/.ambient/board",
    isGitRepository: true,
    repoRoot: "/workspace/app",
    branch: "main",
    remote: "origin",
    hasRemote: true,
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    dirtyBoardFileCount: 0,
    dirtyBoardFiles: [],
    mode: "git_ready",
    projection: {
      ok: true,
      valid: true,
      differenceCount: 0,
      differences: [],
      fileCount: 8,
      cardCount: 3,
      sourceCount: 2,
      eventCount: 4,
      proposalRunCount: 1,
      activeClaimCount: 0,
      expiredClaimCount: 0,
      claimConflictCount: 0,
    },
    ...overrides,
  };
}

function synthesisRun(overrides: Partial<ProjectBoardSynthesisRun> = {}): ProjectBoardSynthesisRun {
  return {
    id: "run-1",
    boardId: "board-1",
    status: "running",
    stage: "model_request",
    sourceCount: 2,
    includedSourceCount: 2,
    sourceCharCount: 1200,
    warningCount: 0,
    events: [],
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function boardSummary(overrides: Partial<ProjectBoardSummary> = {}): ProjectBoardSummary {
  return {
    id: "board-1",
    projectPath: "/workspace/app",
    status: "active",
    title: "App board",
    summary: "Project board",
    cards: [],
    sources: [],
    questions: [],
    proposals: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function boardSource(overrides: Partial<ProjectBoardSource> = {}): ProjectBoardSource {
  return {
    id: overrides.id ?? "source-1",
    boardId: overrides.boardId ?? "board-1",
    kind: overrides.kind ?? "thread",
    title: overrides.title ?? "Source",
    summary: overrides.summary ?? "",
    excerpt: overrides.excerpt,
    path: overrides.path,
    authorityRole: overrides.authorityRole,
    byteSize: overrides.byteSize ?? 1_000,
    includeInSynthesis: overrides.includeInSynthesis ?? true,
    relevance: overrides.relevance ?? 1,
    classificationReason: overrides.classificationReason,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

describe("projectBoardUiModel", () => {
  it("opens board setup for the active project when no board exists", () => {
    expect(projectBoardActionState(project(), "/workspace/app")).toMatchObject({
      kind: "open",
      label: "Project Board",
      disabled: false,
      statusLabel: "No board",
    });
    expect(projectBoardActionState(project({ path: "/workspace/other" }), "/workspace/app")).toMatchObject({
      kind: "open",
      disabled: true,
    });
    expect(projectBoardActionState(project(), "/workspace/app").title).toContain("Building starts only from the Build Board button");
  });

  it("suppresses project board entry points in workflow recording chats", () => {
    expect(projectBoardSuppressedForWorkflowRecordingThread(undefined)).toBe(false);
    expect(projectBoardSuppressedForWorkflowRecordingThread({})).toBe(false);
    expect(projectBoardSuppressedForWorkflowRecordingThread({ workflowRecording: { status: "recording" } })).toBe(true);
    expect(projectBoardSuppressedForWorkflowRecordingThread({ workflowRecording: { status: "stopped" } })).toBe(true);
  });

  it("shows open board once a project board exists", () => {
    const withBoard = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "draft",
        title: "App board",
        summary: "Draft",
        charterId: "charter-1",
        cards: [],
        sources: [],
        questions: [],
        proposals: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    expect(projectBoardActionState(withBoard, "/workspace/app")).toMatchObject({
      kind: "open",
      label: "Open Board",
      disabled: false,
      statusLabel: "Kickoff draft",
    });
    expect(projectBoardActionState(withBoard, "/workspace/app", false, true)).toMatchObject({
      kind: "close",
      label: "Open Chat",
      title: "Return to main chat",
      disabled: false,
      statusLabel: "Kickoff draft",
    });
    expect(projectBoardActionState(withBoard, "/workspace/app", true)).toMatchObject({
      kind: "open",
      label: "Open Board",
      disabled: false,
      statusLabel: "Kickoff draft",
    });
    expect(projectBoardActionState(withBoard, "/workspace/other", false, true)).toMatchObject({
      kind: "open",
      label: "Open Board",
      disabled: true,
    });
    expect(projectBoardStatusLabel(withBoard.board!)).toBe("Kickoff draft");
    expect(projectBoardEmptyMessage(withBoard.board!)).toContain("Answer the kickoff questions");
    expect(
      projectBoardEmptyMessage(
        boardSummary({
          status: "draft",
          cards: [
            {
              id: "draft-1",
              boardId: "board-1",
              title: "Implement compact app",
              description: "Build the single-file local app.",
              status: "draft",
              candidateStatus: "ready_to_create",
              labels: [],
              blockedBy: [],
              acceptanceCriteria: ["App works."],
              testPlan: { unit: [], integration: [], visual: [], manual: ["Manual check."] },
              sourceKind: "planner_plan",
              sourceId: "plan-1",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        }),
      ),
    ).toContain("1 draft candidate exists");

    withBoard.board!.charter = {
      id: "charter-2",
      boardId: "board-1",
      version: 2,
      status: "draft",
      goal: "",
      currentState: "",
      targetUser: "",
      nonGoals: [],
      qualityBar: "",
      testPolicy: {},
      decisionPolicy: {},
      dependencyPolicy: {},
      budgetPolicy: {},
      sourcePolicy: {},
      markdown: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(projectBoardStatusLabel(withBoard.board!)).toBe("Revision draft");
    expect(projectBoardEmptyMessage(withBoard.board!)).toContain("apply or cancel");

    withBoard.board!.status = "active";
    expect(projectBoardStatusLabel(withBoard.board!)).toBe("Active board");
    expect(projectBoardEmptyMessage(withBoard.board!)).toContain("ready for project cards");
  });

  it("scores a simple static Hello World board as small in shadow mode", () => {
    const estimate = projectBoardComplexityEstimate(
      boardSummary({
        title: "Simple Hello World Web App",
        summary: "Create one static index.html file with inline CSS. No JavaScript, no backend, no database, and zero dependencies.",
        sources: [
          {
            id: "source-1",
            boardId: "board-1",
            kind: "plan_artifact",
            title: "Super Simple Static Hello World Web App",
            summary: "A single file static Hello World page.",
            byteSize: 900,
            includeInSynthesis: true,
            relevance: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );

    expect(estimate.band).toBe("small");
    expect(estimate.planningMode).toBe("fast");
    expect(estimate.anchorLabel).toBe("Similar to Tip Calculator");
    expect(estimate.suggestedCardBudget).toMatchObject({ min: 1, max: 5 });
    expect(estimate.score).toBeLessThanOrEqual(5);
    expect(estimate.signals.some((signal) => signal.id === "hello-world")).toBe(true);
  });

  it("uses model scope-contract planning depth before fallback source scoring", () => {
    const planningSnapshot: ProjectBoardPlanningSnapshot = {
      id: "snapshot-1",
      boardId: "board-1",
      runId: "run-1",
      kind: "final",
      planningStatus: "succeeded",
      planningStage: "board_applied",
      createdAt: "2026-01-01T00:00:00.000Z",
      cardCount: 1,
      readyCandidateCount: 0,
      ticketizedCount: 0,
      sourceHashes: [],
      scopeContract: {
        included: ["auth", "accounts", "backend", "notifications"],
        excluded: [],
        requiredCapabilities: ["User accounts", "Groups", "Transaction database", "Email/push notifications"],
        supportingCapabilities: ["Balance settlement algorithm"],
        optionalCapabilities: [],
        excludedCapabilities: [],
        planningDepth: {
          score: 86,
          level: "phased",
          signals: ["User accounts, groups, transaction DB, balance algorithm, and notifications are all required."],
          guidance: "Use phased planning with dependency ordering and proofable backend/frontend slices.",
        },
        planningDepthHints: ["Full-stack app with auth, persistence, and notifications."],
        openQuestions: [],
        evidence: ["Requirements: User accounts, groups, transaction DB, balance algorithm, email/push notifications."],
      },
      planningDepth: {
        score: 86,
        level: "phased",
        signals: ["User accounts, groups, transaction DB, balance algorithm, and notifications are all required."],
        guidance: "Use phased planning with dependency ordering and proofable backend/frontend slices.",
      },
      cardIds: [],
      cards: [],
      renderFingerprint: "fingerprint-1",
    };
    const estimate = projectBoardComplexityEstimate(
      boardSummary({
        title: "Expense Splitter board",
        summary: "Board is ready for project cards.",
        sources: [
          boardSource({
            kind: "plan_artifact",
            title: "Expense Splitter plan",
            summary: "A compact plan artifact.",
            excerpt: "One implementation plan card exists.",
          }),
        ],
        synthesisRuns: [
          synthesisRun({
            status: "succeeded",
            stage: "board_applied",
            planningSnapshots: [planningSnapshot],
          }),
        ],
      }),
    );

    expect(estimate.source).toBe("model_scope_contract");
    expect(estimate.heading).toBe("Scope contract estimate");
    expect(estimate.band).toBe("large");
    expect(estimate.planningMode).toBe("detailed");
    expect(estimate.anchorLabel).toBe("Scope contract: phased");
    expect(estimate.signals.some((signal) => signal.id === "model-planning-depth")).toBe(true);
    expect(estimate.signals.some((signal) => signal.id === "simple-static")).toBe(false);
  });

  it("keeps unanswered kickoff questions informational for simple local scope complexity", () => {
    const estimate = projectBoardComplexityEstimate(
      boardSummary({
        status: "draft",
        title: "Local Random Option Picker board",
        summary: "Create a simple local random option picker: paste options, click Pick, show one random choice.",
        cards: Array.from({ length: 5 }, (_, index) => ({
          id: `draft-${index + 1}`,
          boardId: "board-1",
          title: `Draft ${index + 1}`,
          description: "",
          status: "draft" as const,
          candidateStatus: "needs_clarification" as const,
          labels: [],
          blockedBy: [],
          acceptanceCriteria: [],
          testPlan: { unit: [], integration: [], visual: [], manual: [] },
          sourceRefs: [],
          clarificationQuestions: [],
          clarificationAnswers: [],
          clarificationSuggestions: [],
          clarificationDecisions: [],
          sourceKind: "board_synthesis" as const,
          sourceId: `synthesis:${index + 1}`,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        })),
        questions: Array.from({ length: 5 }, (_, index) => ({
          id: `question-${index + 1}`,
          boardId: "board-1",
          question: `Kickoff question ${index + 1}?`,
          required: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        })),
      }),
    );

    expect(estimate.band).toBe("small");
    expect(estimate.score).toBeLessThanOrEqual(5);
    expect(estimate.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "unanswered-questions", score: 0, tone: "neutral" }),
        expect.objectContaining({ id: "planner-output-observed", score: 0, tone: "neutral" }),
      ]),
    );
  });

  it("calibrates a refined Tip Calculator plan as a small project", () => {
    const durablePlanHtml = `
      <style>.plan-shell { display: grid; }</style>
      <section id="source-plan">
        <pre>
          Build a Tip Calculator.
          User enters bill amount, tip percentage, and number of people.
          The app calculates tip, total, and split amount.
          Results update in real-time as the user types.
          No login, no backend, no persistent storage, no complex business rules.
          Single screen, pure client-side arithmetic, one small HTML/CSS/JS surface.
        </pre>
      </section>
      <section id="generated-context">
        <p>Template chrome may mention auth, API, CSP, deployment, and security examples, but this is not project scope.</p>
      </section>
    `;
    const estimate = projectBoardComplexityEstimate(
      boardSummary({
        title: "Tip Calculator board",
        summary: "Create a simple Tip Calculator web app.",
        questions: [
          {
            id: "question-1",
            boardId: "board-1",
            question: "Any missing kickoff detail?",
            required: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        sources: [
          boardSource({
            id: "source-1",
            kind: "implementation_plan",
            title: "Tip Calculator — Implementation Plan",
            summary: "Simple local form calculator. No backend, storage, auth, or integrations.",
            excerpt: durablePlanHtml,
            path: ".ambient/board/plans/Tip-Calculator-2026-05-28-DurablePlan.html",
            byteSize: 38_505,
            authorityRole: "primary",
            classificationReason: "Semantic role is a structured delivery plan, not a functional spec or architecture doc.",
          }),
          boardSource({
            id: "source-2",
            kind: "git_state",
            title: "Git working tree",
            summary: "Branch: main. Working tree clean.",
            byteSize: 400,
            authorityRole: "context",
          }),
          boardSource({
            id: "source-3",
            kind: "thread",
            title: "Tip Calculator",
            summary: "User asked for a tip calculator.",
            includeInSynthesis: false,
            authorityRole: "ignored",
          }),
        ],
      }),
    );

    expect(estimate.band).toBe("small");
    expect(estimate.planningMode).toBe("fast");
    expect(estimate.anchorLabel).toBe("Similar to Tip Calculator");
    expect(estimate.suggestedCardBudget.max).toBe(5);
    expect(estimate.score).toBeLessThanOrEqual(5);
    expect(estimate.signals.some((signal) => signal.id === "local-calculation-form")).toBe(true);
    expect(estimate.signals.some((signal) => signal.id === "auth-security")).toBe(false);
    expect(estimate.signals.some((signal) => signal.id === "interactive-state")).toBe(false);
    expect(estimate.signals.some((signal) => signal.id === "realtime-collab")).toBe(false);
    expect(estimate.signals.some((signal) => signal.id === "game-ui")).toBe(false);
  });

  it("treats a simple unit converter as small without hard-coding one project name", () => {
    const estimate = projectBoardComplexityEstimate(
      boardSummary({
        title: "Simple unit converter",
        summary: "One screen app with two inputs. Convert values using local calculation only. No backend, no login, no storage.",
        sources: [
          boardSource({
            kind: "thread",
            title: "Unit converter",
            summary: "A simple form that converts Celsius to Fahrenheit with basic arithmetic.",
          }),
        ],
      }),
    );

    expect(estimate.band).toBe("small");
    expect(estimate.score).toBeLessThanOrEqual(5);
    expect(estimate.suggestedCardBudget.max).toBe(5);
  });

  it("calibrates a habit tracker as medium complexity", () => {
    const estimate = projectBoardComplexityEstimate(
      boardSummary({
        title: "Personal Habit Tracker",
        summary:
          "User creates habits, marks them complete, sees streaks, weekly and monthly stats, and can set reminders. Use IndexedDB local database storage. No login or backend.",
        sources: [
          boardSource({
            kind: "functional_spec",
            title: "Habit Tracker spec",
            summary:
              "Requires CRUD operations for habits, persistent storage, date logic, recurring habit rules, charts, reminders, and UI state for completion history.",
            byteSize: 9_000,
          }),
        ],
      }),
    );

    expect(estimate.band).toBe("medium");
    expect(estimate.planningMode).toBe("balanced");
    expect(estimate.anchorLabel).toBe("Similar to Habit Tracker");
    expect(estimate.suggestedCardBudget).toMatchObject({ min: 6, max: 10 });
    expect(estimate.signals.some((signal) => signal.id === "storage-crud")).toBe(true);
    expect(estimate.signals.some((signal) => signal.id === "dates-stats-notifications")).toBe(true);
  });

  it("calibrates a ride-sharing app as large complexity", () => {
    const estimate = projectBoardComplexityEstimate(
      boardSummary({
        title: "Ride-Sharing App",
        summary:
          "Riders request trips, drivers accept jobs, locations update in real time, pricing is calculated, payments are processed, and both sides rate each other.",
        sources: [
          boardSource({
            kind: "functional_spec",
            title: "Ride-sharing product spec",
            summary:
              "Requires realtime geolocation, matching algorithm, maps and routing APIs, payment integration, push notifications, rider and driver auth flows, admin tools, support tooling, fraud prevention, and scalable backend infrastructure.",
            byteSize: 65_000,
          }),
        ],
      }),
    );

    expect(estimate.band).toBe("large");
    expect(estimate.planningMode).toBe("detailed");
    expect(estimate.anchorLabel).toBe("Similar to Ride-Sharing App");
    expect(estimate.suggestedCardBudget).toMatchObject({ min: 11, max: 15 });
    expect(estimate.signals.some((signal) => signal.id === "maps-location")).toBe(true);
    expect(estimate.signals.some((signal) => signal.id === "realtime-collab")).toBe(true);
    expect(estimate.signals.some((signal) => signal.id === "payments-integrations")).toBe(true);
  });

  it("does not count explicitly excluded services as complexity signals", () => {
    const estimate = projectBoardComplexityEstimate(
      boardSummary({
        title: "Hello World Web App - Refined Durable Plan board",
        summary:
          "Create a super simple static-only Hello World page. No JavaScript, no backend, no database, no auth, no payments, no integrations, no game, and no server required. Omit app.js.",
        sources: [
          {
            id: "source-1",
            boardId: "board-1",
            kind: "plan_artifact",
            title: "Super Simple Static Hello World Web App",
            summary:
              "Pure vanilla HTML and inline CSS only. No buttons, no interactive state, no backend services, no auth or accounts, no payments, and no deployment integration.",
            byteSize: 12_000,
            includeInSynthesis: true,
            relevance: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "source-2",
            boardId: "board-1",
            kind: "implementation_plan",
            title: "Implementation plan",
            summary:
              "Use one index.html file. The implementation should exclude a server, exclude JavaScript, and avoid GitHub, Slack, email, webhook, or third-party integrations.",
            byteSize: 7_000,
            includeInSynthesis: true,
            relevance: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "source-3",
            boardId: "board-1",
            kind: "thread",
            title: "make a plan for a simple hello world web app",
            summary: "User asked for a very small static page only.",
            byteSize: 1_500,
            includeInSynthesis: true,
            relevance: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );

    expect(estimate.band).toBe("small");
    expect(estimate.score).toBeLessThanOrEqual(5);
    expect(estimate.signals.some((signal) => signal.id === "backend-data")).toBe(false);
    expect(estimate.signals.some((signal) => signal.id === "auth-security")).toBe(false);
    expect(estimate.signals.some((signal) => signal.id === "payments-integrations")).toBe(false);
    expect(estimate.signals.some((signal) => signal.id === "game-ui")).toBe(false);
    expect(estimate.signals.some((signal) => signal.id === "interactive-state")).toBe(false);
  });

  it("lets a durable local random-picker plan override stale shadow-estimate charter noise", () => {
    const estimate = projectBoardComplexityEstimate(
      boardSummary({
        title: "Local Random Option Picker board",
        summary: "Board is ready for project cards.",
        charter: {
          id: "charter-1",
          boardId: "board-1",
          version: 1,
          status: "active",
          projectSummary: {
            summary: "Stale summary mentions auth, security, payments, integrations, and a WebGL game.",
            majorSystems: ["Authentication and payment integration", "Three.js game UI"],
            sourceCoverage: [],
            risks: ["Security and deployment risk"],
            dependencyHints: [],
            unresolvedDecisions: [],
            citations: [],
            coverageGaps: [],
            sourceChecksumSet: ["stale-source:hash"],
            charterAnswerChecksum: "stale-checksum",
            generatedAt: "2026-01-01T00:00:00.000Z",
            generator: "fallback_heuristic",
          },
          goal: "",
          currentState: "",
          targetUser: "",
          nonGoals: [],
          qualityBar: "",
          testPolicy: {},
          decisionPolicy: {},
          dependencyPolicy: {},
          budgetPolicy: {},
          sourcePolicy: {},
          markdown: "",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        sources: [
          boardSource({
            kind: "plan_artifact",
            title: "Plan: Local Random Option Picker",
            summary:
              "Requested: A simple local app where you paste options, click Pick, and see one random choice. Constraints: No backend, no auth, no deployment.",
            excerpt: `
              Scope Contract
              Requested: A simple local app where you paste options, click Pick, and see one random choice.
              Constraints: No backend, no auth, no deployment.
              Assumed: Single HTML file with inline CSS/JS, runs locally in a browser.
              Out of scope: History of picks, weighted choices, animations, saving/sharing, deployment/build step.
            `,
            path: ".ambient/board/plans/Local-Random-Option-Picker-DurablePlan.html",
            authorityRole: "primary",
            includeInSynthesis: true,
            byteSize: 18_688,
          }),
        ],
      }),
    );

    expect(estimate.band).toBe("small");
    expect(estimate.score).toBeLessThanOrEqual(5);
    expect(estimate.signals.some((signal) => signal.id === "auth-security")).toBe(false);
    expect(estimate.signals.some((signal) => signal.id === "payments-integrations")).toBe(false);
    expect(estimate.signals.some((signal) => signal.id === "game-ui")).toBe(false);
  });

  it("does not score a simple Hangman request from unrelated repository background", () => {
    const estimate = projectBoardComplexityEstimate(
      boardSummary({
        title: "ambientCoder board",
        summary: "Kickoff is ready.",
        questions: [
          {
            id: "question-1",
            boardId: "board-1",
            question: "Will this require authentication, payments, deployment, backend APIs, or realtime collaboration?",
            required: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        sources: [
          {
            id: "source-1",
            boardId: "board-1",
            kind: "thread",
            title: "Simple Hangman Web App",
            summary: "Create a simple Hangman web app with a word display, on-screen keyboard buttons, and basic game state.",
            byteSize: 1_500,
            includeInSynthesis: true,
            relevance: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "source-2",
            boardId: "board-1",
            kind: "implementation_file",
            title: "Ambient Desktop source tree",
            summary: "Large existing app code mentions backend APIs, authentication, payments, integrations, realtime sync, and collaboration.",
            byteSize: 667_045,
            includeInSynthesis: true,
            relevance: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );

    expect(estimate.band).toBe("medium");
    expect(estimate.score).toBeLessThanOrEqual(14);
    expect(estimate.signals).toContainEqual(
      expect.objectContaining({
        id: "background-context-observed",
        score: 0,
      }),
    );
    expect(estimate.signals.some((signal) => signal.id === "backend-data")).toBe(false);
    expect(estimate.signals.some((signal) => signal.id === "auth-security")).toBe(false);
    expect(estimate.signals.some((signal) => signal.id === "payments-integrations")).toBe(false);
    expect(estimate.signals.some((signal) => signal.id === "realtime-collab")).toBe(false);
  });

  it("scores a durable Hello World plan from plan summaries instead of generated HTML noise", () => {
    const noisyDurablePlanHtml = `
      <meta http-equiv="content-security-policy" content="default-src 'none'">
      <svg><text>Ambient UI stores plan state and renders architecture diagrams.</text></svg>
      <p>browser_local_preview fallback path; no build, compile, or deploy step.</p>
      <p>Implementation notes mention API examples, auth setup, game diagrams, and interactive buttons in generated template chrome.</p>
    `;
    const estimate = projectBoardComplexityEstimate(
      boardSummary({
        title: "TestKanban(helloworld2) board",
        summary: "Recovered a partial board proposal from completed Ambient/Pi sections.",
        sources: [
          {
            id: "source-1",
            boardId: "board-1",
            kind: "implementation_plan",
            title: "Durable Plan: Super Simple Static Hello World Web App",
            summary: "A single index.html file with centered Hello, World text. Static only, no JavaScript, no build, and no deploy step.",
            excerpt: noisyDurablePlanHtml,
            path: ".ambient/board/plans/Plan-Simple-Hello-World-Web-App-2026-05-27-14-33-04-DurablePlan.html",
            byteSize: 36_819,
            authorityRole: "primary",
            includeInSynthesis: true,
            relevance: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "source-2",
            boardId: "board-1",
            kind: "git_state",
            title: "Git working tree",
            summary: "Branch: main. Working tree clean.",
            byteSize: 127,
            authorityRole: "context",
            includeInSynthesis: true,
            relevance: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );

    expect(estimate.band).toBe("small");
    expect(estimate.score).toBeLessThanOrEqual(5);
    expect(estimate.signals.some((signal) => signal.id === "backend-data")).toBe(false);
    expect(estimate.signals.some((signal) => signal.id === "auth-security")).toBe(false);
    expect(estimate.signals.some((signal) => signal.id === "game-ui")).toBe(false);
    expect(estimate.signals.some((signal) => signal.id === "interactive-state")).toBe(false);
  });

  it("does not let generated card count inflate the shadow complexity score", () => {
    const estimate = projectBoardComplexityEstimate(
      boardSummary({
        title: "Simple Hello World Web App",
        summary: "One simple static file. No JavaScript and no backend.",
        cards: Array.from({ length: 30 }, (_, index) => ({
          id: `card-${index}`,
          boardId: "board-1",
          title: `Generated card ${index}`,
          description: "Generated output",
          status: "draft" as const,
          candidateStatus: "ready_to_create" as const,
          labels: [],
          blockedBy: [],
          acceptanceCriteria: [],
          testPlan: { unit: [], integration: [], visual: [], manual: [] },
          sourceKind: "planner_plan" as const,
          sourceId: "source-1",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        })),
        sources: [
          {
            id: "source-1",
            boardId: "board-1",
            kind: "plan_artifact",
            title: "Static Hello World plan",
            summary: "Simple one file app.",
            byteSize: 1200,
            includeInSynthesis: true,
            relevance: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );

    expect(estimate.band).toBe("small");
    expect(estimate.signals).toContainEqual(
      expect.objectContaining({
        id: "planner-output-observed",
        score: 0,
      }),
    );
  });

  it("scores backend auth and realtime work as large in shadow mode", () => {
    const estimate = projectBoardComplexityEstimate(
      boardSummary({
        title: "Multi-user admin dashboard",
        summary: "Build a realtime dashboard with authentication, roles, database schema, backend API, Stripe billing, webhooks, and deployment.",
        sources: [
          {
            id: "source-1",
            boardId: "board-1",
            kind: "functional_spec",
            title: "Product spec",
            summary: "Auth, payments, realtime sync, backend services, database migrations, and GitHub integration.",
            byteSize: 85_000,
            includeInSynthesis: true,
            relevance: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "source-2",
            boardId: "board-1",
            kind: "implementation_plan",
            title: "Implementation plan",
            summary: "Multiple pages, API routes, database migrations, deployment, and end-to-end tests.",
            byteSize: 42_000,
            includeInSynthesis: true,
            relevance: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );

    expect(estimate.band).toBe("large");
    expect(estimate.planningMode).toBe("detailed");
    expect(estimate.score).toBeGreaterThan(14);
    expect(estimate.signals.some((signal) => signal.id === "backend-data")).toBe(true);
  });

  it("treats draft boards with executable cards as an execution board in the Board tab", () => {
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "draft",
        title: "App board",
        summary: "Draft",
        charterId: "charter-1",
        cards: [],
        sources: [],
        questions: [],
        proposals: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    expect(projectBoardBoardTabStatusLabel(board, 4, 0)).toBe("Execution board");
    expect(projectBoardBoardTabShowsDraftCallout(board, 4)).toBe(false);
    expect(projectBoardBoardTabShowsExecutionPanels(board, 4)).toBe(true);
    expect(projectBoardBoardTabStatusLabel(board, 0, 0)).toBe("Kickoff draft");
    expect(projectBoardBoardTabShowsDraftCallout(board, 0)).toBe(true);
    expect(projectBoardBoardTabShowsExecutionPanels(board, 0)).toBe(false);
  });

  it("models pause and resume controls for synthesis run states", () => {
    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "running" }))).toMatchObject({
      pause: {
        visible: true,
        label: "Pause Planning",
        busyLabel: "Pausing",
        disabled: false,
      },
      resume: { visible: false },
      startFresh: { visible: false },
    });

    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "running" }), { pauseBusy: true })).toMatchObject({
      pause: {
        visible: true,
        disabled: true,
      },
    });

    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "running", stage: "kickoff_defaults" }))).toMatchObject({
      pause: { visible: false },
      resume: { visible: false },
      startFresh: { visible: false },
    });

    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "pause_requested" }))).toMatchObject({
      pause: { visible: false },
      resume: { visible: false },
      startFresh: { visible: false },
    });

    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "paused", stage: "paused" }))).toMatchObject({
      pause: { visible: false },
      resume: {
        visible: true,
        label: "Resume Planning",
        busyLabel: "Resuming",
        disabled: false,
      },
      startFresh: {
        visible: true,
        label: "Start Fresh",
        busyLabel: "Starting Fresh",
        disabled: false,
      },
    });

    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "paused", stage: "paused" }), { resumeBusy: true, startFreshBusy: true })).toMatchObject({
      resume: {
        visible: true,
        disabled: true,
      },
      startFresh: {
        visible: true,
        disabled: true,
      },
    });

    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "succeeded" }))).toMatchObject({
      pause: { visible: false },
      resume: { visible: false },
      startFresh: { visible: false },
    });
    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "failed" }))).toMatchObject({
      pause: { visible: false },
      resume: { visible: false },
      startFresh: { visible: false },
    });
    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "abandoned", stage: "paused" }))).toMatchObject({
      pause: { visible: false },
      resume: { visible: false },
      startFresh: { visible: false },
    });
  });

  it("models History recovery actions for exhausted failed source sections", () => {
    const queue = projectBoardHistoryRecoveryQueue({
      sources: [
        {
          id: "source-1",
          boardId: "board-1",
          kind: "plan_artifact",
          title: "Durable plan",
          summary: "Tiny animation plan",
          path: "plan.md",
          includeInSynthesis: true,
          relevance: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      synthesisRuns: [
        synthesisRun({
          status: "failed",
          stage: "failed",
          progressiveRecords: [
            {
              type: "progress",
              title: "Section 1 failed",
              summary: "No usable card records were emitted after inline retry budget was exhausted.",
              createdAt: "2026-01-01T00:01:00.000Z",
              metadata: {
                sectionStatus: "failed",
                sectionId: "section-1",
                sectionIndex: 1,
                sectionCount: 2,
                sectionHeading: "Animation",
                sourcePath: "plan.md",
                failureKind: "section_no_records",
              },
            },
            {
              type: "progress",
              title: "Section 2 completed",
              summary: "Saved card records.",
              createdAt: "2026-01-01T00:02:00.000Z",
              metadata: { sectionStatus: "succeeded", sectionId: "section-2", sectionIndex: 2, sectionCount: 2 },
            },
          ],
          progressiveRecordCount: 2,
          progressiveSummary: { recordCount: 2, candidateCardCount: 1, questionCount: 0, sourceCoverageCount: 1, dependencyEdgeCount: 0, warningCount: 0, errorCount: 1 },
          updatedAt: "2026-01-01T00:02:00.000Z",
        }),
      ],
    });

    expect(queue[0]).toMatchObject({
      title: "Failed source sections need a decision",
      failedSectionCount: 1,
      completedSectionCount: 1,
      progressiveRecordCount: 2,
      sourcePaths: ["plan.md"],
    });
    expect(queue[0]?.actions.map((action) => [action.id, action.disabled])).toEqual([
      ["retry_failed_sections", false],
      ["defer_failed_sections", false],
      ["view_progressive_records", false],
      ["open_source_context", false],
    ]);
  });

  it("models History recovery actions for stale, paused, and output-cap runs", () => {
    const outputCapRun = synthesisRun({
      id: "run-output",
      status: "failed",
      stage: "failed",
      updatedAt: "2026-01-01T00:03:00.000Z",
      events: [
        {
          stage: "model_response",
          title: "Planner batch stopped",
          summary: "Stopped after output token limit.",
          createdAt: "2026-01-01T00:03:00.000Z",
          metadata: {
            recoverableOutputStop: true,
            finishReason: "length",
            lastValidRecordId: "card-1",
            lastValidRecordType: "candidate_card",
            lastValidRecordIndex: 1,
          },
        },
      ],
    });
    const queue = projectBoardHistoryRecoveryQueue(
      {
        sources: [],
        synthesisRuns: [
          synthesisRun({ id: "run-paused", status: "paused", stage: "paused", updatedAt: "2026-01-01T00:02:00.000Z" }),
          synthesisRun({ id: "run-stale", status: "running", updatedAt: "2026-01-01T00:01:00.000Z" }),
          outputCapRun,
        ],
      },
      { nowMs: Date.parse("2026-01-01T00:10:00.000Z"), staleMs: 60_000 },
    );

    expect(queue.map((item) => [item.runId, item.title, item.actions.map((action) => action.id)])).toEqual([
      ["run-output", "Planner batch can continue", ["continue_planner_batch"]],
      ["run-paused", "Paused run can resume", ["resume_paused_run", "start_fresh_from_paused_run"]],
      ["run-stale", "Planning appears stale", ["retry_stalled_run"]],
    ]);
  });

  it("keeps recovered failed section runs auditable without stale retry actions", () => {
    const parent = synthesisRun({
      id: "run-parent",
      status: "succeeded",
      progressiveRecords: [
        {
          type: "progress",
          title: "Section failed",
          summary: "The section failed before a later retry recovered it.",
          createdAt: "2026-01-01T00:01:00.000Z",
          metadata: { sectionStatus: "failed", sectionId: "section-1", sectionIndex: 1, sectionCount: 1, sourcePath: "plan.md" },
        },
      ],
      progressiveRecordCount: 1,
      updatedAt: "2026-01-01T00:01:00.000Z",
    });
    const child = synthesisRun({
      id: "run-child",
      retryOfRunId: parent.id,
      status: "succeeded",
      progressiveRecords: [{ type: "candidate_card", title: "Recovered card" }],
      progressiveRecordCount: 1,
      updatedAt: "2026-01-01T00:02:00.000Z",
    });

    const parentRecovery = projectBoardHistoryRecoveryQueue({ sources: [], synthesisRuns: [parent, child] }).find((item) => item.runId === parent.id);

    expect(parentRecovery).toMatchObject({
      title: "Recovered by retry",
      tone: "neutral",
      summary: expect.stringContaining("run-child"),
    });
    expect(parentRecovery?.actions.map((action) => action.id)).toEqual(["view_progressive_records", "open_source_context"]);
  });

  it("splits latest and cumulative prompt budget metrics for sectioned planning", () => {
    const metrics = projectBoardSynthesisRunPromptBudgetMetrics(
      synthesisRun({
        promptCharCount: 1_008_778,
        events: [
          {
            stage: "model_request",
            title: "Asked Ambient/Pi for section 27/51",
            summary: "Sent prompt characters for a source section.",
            createdAt: "2026-01-01T00:00:00.000Z",
            metadata: {
              latestPromptCharCount: 31_804,
              cumulativePromptCharCount: 1_008_778,
              latestEstimatedInputTokens: 7_951,
              cumulativeEstimatedInputTokens: 252_195,
              promptBudgetAssessment: { promptCharCount: 31_804, summarizationRecommended: false },
              plannerLedgerCompactionStatus: "skipped",
              plannerLedgerCompactionSkipReason: "section_prompt_below_threshold",
            },
          },
        ],
      }),
    );

    expect(metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Latest prompt chars", value: "31,804" }),
        expect.objectContaining({ label: "Cumulative prompt chars", value: "1,008,778" }),
        expect.objectContaining({ label: "Est. input tokens", value: "~7,951 latest / ~252,195 total" }),
        expect.objectContaining({ label: "Compaction", value: "Skipped: below threshold" }),
      ]),
    );
  });

  it("reports planner ledger compaction status from run events", () => {
    expect(
      projectBoardSynthesisRunPromptBudgetMetrics(
        synthesisRun({
          promptCharCount: 80_000,
          events: [
            {
              stage: "model_request",
              title: "Asked Ambient/Pi for planner batch 1",
              summary: "Planner batch used compacted context.",
              createdAt: "2026-01-01T00:00:00.000Z",
              metadata: {
                latestPromptCharCount: 12_000,
                cumulativePromptCharCount: 80_000,
                promptBudgetAssessment: { promptCharCount: 12_000, summarizationRecommended: false },
                plannerLedgerCompactionStatus: "used",
                plannerLedgerCompaction: { cacheHit: false },
              },
            },
          ],
        }),
      ).find((metric) => metric.label === "Compaction"),
    ).toMatchObject({ value: "Applied" });

    expect(
      projectBoardSynthesisRunPromptBudgetMetrics(
        synthesisRun({
          promptCharCount: 80_000,
          events: [
            {
              stage: "model_response",
              title: "Reused cached planner ledger compaction for batch 1",
              summary: "Compaction cache hit.",
              createdAt: "2026-01-01T00:00:00.000Z",
              metadata: {
                plannerLedgerCompactionStatus: "cache_hit",
                plannerLedgerCompaction: { cacheHit: true },
              },
            },
          ],
        }),
      ).find((metric) => metric.label === "Compaction"),
    ).toMatchObject({ value: "Reused" });
  });

  it("builds a prompt budget audit from sectioned compaction telemetry", () => {
    const usedAudit = projectBoardSynthesisRunPromptBudgetAudit(
      synthesisRun({
        promptCharCount: 180_000,
        events: [
          {
            stage: "model_request",
            title: "Asked Ambient/Pi for source section 9/12",
            summary: "Section request used compacted context.",
            createdAt: "2026-01-01T00:00:00.000Z",
            metadata: {
              latestPromptCharCount: 22_000,
              cumulativePromptCharCount: 180_000,
              promptBudgetAssessment: { promptCharCount: 22_000, summarizationRecommended: false },
              plannerLedgerCompactionStatus: "used",
              plannerLedgerCompaction: {
                source: "pi_rlm",
                summary: "Prior card themes and duplicate-avoidance notes were compacted.",
                renderedCardCount: 9,
                omittedRenderedCardCount: 4,
                sourceCount: 3,
                finalPromptCharCount: 22_000,
              },
            },
          },
        ],
      }),
    );

    expect(usedAudit).toMatchObject({
      tone: "ready",
      headline: "Compacted planner context was applied",
      metrics: expect.arrayContaining([
        expect.objectContaining({ label: "Latest request", value: "22,000" }),
        expect.objectContaining({ label: "Run total", value: "180,000" }),
        expect.objectContaining({ label: "Compacted cards", value: "9" }),
        expect.objectContaining({ label: "Omitted cards", value: "4" }),
        expect.objectContaining({ label: "Final prompt", value: "22,000" }),
      ]),
      notes: expect.arrayContaining(["Compaction source: pi_rlm.", "Prior card themes and duplicate-avoidance notes were compacted."]),
    });

    const legacyAudit = projectBoardSynthesisRunPromptBudgetAudit(
      synthesisRun({
        promptCharCount: 250_000,
        events: [
          {
            stage: "model_request",
            title: "Asked Ambient/Pi for source section 10/12",
            summary: "Old section telemetry.",
            createdAt: "2026-01-01T00:00:00.000Z",
            metadata: {
              latestPromptCharCount: 70_000,
              cumulativePromptCharCount: 250_000,
              promptBudgetAssessment: { promptCharCount: 70_000, summarizationRecommended: true },
              plannerLedgerCompactionStatus: "skipped",
              plannerLedgerCompactionSkipReason: "sectioned_planning_compaction_not_supported",
            },
          },
        ],
      }),
    );

    expect(legacyAudit).toMatchObject({
      tone: "warning",
      headline: "Legacy run skipped section compaction",
      detail: expect.stringContaining("Current sectioned runs can compact repeated context"),
    });
    expect(legacyAudit?.notes.join(" ")).not.toMatch(/not implemented/i);
  });

  it("gates charter Pi review behind kickoff answers", () => {
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "draft",
        title: "App board",
        summary: "Draft",
        charterId: "charter-1",
        cards: [],
        sources: [],
        questions: [
          {
            id: "question-1",
            boardId: "board-1",
            question: "What is the primary outcome?",
            required: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "question-2",
            boardId: "board-1",
            question: "Which sources are authoritative?",
            required: true,
            answer: "Use the GDD first.",
            answeredAt: "2026-01-01T00:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        proposals: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    expect(projectBoardCharterReviewActionState(board)).toMatchObject({
      label: "Review Charter With Pi",
      disabled: true,
      title: expect.stringContaining("Answer all kickoff questions first"),
    });

    board.questions[0] = { ...board.questions[0], answer: "Build the playable slice.", answeredAt: "2026-01-01T00:00:00.000Z" };
    expect(projectBoardCharterReviewActionState(board)).toMatchObject({
      label: "Review Answers With Pi",
      disabled: false,
      title: expect.stringContaining("saved kickoff answers"),
    });

    board.status = "active";
    expect(projectBoardCharterReviewActionState(board)).toMatchObject({
      label: "Review Charter With Pi",
      disabled: false,
      title: expect.stringContaining("active charter"),
    });
  });

  it("models thread-level Add Plan to Board availability", () => {
    expect(projectBoardThreadPlanActionState(false, 1)).toMatchObject({
      kind: "no_board",
      disabled: false,
      title: "Create a project board and add the ready planner plan.",
    });
    expect(projectBoardThreadPlanActionState(true, 0)).toMatchObject({
      kind: "no_ready_plan",
      disabled: true,
      title: "Create a ready planner plan first.",
    });
    expect(projectBoardThreadPlanActionState(true, 1)).toMatchObject({
      kind: "single_ready_plan",
      disabled: false,
      label: "Add Plan to Board",
    });
    expect(projectBoardThreadPlanActionState(true, 2)).toMatchObject({
      kind: "multiple_ready_plans",
      disabled: false,
    });
    expect(projectBoardThreadPlanActionState(true, 1, true)).toMatchObject({
      kind: "single_ready_plan",
      disabled: true,
      title: "Adding plan to board",
    });
  });

  it("groups board cards into draft, ready, progress, and review columns", () => {
    const base = {
      boardId: "board-1",
      description: "",
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as ProjectBoardCard["sourceKind"],
      sourceId: "artifact-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const columns = projectBoardColumns([
      { ...base, id: "card-1", title: "Draft", status: "draft" },
      { ...base, id: "card-blocked", title: "Blocked", status: "blocked" },
      { ...base, id: "card-2", title: "Ready", status: "ready" },
      { ...base, id: "card-3", title: "Running", status: "in_progress" },
      { ...base, id: "card-4", title: "Review", status: "review" },
      { ...base, id: "card-5", title: "Done", status: "done" },
    ]);

    expect(columns.map((column) => [column.id, column.cards.map((card) => card.title)])).toEqual([
      ["blocked", ["Blocked"]],
      ["ready", ["Ready"]],
      ["in_progress", ["Running"]],
      ["review", ["Review"]],
      ["done", ["Done"]],
    ]);
    expect(columns.map((column) => column.tooltip)).toEqual([
      expect.stringContaining("blocking"),
      expect.stringContaining("eligible"),
      expect.stringContaining("in progress"),
      expect.stringContaining("PM review"),
      expect.stringContaining("complete"),
    ]);
  });

  it("orders board lane cards by critical path before creation time", () => {
    const base = {
      boardId: "board-1",
      description: "",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as ProjectBoardCard["sourceKind"],
      sourceId: "artifact-1",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const columns = projectBoardColumns([
      { ...base, id: "dependent", title: "Dependent", blockedBy: ["foundation"], createdAt: "2026-01-01T00:01:00.000Z" },
      { ...base, id: "unrelated", title: "Earlier unrelated", createdAt: "2026-01-01T00:00:30.000Z" },
      { ...base, id: "foundation", title: "Foundation", createdAt: "2026-01-01T00:02:00.000Z" },
    ]);

    expect(columns.find((column) => column.id === "ready")?.cards.map((card) => card.id)).toEqual([
      "foundation",
      "dependent",
      "unrelated",
    ]);
  });

  it("models batch ticketization for ready draft cards", () => {
    const base = {
      boardId: "board-1",
      description: "",
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as ProjectBoardCard["sourceKind"],
      sourceId: "artifact-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "",
        cards: [
          { ...base, id: "card-1", title: "Ready draft", status: "draft" as const },
          { ...base, id: "card-2", title: "Already ticketized", status: "ready" as const, orchestrationTaskId: "task-1" },
          { ...base, id: "card-3", title: "Needs info", status: "draft" as const, candidateStatus: "needs_clarification" as const },
        ],
        sources: [],
        questions: [],
        proposals: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    expect(projectBoardReadyTicketizationCards(board).map((card) => card.id)).toEqual(["card-1"]);
    expect(projectBoardCreateReadyTasksState(board)).toMatchObject({
      count: 1,
      disabled: false,
      label: "Create 1 Ready Task",
    });
    expect(projectBoardCreateReadyTasksState(board, true)).toMatchObject({
      count: 1,
      disabled: true,
      label: "Creating Tasks",
    });
    expect(projectBoardCreateReadyTasksState({ ...board, status: "draft" })).toMatchObject({
      count: 0,
      disabled: true,
      label: "Create Ready Tasks",
      title: expect.stringContaining("Activate the project charter"),
    });

    const kickoffDefaultsBoard = {
      ...board,
      synthesisRuns: [
        {
          id: "run-kickoff",
          boardId: board.id,
          status: "running" as const,
          stage: "kickoff_defaults" as const,
          sourceCount: 1,
          includedSourceCount: 1,
          sourceCharCount: 100,
          warningCount: 0,
          events: [],
          startedAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    expect(projectBoardHasActiveSynthesisRun(kickoffDefaultsBoard)).toBe(false);
    expect(projectBoardCreateReadyTasksState(kickoffDefaultsBoard)).toMatchObject({
      count: 1,
      disabled: false,
      label: "Create 1 Ready Task",
    });

    const planningBoard = {
      ...board,
      synthesisRuns: [
        {
          id: "run-1",
          boardId: board.id,
          status: "running" as const,
          stage: "model_request" as const,
          sourceCount: 1,
          includedSourceCount: 1,
          sourceCharCount: 100,
          warningCount: 0,
          events: [],
          startedAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    expect(projectBoardHasActiveSynthesisRun(planningBoard)).toBe(true);
    expect(projectBoardPlanningSnapshotTicketizationState(planningBoard)).toMatchObject({
      kind: "planning_running",
      label: "Planning running",
      statusLabel: "Locked",
      readyCount: 1,
      ticketizedCount: 1,
    });
    expect(projectBoardCreateReadyTasksState(planningBoard)).toMatchObject({
      count: 1,
      disabled: true,
      label: "Create Ready Tasks",
      title: expect.stringContaining("Wait for board planning to finish or pause"),
    });

    const pauseRequestedBoard = {
      ...planningBoard,
      synthesisRuns: planningBoard.synthesisRuns.map((run) => ({ ...run, status: "pause_requested" as const })),
    };
    expect(projectBoardHasActiveSynthesisRun(pauseRequestedBoard)).toBe(true);
    expect(projectBoardCreateReadyTasksState(pauseRequestedBoard)).toMatchObject({
      count: 1,
      disabled: true,
      label: "Create Ready Tasks",
    });

    const pausedBoard = {
      ...planningBoard,
      synthesisRuns: planningBoard.synthesisRuns.map((run) => ({
        ...run,
        status: "paused" as const,
        stage: "paused" as const,
      })),
    };
    expect(projectBoardHasActiveSynthesisRun(pausedBoard)).toBe(false);
    const snapshotReadyBoard = {
      ...pausedBoard,
      cards: [{ ...base, id: "card-4", title: "Snapshot ready task", status: "draft" as const }],
    };
    expect(projectBoardPlanningSnapshotTicketizationState(snapshotReadyBoard)).toMatchObject({
      kind: "snapshot_ready",
      label: "Snapshot ready",
      statusLabel: "Ready",
      readyCount: 1,
      ticketizedCount: 0,
    });
    expect(projectBoardCreateReadyTasksState(pausedBoard)).toMatchObject({
      count: 1,
      disabled: false,
      label: "Create 1 Ready Task",
    });

    const uncapturedSynthesisBoard = {
      ...board,
      cards: [
        {
          ...base,
          id: "card-synth",
          title: "Generated draft",
          status: "draft" as const,
          sourceKind: "board_synthesis" as const,
          sourceId: "synthesis:generated",
        },
      ],
    };
    expect(projectBoardCreateReadyTasksState(uncapturedSynthesisBoard)).toMatchObject({
      count: 1,
      disabled: true,
      title: expect.stringContaining("Complete or pause board planning"),
    });

    const staleSnapshotBoard = {
      ...uncapturedSynthesisBoard,
      synthesisRuns: [
        {
          id: "run-stable",
          boardId: board.id,
          status: "succeeded" as const,
          stage: "board_applied" as const,
          sourceCount: 1,
          includedSourceCount: 1,
          sourceCharCount: 100,
          warningCount: 0,
          planningSnapshots: [
            {
              id: "snapshot-stale",
              boardId: board.id,
              runId: "run-stable",
              kind: "final" as const,
              planningStatus: "succeeded" as const,
              planningStage: "board_applied" as const,
              createdAt: "2026-01-01T00:00:00.000Z",
              cardCount: 1,
              readyCandidateCount: 1,
              ticketizedCount: 0,
              sourceHashes: [],
              cardIds: ["other-card"],
              cards: [],
              renderFingerprint: "planning-snapshot-stale",
            },
          ],
          events: [],
          startedAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    expect(projectBoardCreateReadyTasksState(staleSnapshotBoard)).toMatchObject({
      count: 1,
      disabled: true,
      title: expect.stringContaining("newer than the latest stable planning snapshot"),
    });
    expect(
      projectBoardCreateReadyTasksState({
        ...staleSnapshotBoard,
        synthesisRuns: staleSnapshotBoard.synthesisRuns.map((run) => ({
          ...run,
          planningSnapshots: run.planningSnapshots?.map((snapshot) => ({ ...snapshot, cardIds: ["card-synth"] })),
        })),
      }),
    ).toMatchObject({
      count: 1,
      disabled: false,
      label: "Create 1 Ready Task",
    });

    const uxMockBoard = {
      ...board,
      cards: [
        {
          ...base,
          id: "mock",
          title: "Create UX mock for approval",
          status: "draft" as const,
          sourceKind: "board_synthesis" as const,
          sourceId: "synthesis:ux-mock-approval",
          labels: ["ux-mock-approval"],
          uiMockRole: "mock_gate" as const,
        },
        {
          ...base,
          id: "dashboard",
          title: "Implement dashboard UI",
          status: "draft" as const,
          sourceKind: "board_synthesis" as const,
          sourceId: "synthesis:dashboard",
          labels: ["frontend", "ux-mock-gated"],
          blockedBy: ["synthesis:ux-mock-approval"],
          uiMockRole: "gated_implementation" as const,
          requiresUiMockApproval: true,
        },
      ],
      synthesisRuns: staleSnapshotBoard.synthesisRuns.map((run) => ({
        ...run,
        planningSnapshots: run.planningSnapshots?.map((snapshot) => ({ ...snapshot, cardIds: ["mock"] })),
      })),
    };
    expect(projectBoardReadyTicketizationCards(uxMockBoard).map((card) => card.id)).toEqual(["mock"]);
    expect(projectBoardCreateReadyTasksState(uxMockBoard)).toMatchObject({
      count: 1,
      disabled: false,
      label: "Create 1 Ready Task",
    });

    const uxMockDoneBoard = {
      ...uxMockBoard,
      cards: uxMockBoard.cards.map((card) => (card.id === "mock" ? { ...card, status: "done" as const } : card)),
      synthesisRuns: staleSnapshotBoard.synthesisRuns.map((run) => ({
        ...run,
        planningSnapshots: run.planningSnapshots?.map((snapshot) => ({ ...snapshot, cardIds: ["dashboard"] })),
      })),
    };
    expect(projectBoardReadyTicketizationCards(uxMockDoneBoard).map((card) => card.id)).toEqual(["dashboard"]);
    expect(projectBoardCreateReadyTasksState(uxMockDoneBoard)).toMatchObject({
      count: 1,
      disabled: false,
      label: "Create 1 Ready Task",
    });
    const approvedUxMockPreview = projectBoardDraftInboxCreateReadyPreview(uxMockDoneBoard);
    expect(approvedUxMockPreview.ticketizableCards.map((card) => card.id)).toEqual(["dashboard"]);
    expect(approvedUxMockPreview.skippedCards.find((item) => item.card.id === "dashboard")).toBeUndefined();
    expect(projectBoardUiMockReviewBadges(uxMockDoneBoard.cards[1], uxMockDoneBoard.cards)).toEqual([
      { label: "UX Mock", value: "Approved", tone: "done" },
    ]);

    const missingTypedMockGateBoard = {
      ...board,
      cards: [
        {
          ...base,
          id: "dashboard",
          title: "Implement dashboard UI",
          status: "draft" as const,
          sourceKind: "board_synthesis" as const,
          sourceId: "synthesis:dashboard",
          labels: ["frontend"],
          uiMockRole: "gated_implementation" as const,
          requiresUiMockApproval: true,
        },
      ],
    };
    expect(projectBoardReadyTicketizationCards(missingTypedMockGateBoard)).toEqual([]);
    expect(projectBoardCreateReadyTasksState(missingTypedMockGateBoard)).toMatchObject({
      count: 0,
      disabled: true,
      title: expect.stringContaining("waiting for UX mock approval"),
    });
    expect(
      projectBoardDraftInboxCreateReadyPreview(uxMockBoard)
        .skippedCards.find((item) => item.card.id === "dashboard")
        ?.reasons,
    ).toContain("Approve UX mock before creating UI implementation tasks.");
    expect(projectBoardUiMockReviewBadges(uxMockBoard.cards[0], uxMockBoard.cards)).toEqual([
      { label: "UX Mock", value: "Approval gate", tone: "warning" },
    ]);
    expect(projectBoardUiMockReviewBadges(uxMockBoard.cards[1], uxMockBoard.cards)).toEqual([
      { label: "UX Mock", value: "Waiting approval", tone: "blocked" },
    ]);
    const dashboardDetail = projectBoardActiveCardDetail(uxMockBoard.cards[1], uxMockBoard.cards, [], []);
    const dashboardOverview = projectBoardActiveCardOverviewModel(
      uxMockBoard.cards[1],
      { sources: [] },
      dashboardDetail,
      projectBoardExecutionControlModel(uxMockBoard.cards[1], { events: [] }, dashboardDetail),
    );
    expect(dashboardOverview.badges).toEqual(expect.arrayContaining([{ label: "UX Mock", value: "Waiting approval", tone: "blocked" }]));
    const mockReviewCard = {
      ...uxMockBoard.cards[0],
      status: "review" as const,
      orchestrationTaskId: "task-mock",
      proofReview: {
        status: "ready_for_review" as const,
        summary: "HTML mock is ready for approval.",
        satisfied: ["Mock artifact exists."],
        missing: [],
        followUpCardIds: [],
        runId: "run-mock",
        reviewedAt: "2026-01-01T00:10:00.000Z",
        recommendedAction: "ask_user" as const,
      },
    };
    const mockRun: OrchestrationRun = {
      id: "run-mock",
      taskId: "task-mock",
      attemptNumber: 0,
      status: "completed",
      workspacePath: "/workspace/app/.ambient-codex/orchestration/workspaces/LOCAL-MOCK",
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:05:00.000Z",
      proofOfWork: { changedFiles: ["mockups/dashboard-review.html", "mockups/dashboard-review.css"] },
    };
    const mockProofDecision = projectBoardProofDecisionModel(
      mockReviewCard,
      {},
      {
        id: "task-mock",
        identifier: "LOCAL-MOCK",
        title: "Create UX mock for approval",
        state: "needs_review",
        labels: [],
        blockedBy: [],
        sourceKind: "project_board_card",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:05:00.000Z",
      },
      mockRun,
    );
    expect(projectBoardUiMockReviewPanelModel(mockReviewCard, mockRun, mockProofDecision)).toMatchObject({
      visible: true,
      statusLabel: "Ready for review",
      headline: "Review UX mock artifact",
      previewPath: "mockups/dashboard-review.html",
      actions: [
        { action: "accept_done", label: "Approve mock", disabled: false },
        { action: "retry", label: "Request revision", disabled: false },
        { action: "mark_blocked", label: "Reject mock", disabled: false },
      ],
    });
    const approvedMockProofDecision = projectBoardProofDecisionModel(
      { ...mockReviewCard, status: "done" as const },
      {},
      {
        id: "task-mock",
        identifier: "LOCAL-MOCK",
        title: "Create UX mock for approval",
        state: "done",
        labels: [],
        blockedBy: [],
        sourceKind: "project_board_card",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:05:00.000Z",
      },
      mockRun,
    );
    expect(projectBoardUiMockReviewPanelModel({ ...mockReviewCard, status: "done" as const }, mockRun, approvedMockProofDecision)).toMatchObject({
      visible: true,
      statusLabel: "Mock approved",
      headline: "UX mock approved",
      actions: [{ action: "retry", label: "Request revision", disabled: true }],
    });
    const rejectedMockBoard = {
      ...uxMockBoard,
      cards: uxMockBoard.cards.map((card) =>
        card.id === "mock"
          ? {
              ...card,
              status: "blocked" as const,
              orchestrationTaskId: "task-mock",
              proofReview: {
                status: "terminally_blocked" as const,
                summary: "Mock rejected by PM review.",
                satisfied: [],
                missing: ["Navigation treatment is unclear."],
                followUpCardIds: [],
                runId: "run-mock",
                reviewedAt: "2026-01-01T00:20:00.000Z",
                recommendedAction: "block" as const,
              },
            }
          : card,
      ),
      synthesisRuns: staleSnapshotBoard.synthesisRuns.map((run) => ({
        ...run,
        planningSnapshots: run.planningSnapshots?.map((snapshot) => ({ ...snapshot, cardIds: ["dashboard"] })),
      })),
    };
    expect(projectBoardReadyTicketizationCards(rejectedMockBoard)).toEqual([]);
    expect(projectBoardCreateReadyTasksState(rejectedMockBoard)).toMatchObject({
      count: 0,
      disabled: true,
      title: expect.stringContaining("waiting for UX mock approval"),
    });
    expect(projectBoardUiMockReviewBadges(rejectedMockBoard.cards[1], rejectedMockBoard.cards)).toEqual([
      { label: "UX Mock", value: "Waiting approval", tone: "blocked" },
    ]);

    const ticketizedBoard = {
      ...snapshotReadyBoard,
      cards: snapshotReadyBoard.cards.map((card) => ({ ...card, status: "ready" as const, orchestrationTaskId: "task-1" })),
    };
    expect(projectBoardPlanningSnapshotTicketizationState(ticketizedBoard)).toMatchObject({
      kind: "snapshot_ticketized",
      label: "Snapshot ticketized",
      statusLabel: "Protected",
      readyCount: 0,
      ticketizedCount: 1,
    });

    const additiveProposalBoard = {
      ...ticketizedBoard,
      cards: [
        ...ticketizedBoard.cards,
        {
          ...base,
          id: "card-7",
          title: "Additive task",
          status: "draft" as const,
          candidateStatus: "ready_to_create" as const,
          sourceId: "synthesis-additive",
        },
      ],
    };
    expect(projectBoardPlanningSnapshotTicketizationState(additiveProposalBoard)).toMatchObject({
      kind: "new_proposal_available",
      label: "New proposal available",
      statusLabel: "Review additive drafts",
      readyCount: 1,
      draftCandidateCount: 1,
      ticketizedCount: 1,
    });

    const remotelyClaimed = {
      ...board,
      cards: [
        {
          ...board.cards[0],
          claim: {
            status: "active" as const,
            cardId: "card-1",
            runId: "run-1",
            agentId: "desktop-b",
            eventId: "evt-1",
            claimedAt: "2026-01-01T00:00:00.000Z",
            leaseUntil: "2099-01-01T00:00:00.000Z",
            ownedByLocal: false,
          },
        },
      ],
    };
    expect(projectBoardReadyTicketizationCards(remotelyClaimed)).toEqual([]);
    expect(projectBoardCardClaimBlocksLocalTicketization(remotelyClaimed.cards[0])).toBe(true);
    expect(projectBoardCardClaimLabel(remotelyClaimed.cards[0])).toBe("Claimed by desktop-b");
    expect(projectBoardCreateReadyTasksState(remotelyClaimed)).toMatchObject({
      count: 0,
      disabled: true,
      title: expect.stringContaining("claimed or conflicted"),
    });
  });

  it("models the board execution overview next action", () => {
    const base = {
      boardId: "board-1",
      description: "",
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Do the work."],
      testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as ProjectBoardCard["sourceKind"],
      sourceId: "artifact-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const boardForCards = (
      cards: Array<
        typeof base & {
          id: string;
          title: string;
          status: "draft" | "ready" | "in_progress" | "review" | "blocked" | "done";
          orchestrationTaskId?: string;
          runFeedback?: ProjectBoardCard["runFeedback"];
          pendingPiUpdate?: ProjectBoardCard["pendingPiUpdate"];
          sourceRefs?: ProjectBoardCard["sourceRefs"];
          clarificationQuestions?: ProjectBoardCard["clarificationQuestions"];
          clarificationDecisions?: ProjectBoardCard["clarificationDecisions"];
          clarificationSuggestions?: ProjectBoardCard["clarificationSuggestions"];
          clarificationAnswers?: ProjectBoardCard["clarificationAnswers"];
        }
      >,
      events: ProjectBoardEvent[] = [],
    ) =>
      project({
        board: {
          id: "board-1",
          projectPath: "/workspace/app",
          status: "active",
          title: "App board",
          summary: "",
          cards,
          sources: [],
          questions: [],
          proposals: [],
          events,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      }).board!;

    const staleDraftCard = { ...base, id: "draft-ready", title: "Ready draft", status: "draft" as const };
    const draftKickoffBoard = boardSummary({
      status: "draft",
      cards: [staleDraftCard],
      questions: [
        {
          id: "question-1",
          boardId: "board-1",
          question: "What is the project goal?",
          required: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    expect(projectBoardExecutionOverview(draftKickoffBoard)).toMatchObject({
      state: "draft",
      headline: "Finish the charter before execution starts",
      action: { action: "open_charter", label: "Answer Kickoff Questions" },
    });
    expect(projectBoardExecutionReadinessRail(draftKickoffBoard)).toMatchObject({
      nextActionSummary: "Click Answer Kickoff Questions",
      action: { action: "open_charter", label: "Answer Kickoff Questions" },
    });
    expect(projectBoardTabs(draftKickoffBoard).find((tab) => tab.id === "draft_inbox")).toMatchObject({ count: 0 });
    expect(projectBoardTabs(draftKickoffBoard).find((tab) => tab.id === "map")).toMatchObject({ count: 0 });
    expect(projectBoardDraftInboxCreateReadyPreview(draftKickoffBoard)).toMatchObject({
      totalCandidateCount: 0,
      ticketizableCards: [],
      markReadyCards: [],
    });
    expect(projectBoardDraftColumns(draftKickoffBoard.cards, { board: draftKickoffBoard }).flatMap((column) => column.cards)).toEqual([]);
    expect(projectBoardReadyTicketizationCards(draftKickoffBoard)).toEqual([]);

    const activeWithDraftCard = { ...draftKickoffBoard, status: "active" as const };
    expect(projectBoardTabs(activeWithDraftCard).find((tab) => tab.id === "draft_inbox")).toMatchObject({ count: 1 });
    expect(projectBoardDraftInboxCreateReadyPreview(activeWithDraftCard).totalCandidateCount).toBe(1);

    const draftReadyBoard = boardForCards([{ ...base, id: "draft-ready", title: "Ready draft", status: "draft", sourceKind: "manual" as const }]);
    expect(projectBoardExecutionOverview(draftReadyBoard)).toMatchObject({
      state: "create_tasks",
      headline: "Create 1 ready Local Task",
      action: { action: "open_draft_inbox", label: "Open Draft Inbox" },
    });
    const plannerSeedBoard = boardForCards([{ ...base, id: "planner-seed", title: "Durable plan seed", status: "draft" }]);
    expect(projectBoardExecutionOverview(plannerSeedBoard)).toMatchObject({
      state: "source_synthesis_needed",
      blockerKind: "needs_source_synthesis",
      headline: "Run source planning before ticketization",
      action: { action: "open_source_picker", label: "Add Cards From Sources" },
      metrics: expect.arrayContaining([
        { label: "Plan seed", value: 1 },
        { label: "Synthesized cards", value: 0 },
      ]),
    });
    expect(projectBoardExecutionReadinessRail(plannerSeedBoard)).toMatchObject({
      blockerKind: "needs_source_synthesis",
      headline: "Run source planning before ticketization",
      nextActionSummary: "Click Add Cards From Sources",
      action: { action: "open_source_picker", label: "Add Cards From Sources" },
    });
    const decisionBlockedDraftBoard = boardForCards([
      {
        ...base,
        id: "draft-needs-decision",
        title: "Preview container decision",
        status: "draft",
        clarificationQuestions: ["Should the preview use a div or sandboxed iframe?"],
      },
    ]);
    expect(projectBoardExecutionOverview(decisionBlockedDraftBoard)).toMatchObject({
      state: "decisions_blocked",
      blockerKind: "decision_blocked",
      headline: "Answer 1 PM decision",
      action: { action: "open_decisions", label: "Answer Decisions" },
      metrics: expect.arrayContaining([
        { label: "Decisions", value: 1 },
        { label: "Draft candidates", value: 1 },
      ]),
    });
    expect(projectBoardExecutionReadinessRail(decisionBlockedDraftBoard)).toMatchObject({
      visible: true,
      tone: "warning",
      blockerKind: "decision_blocked",
      headline: "Answer 1 PM decision",
      pendingSummary: "1 decision, 1 draft candidate",
      nextActionSummary: "Click Answer Decisions",
      action: { action: "open_decisions", label: "Answer Decisions" },
    });
    const planningDraftReadyBoard = {
      ...draftReadyBoard,
      synthesisRuns: [
        {
          id: "run-planning",
          boardId: draftReadyBoard.id,
          status: "running" as const,
          stage: "source_classification" as const,
          sourceCount: 2,
          includedSourceCount: 2,
          sourceCharCount: 8391,
          warningCount: 0,
          events: [],
          startedAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    expect(projectBoardExecutionOverview(planningDraftReadyBoard)).toMatchObject({
      state: "planning_running",
      headline: "Planning is still running",
      metrics: expect.arrayContaining([
        { label: "Planning", value: 1 },
        { label: "Draft ready", value: 1 },
      ]),
    });
    expect(projectBoardExecutionOverview(planningDraftReadyBoard).action).toBeUndefined();
    expect(projectBoardExecutionReadinessRail(planningDraftReadyBoard)).toMatchObject({
      blockerKind: "planning_running",
      headline: "Planning is still running",
      pendingSummary: "1 planning, 1 draft ready",
      nextActionSummary: "Wait for planning to finish",
    });

    const finishedPlanningDraftReadyBoard = {
      ...planningDraftReadyBoard,
      synthesisRuns: planningDraftReadyBoard.synthesisRuns.map((run) => ({ ...run, status: "succeeded" as const })),
    };
    expect(projectBoardExecutionOverview(finishedPlanningDraftReadyBoard)).toMatchObject({
      state: "create_tasks",
      action: { action: "open_draft_inbox", label: "Open Draft Inbox" },
    });

    const readyBoard = boardForCards([{ ...base, id: "ready-card", title: "Ready executable", status: "ready", orchestrationTaskId: "task-1" }]);
    const readyTask = {
      id: "task-1",
      identifier: "LOCAL-1",
      title: "Ready executable",
      state: "ready",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(projectBoardExecutionOverview(readyBoard, [readyTask], [])).toMatchObject({
      state: "prepare_run",
      action: { action: "prepare_run", label: "Prepare Next Run", cardId: "ready-card" },
    });
    expect(projectBoardExecutionReadinessRail(readyBoard, [readyTask], [])).toMatchObject({
      visible: true,
      tone: "warning",
      blockerKind: "ready_not_prepared",
      headline: "Prepare 1 ready Local Task",
      doneSummary: "No completed work yet",
      pendingSummary: "1 ready",
      nextActionSummary: "Click Prepare Next Run",
      metrics: expect.arrayContaining([{ label: "Done", value: 0 }]),
      action: { action: "prepare_run", label: "Prepare Next Run", cardId: "ready-card" },
    });
    const gitReadyStatus: ProjectBoardGitSyncStatus = {
      boardId: "board-1",
      projectRoot: "/workspace/app",
      artifactRoot: "/workspace/app/.ambient/board",
      isGitRepository: true,
      repoRoot: "/workspace/app",
      branch: "main",
      hasCommit: true,
      remote: "origin",
      hasRemote: true,
      upstream: "origin/main",
      ahead: 0,
      behind: 0,
      dirtyBoardFileCount: 0,
      dirtyBoardFiles: [],
      mode: "git_ready",
      projection: {
        ok: true,
        valid: true,
        differenceCount: 0,
        differences: [],
        fileCount: 4,
        cardCount: 1,
        sourceCount: 0,
        eventCount: 0,
        proposalRunCount: 0,
        activeClaimCount: 0,
        expiredClaimCount: 0,
        claimConflictCount: 0,
      },
    };
    expect(
      projectBoardExecutionReadinessRail(readyBoard, [readyTask], [], {
        gitStatus: { ...gitReadyStatus, hasRemote: false, remote: undefined, upstream: undefined, mode: "git_no_remote" },
      }),
    ).toMatchObject({
      visible: true,
      blockerKind: "ready_not_prepared",
      secondary: {
        tone: "warning",
        blockerKind: "git_no_remote",
        headline: "Git exists, but collaboration is local",
      },
    });
    expect(
      projectBoardExecutionOverview(readyBoard, [readyTask], [], {
        gitStatus: {
          ...gitReadyStatus,
          projection: {
            ...gitReadyStatus.projection!,
            ok: false,
            valid: false,
            differenceCount: 1,
            differences: ["Invalid .ambient/board/config.json"],
          },
        },
      }),
    ).toMatchObject({
      state: "collaboration_blocked",
      blockerKind: "projection_invalid",
      headline: "Pulled board projection is invalid",
      action: { action: "open_board", label: "Review Git Blocker" },
    });
    expect(
      projectBoardExecutionOverview(readyBoard, [readyTask], [], {
        orchestrationError: "Workflow file not found: /workspace/app/WORKFLOW.md",
      }),
    ).toMatchObject({
      state: "workflow_blocked",
      headline: "Create WORKFLOW.md before ready work can run",
      action: { action: "prepare_run", label: "Create Workflow + Prepare", cardId: "ready-card" },
    });
    expect(
      projectBoardExecutionReadinessRail(readyBoard, [readyTask], [], {
        orchestrationError: "Workflow file not found: /workspace/app/WORKFLOW.md",
      }),
    ).toMatchObject({
      visible: true,
      tone: "danger",
      blockerKind: "missing_workflow",
      headline: "Create WORKFLOW.md before ready work can run",
    });
    expect(
      projectBoardExecutionReadinessRail(readyBoard, [readyTask], [], {
        workflowReadiness: {
          status: "missing",
          path: "/workspace/app/WORKFLOW.md",
          checkedAt: "2026-01-01T00:00:00.000Z",
          warnings: [],
        },
      }),
    ).toMatchObject({
      visible: true,
      tone: "danger",
      blockerKind: "missing_workflow",
      headline: "Create WORKFLOW.md before ready work can run",
    });
    expect(
      projectBoardExecutionReadinessRail(readyBoard, [readyTask], [], {
        workflowReadiness: {
          status: "ready",
          path: "/workspace/app/WORKFLOW.md",
          checkedAt: "2026-01-01T00:00:00.000Z",
          warnings: [],
          autoDispatch: false,
        },
      }),
    ).toMatchObject({
      visible: true,
      tone: "warning",
      blockerKind: "auto_dispatch_disabled",
      headline: "Auto-dispatch is off; prepare manually",
      nextActionSummary: "Click Prepare Next Run",
      action: { action: "prepare_run", label: "Prepare Next Run", cardId: "ready-card" },
    });
    expect(
      projectBoardExecutionReadinessRail(readyBoard, [readyTask], [], {
        workflowReadiness: {
          status: "ready",
          path: "/workspace/app/WORKFLOW.md",
          checkedAt: "2026-01-01T00:00:00.000Z",
          warnings: [],
          autoDispatch: true,
          workspaceStrategy: "git-worktree",
        },
        gitStatus: { ...gitReadyStatus, hasCommit: false, hasRemote: false, remote: undefined, upstream: undefined, mode: "git_no_remote" },
      }),
    ).toMatchObject({
      visible: true,
      tone: "danger",
      blockerKind: "git_unborn",
      headline: "Commit project before preparing worktrees",
      action: { action: "open_board", label: "Review Git Setup" },
    });

    const preparedRun = {
      id: "run-1",
      taskId: "task-1",
      attemptNumber: 0,
      status: "prepared",
      workspacePath: "/workspace/app/.ambient/runs/run-1",
      startedAt: "2026-01-01T00:05:00.000Z",
    };
    expect(projectBoardExecutionOverview(readyBoard, [readyTask], [preparedRun])).toMatchObject({
      state: "start_run",
      headline: "Prepared run is queued",
      action: { action: "start_run", label: "Start Run", runId: "run-1", cardId: "ready-card" },
    });

    const doneBoard = boardForCards([{ ...base, id: "done-card", title: "Done executable", status: "done", orchestrationTaskId: "task-1" }]);
    const doneTask = { ...readyTask, state: "done" as const };
    const doneOverview = projectBoardExecutionOverview(doneBoard, [doneTask], [{ ...preparedRun, status: "failed" }]);
    expect(doneOverview).toMatchObject({
      state: "complete",
      headline: "Executable board is closed",
    });
    expect(doneOverview.action).toBeUndefined();
    const completedDeliverableRun = {
      ...preparedRun,
      status: "completed",
      proofOfWork: { changedFiles: ["index.html", "app.js", ".ambient/runtime.json", "node_modules/cache/index.js"] },
    };
    const pendingIntegrationOverview = projectBoardExecutionOverview(doneBoard, [doneTask], [completedDeliverableRun]);
    expect(pendingIntegrationOverview).toMatchObject({
      state: "integration_pending",
      headline: "Executable board closed; integration pending",
      metrics: expect.arrayContaining([{ label: "Pending integration", value: 1 }]),
      action: { action: "open_integration", label: "Open Integration" },
    });
    expect(projectBoardExecutionReadinessRail(doneBoard, [doneTask], [completedDeliverableRun])).toMatchObject({
      visible: true,
      tone: "warning",
      blockerKind: "integration_pending",
      headline: "Executable board closed; integration pending",
      doneSummary: "1 done",
      pendingSummary: "1 pending integration",
      nextActionSummary: "Click Open Integration",
      action: { action: "open_integration", label: "Open Integration" },
    });
    const doneWithReadyDraftBoard = boardForCards([
      { ...base, id: "done-card", title: "Done executable", status: "done", orchestrationTaskId: "task-1" },
      { ...base, id: "draft-next", title: "Next draft", status: "draft" },
    ]);
    expect(projectBoardExecutionOverview(doneWithReadyDraftBoard, [doneTask], [completedDeliverableRun])).toMatchObject({
      state: "create_tasks",
      headline: "Create 1 ready Local Task",
      metrics: expect.arrayContaining([
        { label: "Draft ready", value: 1 },
        { label: "Pending integration", value: 1 },
      ]),
      action: { action: "open_draft_inbox", label: "Open Draft Inbox" },
    });
    expect(projectBoardExecutionReadinessRail(doneWithReadyDraftBoard, [doneTask], [completedDeliverableRun])).toMatchObject({
      visible: true,
      tone: "warning",
      blockerKind: "needs_ticketization",
      headline: "Create 1 ready Local Task",
      doneSummary: "1 done",
      pendingSummary: "1 draft ready, 1 pending integration",
      nextActionSummary: "Click Open Draft Inbox",
      action: { action: "open_draft_inbox", label: "Open Draft Inbox" },
    });
    const doneWithReadyDraftAndPlanningBoard = {
      ...doneWithReadyDraftBoard,
      synthesisRuns: planningDraftReadyBoard.synthesisRuns,
    };
    expect(projectBoardExecutionOverview(doneWithReadyDraftAndPlanningBoard, [doneTask], [completedDeliverableRun])).toMatchObject({
      state: "planning_running",
      headline: "Planning is still running",
      metrics: expect.arrayContaining([
        { label: "Planning", value: 1 },
        { label: "Draft ready", value: 1 },
        { label: "Pending integration", value: 1 },
      ]),
    });
    expect(projectBoardExecutionReadinessRail(doneWithReadyDraftAndPlanningBoard, [doneTask], [completedDeliverableRun])).toMatchObject({
      visible: true,
      blockerKind: "planning_running",
      headline: "Planning is still running",
      doneSummary: "1 done",
      pendingSummary: "1 planning, 1 draft ready, 1 pending integration",
      nextActionSummary: "Wait for planning to finish",
    });
    expect(
      projectBoardOverviewModel(doneBoard, {
        tasks: [doneTask],
        runs: [completedDeliverableRun],
      }).steps.find((step) => step.id === "board"),
    ).toMatchObject({
      statusLabel: "Executable board closed; integration pending",
      actionLabel: "Open Integration",
      tone: "warning",
    });
    const integratedDoneBoard = boardForCards(
      [{ ...base, id: "done-card", title: "Done executable", status: "done", orchestrationTaskId: "task-1" }],
      [
        {
          id: "event-deliverable-integrated",
          boardId: "board-1",
          kind: "deliverable_integration_resolved",
          title: "Deliverables applied to project root",
          summary: "2 files applied.",
          entityKind: "orchestration_run",
          entityId: completedDeliverableRun.id,
          metadata: {
            runId: completedDeliverableRun.id,
            taskId: doneTask.id,
            cardId: "done-card",
            action: "apply_to_root",
            status: "integrated",
            materialFiles: ["index.html", "app.js"],
            excludedFiles: [".ambient/runtime.json", "node_modules/cache/index.js"],
            appliedFiles: ["index.html", "app.js"],
            skippedFiles: [],
          },
          createdAt: "2026-01-01T00:10:00.000Z",
        },
      ],
    );
    expect(projectBoardExecutionOverview(integratedDoneBoard, [doneTask], [completedDeliverableRun])).toMatchObject({
      state: "complete",
      headline: "Executable board closed; deliverables integrated",
      detail: "All completed run deliverables have explicit integration outcomes: 1 integrated, 0 exported, and 0 deferred.",
    });
    expect(
      projectBoardWorkflowImpactPreview(doneBoard, [doneTask], [preparedRun], {
        status: "ready",
        path: "/workspace/app/WORKFLOW.md",
        checkedAt: "2026-01-01T00:00:00.000Z",
        workflowHash: "current-workflow-hash",
        warnings: [],
        autoDispatch: true,
      }),
    ).toMatchObject({ visible: false });

    expect(
      projectBoardWorkflowImpactPreview(readyBoard, [readyTask], [], {
        status: "ready",
        path: "/workspace/app/WORKFLOW.md",
        checkedAt: "2026-01-01T00:00:00.000Z",
        workflowHash: "current-workflow-hash",
        warnings: [],
        rawContent: "---\norchestration:\n  max_concurrent_agents: 2\n---\nPrompt",
        autoDispatch: true,
        maxConcurrentAgents: 2,
        maxTurns: 35,
        workspaceStrategy: "directory",
        proofOfWork: { requireTests: true, requireDiffSummary: true, requireScreenshots: false },
      }),
    ).toMatchObject({
      visible: true,
      state: "current_workflow",
      tone: "ready",
      detail: expect.stringContaining("Existing cards, PM proof, and board history are preserved"),
      modelCallRequired: false,
      affectedCardIds: ["ready-card"],
      settings: {
        autoDispatch: true,
        maxConcurrentAgents: 2,
        maxTurns: 35,
        workspaceStrategy: "directory",
        requireTests: true,
        requireDiffSummary: true,
        requireScreenshots: false,
      },
      rawEditor: {
        markdown: expect.stringContaining("max_concurrent_agents: 2"),
        lineCount: 5,
        truncated: false,
      },
      metrics: expect.arrayContaining([{ label: "Model calls", value: "0", title: expect.any(String) }]),
      actions: expect.arrayContaining([expect.objectContaining({ action: "prepare_next", label: "Prepare next" })]),
    });
    expect(
      projectBoardWorkflowImpactPreview(readyBoard, [readyTask], [], {
        status: "invalid",
        path: "/workspace/app/WORKFLOW.md",
        checkedAt: "2026-01-01T00:00:00.000Z",
        code: "workflow_validation_error",
        message: "orchestration.max_concurrent_agents must be positive",
        warnings: [],
        repairPreview: {
          workspaceStrategy: "directory",
          currentText: "---\norchestration:\n  max_concurrent_agents: 0\n---\nPrompt",
          proposedText:
            "---\nversion: 1\norchestration:\n  auto_dispatch: true\n  max_concurrent_agents: 1\n---\nWork on Local Task {{ task.identifier }}.",
          diff:
            "diff --git a/WORKFLOW.md b/WORKFLOW.md\n--- a/WORKFLOW.md\n+++ b/WORKFLOW.md\n@@ -1,5 +1,7 @@\n ---\n+version: 1\n orchestration:\n-  max_concurrent_agents: 0\n+  auto_dispatch: true\n+  max_concurrent_agents: 1\n ---\n-Prompt\n+Work on Local Task {{ task.identifier }}.\n",
          currentLineCount: 5,
          proposedLineCount: 7,
        },
      }),
    ).toMatchObject({
      visible: true,
      state: "workflow_unavailable",
      tone: "danger",
      detail: expect.stringContaining("Existing cards, PM proof, and board history are preserved"),
      modelCallRequired: false,
      repairPreview: {
        validationMessage: "orchestration.max_concurrent_agents must be positive",
        workspaceStrategy: "directory",
        currentLineCount: 5,
        proposedLineCount: 7,
        currentTextTruncated: false,
        diffTruncated: false,
        diff: expect.stringContaining("-  max_concurrent_agents: 0"),
      },
      actions: expect.arrayContaining([
        expect.objectContaining({ action: "restore_generated_default", label: "Restore default workflow" }),
        expect.objectContaining({ action: "use_existing_anyway", label: "Keep file for now" }),
      ]),
    });
    expect(
      projectBoardWorkflowImpactPreview(
        readyBoard,
        [readyTask],
        [
          {
            ...preparedRun,
            proofOfWork: {
              kind: "preparation",
              workflowHash: "old-workflow-hash",
              workflowPath: "/workspace/app/WORKFLOW.md",
            },
          },
        ],
        {
          status: "ready",
          path: "/workspace/app/WORKFLOW.md",
          checkedAt: "2026-01-01T00:00:00.000Z",
          workflowHash: "current-workflow-hash",
          warnings: [],
          autoDispatch: true,
        },
      ),
    ).toMatchObject({
      visible: true,
      state: "prepared_workflow_stale",
      tone: "warning",
      detail: expect.stringContaining("Existing cards, PM proof, and board history are preserved"),
      modelCallRequired: false,
      affectedCardIds: ["ready-card"],
      affectedRunIds: ["run-1"],
      actions: expect.arrayContaining([
        expect.objectContaining({ action: "continue_old_prep", label: "Continue old prep" }),
        expect.objectContaining({ action: "prepare_again", label: "Prepare again" }),
      ]),
    });
    expect(
      projectBoardWorkflowImpactPreview(readyBoard, [readyTask], [preparedRun], {
        status: "ready",
        path: "/workspace/app/WORKFLOW.md",
        checkedAt: "2026-01-01T00:00:00.000Z",
        workflowHash: "current-workflow-hash",
        warnings: [],
        autoDispatch: true,
      }),
    ).toMatchObject({
      visible: true,
      state: "prepared_workflow_unknown",
      tone: "warning",
      detail: expect.stringContaining("Existing cards, PM proof, and board history are preserved"),
      modelCallRequired: false,
      affectedCardIds: ["ready-card"],
    });

    const decisionImpactEvent: ProjectBoardEvent = {
      id: "event-decision-impact",
      boardId: "board-1",
      kind: "card_updated",
      title: "Clarification decision answered",
      summary: "Decision answer affects one ready card.",
      entityKind: "project_board_card",
      entityId: "draft-card",
      metadata: {
        decisionImpact: {
          question: "What threshold should auto-shrink use?",
          affectedCardIds: ["ready-card"],
          affectedCounts: { readyFeedback: 1 },
          modelCallRequired: false,
        },
      },
      createdAt: "2026-01-01T00:10:00.000Z",
    };
    expect(projectBoardBoardDecisionImpactRail(boardForCards([{ ...base, id: "ready-card", title: "Ready executable", status: "ready", orchestrationTaskId: "task-1" }], [decisionImpactEvent]))).toMatchObject({
      visible: true,
      tone: "warning",
      needsFeedbackCount: 1,
      feedbackReadyCount: 0,
      modelCallRequired: false,
      cards: [
        expect.objectContaining({
          cardId: "ready-card",
          state: "needs_feedback",
          question: "What threshold should auto-shrink use?",
          actionLabel: "Add feedback",
        }),
      ],
    });
    expect(
      projectBoardBoardDecisionImpactRail(
        boardForCards(
          [
            {
              ...base,
              id: "ready-card",
              title: "Ready executable",
              status: "ready",
              orchestrationTaskId: "task-1",
              runFeedback: [
                {
                  id: "feedback-1",
                  source: "decision_impact",
                  feedback: "Use the accepted auto-shrink threshold on the next run.",
                  decisionQuestion: "What threshold should auto-shrink use?",
                  decisionAnswer: "Begin shrinking at 11 characters.",
                  createdAt: "2026-01-01T00:11:00.000Z",
                },
              ],
            },
          ],
          [decisionImpactEvent],
        ),
      ),
    ).toMatchObject({
      visible: true,
      tone: "ready",
      needsFeedbackCount: 0,
      feedbackReadyCount: 1,
      cards: [expect.objectContaining({ cardId: "ready-card", state: "feedback_ready", actionLabel: "Inspect feedback" })],
    });

    const sourceImpactEvent: ProjectBoardEvent = {
      id: "event-source-impact",
      boardId: "board-1",
      kind: "source_updated",
      title: "Source classification updated",
      summary: "Source change affected draft and ticketized cards.",
      entityKind: "project_board_source",
      entityId: "source-1",
      metadata: {
        sourceImpact: {
          schemaVersion: 1,
          sourceId: "source-1",
          groupSourceIds: ["source-1"],
          existingCardsRewritten: false,
          modelCallRequired: false,
          additiveSynthesisAvailable: true,
          targetedRefreshOptional: true,
          nextRunFeedbackRecommended: true,
          affectedCardIds: ["source-draft", "source-ready"],
          affectedDraftCardIds: ["source-draft"],
          affectedExecutableCardIds: ["source-ready"],
          affectedDraftCount: 1,
          affectedExecutableCount: 1,
          selectedObservationCount: 1,
          estimatedPromptChars: 240,
          recommendedAction: "add_next_run_feedback",
          detail: "Source selection updated without rewriting existing cards.",
        },
      },
      createdAt: "2026-01-01T00:12:00.000Z",
    };
    const overviewDecisionImpactEvent: ProjectBoardEvent = {
      ...decisionImpactEvent,
      id: "event-overview-decision-impact",
      metadata: {
        decisionImpact: {
          question: "What threshold should auto-shrink use?",
          affectedCardIds: ["source-ready"],
          affectedCounts: { readyFeedback: 1 },
          modelCallRequired: false,
        },
      },
      createdAt: "2026-01-01T00:11:00.000Z",
    };
    const proofImpactEvent: ProjectBoardEvent = {
      id: "event-proof-impact",
      boardId: "board-1",
      kind: "card_updated",
      title: "Proof expectations suggested",
      summary: "Pi suggested reviewable proof expectations for one card.",
      entityKind: "project_board",
      entityId: "board-1",
      metadata: {
        proofImpact: {
          schemaVersion: 1,
          appliedAction: "suggest_missing_proof",
          targetCardIds: ["missing-proof"],
          appliedCardIds: ["missing-proof"],
          pendingPiUpdateCardIds: ["missing-proof"],
          skippedCardIds: [],
          appliedProofItemCount: 2,
          missingProofCountBefore: 1,
          missingProofCountAfter: 1,
          existingCardsRewritten: false,
          modelCallRequired: true,
          promptCharCount: 1200,
        },
      },
      createdAt: "2026-01-01T00:13:00.000Z",
    };
    const overviewBoard = boardForCards(
      [
        { ...base, id: "source-draft", title: "Source draft", status: "draft", sourceId: "source-1" },
        { ...base, id: "source-ready", title: "Source ready", status: "ready", sourceId: "source-1", orchestrationTaskId: "task-source" },
        {
          ...base,
          id: "staged-card",
          title: "Staged Pi update",
          status: "draft",
          sourceId: "source-1",
          pendingPiUpdate: {
            sourceId: "source:source-1",
            createdAt: "2026-01-01T00:13:00.000Z",
            changedFields: ["description"],
            description: "Updated source-aware description.",
          },
        },
        { ...base, id: "missing-proof", title: "Missing proof", status: "draft", testPlan: { unit: [], integration: [], visual: [], manual: [] } },
      ],
      [proofImpactEvent, sourceImpactEvent, overviewDecisionImpactEvent],
    );
    const overview = projectBoardOverviewModel(overviewBoard);
    const impactQueue = projectBoardImpactQueue(overviewBoard);
    const impactAudit = projectBoardHistoryImpactAudit(overviewBoard);
    expect(projectBoardTabs(overviewBoard)[0]).toMatchObject({ id: "overview", count: expect.any(Number) });
    expect(overview.steps.map((step) => step.id)).toEqual(["charter", "decisions", "draft_inbox", "map", "board", "proof", "integration", "history"]);
    expect(impactQueue.items.map((item) => item.kind)).toEqual(expect.arrayContaining(["decision", "source", "staged_update", "proof"]));
    expect(impactQueue.items.find((item) => item.kind === "source")).toMatchObject({
      modelCallRequired: false,
      affectedCardIds: expect.arrayContaining(["source-draft", "source-ready"]),
      metrics: expect.arrayContaining([expect.objectContaining({ label: "Local Tasks", value: 1 })]),
    });
    expect(impactQueue.metrics).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Full-board Pi", value: "0" })]));
    expect(impactAudit).toMatchObject({
      activeCount: expect.any(Number),
      recordedCount: expect.any(Number),
      affectedCardCount: expect.any(Number),
      metrics: expect.arrayContaining([expect.objectContaining({ label: "Full-board Pi", value: "0" })]),
    });
    expect(impactAudit.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "active", kind: "source", title: expect.stringContaining("Source") }),
        expect.objectContaining({
          status: "recorded",
          kind: "proof",
          title: "Proof suggestions staged",
          modelCallRequired: true,
          affectedCardIds: ["missing-proof"],
          metrics: expect.arrayContaining([expect.objectContaining({ label: "Staged", value: 1 })]),
        }),
        expect.objectContaining({
          status: "recorded",
          kind: "decision",
          title: "Decision impact recorded",
          modelCallRequired: false,
        }),
      ]),
    );

    const sourceRefreshAppliedEvent: ProjectBoardEvent = {
      id: "event-source-refresh-applied",
      boardId: "board-1",
      kind: "card_updated",
      title: "Source drafts refreshed",
      summary: "Source impact applied to affected drafts.",
      entityKind: "project_board",
      entityId: "board-1",
      metadata: {
        sourceImpact: {
          schemaVersion: 1,
          appliedAction: "refresh_affected_drafts",
          sourceImpactEventIds: ["event-source-impact"],
          sourceIds: ["source-1"],
          appliedCardIds: ["source-draft"],
        },
      },
      createdAt: "2026-01-01T00:14:00.000Z",
    };
    const handledSourceBoard = boardForCards(
      [
        { ...base, id: "source-draft", title: "Source draft", status: "draft", sourceId: "source-1" },
        {
          ...base,
          id: "source-ready",
          title: "Source ready",
          status: "ready",
          sourceId: "source-1",
          orchestrationTaskId: "task-source",
          runFeedback: [
            {
              id: "source-feedback-1",
              source: "source_impact",
              feedback: "Review the updated source on the next run.",
              sourceImpactEventId: "event-source-impact",
              sourceImpactEventIds: ["event-source-impact"],
              sourceIds: ["source-1"],
              createdAt: "2026-01-01T00:15:00.000Z",
            },
          ],
        },
      ],
      [sourceRefreshAppliedEvent, sourceImpactEvent],
    );
    expect(projectBoardImpactQueue(handledSourceBoard).items.some((item) => item.kind === "source")).toBe(false);
  });

  it("uses explicit proof recheck affected-card ids in the History impact audit", () => {
    const baseCard = {
      boardId: "board-1",
      description: "",
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Do the work."],
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const proofRecheckEvent: ProjectBoardEvent = {
      id: "event-proof-recheck",
      boardId: "board-1",
      kind: "card_updated",
      title: "Proof coverage rechecked",
      summary: "3 proof-eligible cards rechecked; 1 missing proof; 2 proof items. 0 model calls. 1 affected card since last recheck.",
      entityKind: "project_board",
      entityId: "board-1",
      metadata: {
        proofImpact: {
          schemaVersion: 1,
          appliedAction: "recompute_proof_coverage",
          eligibleCardIds: ["changed-card", "unchanged-card", "legacy-card"],
          missingProofCardIds: ["changed-card"],
          affectedCardIds: ["changed-card"],
          staleSinceLastRecheck: true,
          driftReasons: ["1 missing-proof card added."],
          addedMissingProofCardIds: ["changed-card"],
          proofKindChangedCardIds: ["changed-card"],
          proofItemCountChangedCardIds: ["changed-card"],
          policyAffectedCardIds: ["changed-card"],
          eligibleCardCount: 3,
          missingProofCount: 1,
          modelCallRequired: false,
          existingCardsRewritten: false,
        },
      },
      createdAt: "2026-01-01T00:20:00.000Z",
    };
    const baselineEvent: ProjectBoardEvent = {
      ...proofRecheckEvent,
      id: "event-proof-baseline",
      summary: "3 proof-eligible cards rechecked; 1 missing proof; 2 proof items. 0 model calls. First recorded proof baseline.",
      metadata: {
        proofImpact: {
          ...(proofRecheckEvent.metadata.proofImpact as Record<string, unknown>),
          affectedCardIds: [],
          staleSinceLastRecheck: false,
          driftReasons: ["No proof coverage baseline has been recorded yet."],
        },
      },
      createdAt: "2026-01-01T00:19:00.000Z",
    };
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "",
        cards: [
          { ...baseCard, id: "changed-card", title: "Changed proof card", status: "draft" as const, testPlan: { unit: [], integration: [], visual: [], manual: [] } },
          {
            ...baseCard,
            id: "unchanged-card",
            title: "Unchanged proof card",
            status: "draft" as const,
            testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
          },
          {
            ...baseCard,
            id: "legacy-card",
            title: "Legacy proof card",
            status: "draft" as const,
            testPlan: { unit: [], integration: ["Browser proof."], visual: [], manual: [] },
          },
        ],
        sources: [],
        questions: [],
        proposals: [],
        events: [baselineEvent, proofRecheckEvent],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    const audit = projectBoardHistoryImpactAudit(board);

    expect(audit.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "event:proof:event-proof-recheck",
          title: "Proof coverage rechecked",
          affectedCardIds: ["changed-card"],
          notes: ["1 missing-proof card added."],
          metrics: expect.arrayContaining([
            expect.objectContaining({ label: "Cards", value: 1 }),
            expect.objectContaining({ label: "Drift", value: "yes" }),
            expect.objectContaining({ label: "New gaps", value: 1 }),
            expect.objectContaining({ label: "Proof shape", value: 1 }),
          ]),
        }),
        expect.objectContaining({
          id: "event:proof:event-proof-baseline",
          affectedCardIds: [],
          notes: ["No proof coverage baseline has been recorded yet."],
          metrics: expect.arrayContaining([
            expect.objectContaining({ label: "Cards", value: 0 }),
            expect.objectContaining({ label: "Drift", value: "no" }),
          ]),
        }),
      ]),
    );
  });

  it("models Git card claim actions from board sync and claim state", () => {
    const card = {
      id: "card-1",
      boardId: "board-1",
      title: "Create shell",
      description: "Create the shell.",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Canvas mounts."],
      testPlan: { unit: [], integration: ["Run app."], visual: [], manual: [] },
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis:shell",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const readyStatus = {
      boardId: "board-1",
      projectRoot: "/workspace/app",
      artifactRoot: ".ambient/board",
      isGitRepository: true,
      hasRemote: true,
      ahead: 0,
      behind: 0,
      dirtyBoardFileCount: 0,
      dirtyBoardFiles: [],
      mode: "git_ready" as const,
      projection: {
        ok: true,
        valid: true,
        differenceCount: 0,
        differences: [],
        fileCount: 3,
        cardCount: 1,
        sourceCount: 1,
        eventCount: 1,
        proposalRunCount: 0,
      },
    };

    expect(projectBoardCardClaimActionState(card)).toMatchObject({
      action: "claim",
      disabled: true,
      title: expect.stringContaining("still loading"),
    });
    expect(projectBoardCardClaimActionState(card, readyStatus)).toMatchObject({
      action: "claim",
      label: "Claim Card",
      disabled: false,
      tone: "primary",
    });
    expect(
      projectBoardCardClaimActionState(card, {
        ...readyStatus,
        projection: { ...readyStatus.projection, ok: false, differenceCount: 1, differences: ["Card title differs."] },
      }),
    ).toMatchObject({
      action: "claim",
      disabled: true,
      title: expect.stringContaining("current .ambient/board projection"),
    });
    expect(projectBoardCardClaimActionState({ ...card, claim: claimSummary({ ownedByLocal: true }) }, readyStatus)).toMatchObject({
      action: "release",
      label: "Release Claim",
      disabled: false,
      tone: "secondary",
    });
    expect(projectBoardCardClaimActionState({ ...card, claim: claimSummary({ status: "expired" }) }, readyStatus)).toMatchObject({
      action: "expire",
      label: "Record Expiry",
      disabled: false,
      tone: "secondary",
    });
    expect(
      projectBoardCardClaimActionState({ ...card, claim: claimSummary({ status: "expired", expirationRecorded: true }) }, readyStatus),
    ).toMatchObject({
      action: "claim",
      label: "Reclaim Card",
      disabled: false,
      tone: "primary",
    });
    expect(projectBoardCardClaimActionState({ ...card, claim: claimSummary({ ownedByLocal: false }) }, readyStatus)).toMatchObject({
      action: "force_release",
      label: "Force Release",
      disabled: false,
      tone: "danger",
    });
    const conflictAction = projectBoardCardClaimActionState({ ...card, claimConflicts: [claimSummary({ ownedByLocal: false })] }, readyStatus);
    expect(conflictAction).toMatchObject({
      action: "resolve_conflict",
      label: "Resolve Conflict",
      disabled: false,
      tone: "danger",
    });
    expect(conflictAction.title).toContain("earliest still-active claim remains the owner");
  });

  it("models project board collaboration readiness from Git status", () => {
    expect(
      projectBoardCollaborationReadiness(
        gitStatus({
          isGitRepository: false,
          hasRemote: false,
          remote: undefined,
          upstream: undefined,
          mode: "local_only",
          projection: undefined,
        }),
      ),
    ).toMatchObject({
      label: "Local only",
      canCollaborate: false,
      needsAttention: true,
      tone: "warning",
      projectionSummary: "Projection not exported",
    });

    expect(projectBoardCollaborationReadiness(gitStatus())).toMatchObject({
      label: "Collaboration ready",
      headline: "Git collaboration is ready",
      canCollaborate: true,
      needsAttention: false,
      projectionSummary: "3 cards synced",
    });

    expect(
      projectBoardCollaborationReadiness(
        gitStatus({
          projection: {
            ok: false,
            valid: true,
            differenceCount: 2,
            differences: ["Card title differs.", "Event count differs."],
            fileCount: 8,
            cardCount: 3,
            sourceCount: 2,
            eventCount: 4,
            proposalRunCount: 1,
            activeClaimCount: 0,
            expiredClaimCount: 0,
            claimConflictCount: 0,
          },
        }),
      ),
    ).toMatchObject({
      label: "Board drift",
      headline: "Pulled board differs from local state",
      canCollaborate: false,
      needsAttention: true,
      projectionSummary: "2 projection differences",
    });

    expect(
      projectBoardCollaborationReadiness(
        gitStatus({
          projection: {
            ok: true,
            valid: true,
            differenceCount: 0,
            differences: [],
            fileCount: 8,
            cardCount: 3,
            sourceCount: 2,
            eventCount: 4,
            proposalRunCount: 1,
            activeClaimCount: 2,
            expiredClaimCount: 1,
            claimConflictCount: 1,
          },
        }),
      ),
    ).toMatchObject({
      label: "Claim conflicts",
      headline: "Card ownership needs attention",
      tone: "danger",
      canCollaborate: false,
      claimSummary: "1 claim conflict",
    });
  });

  it("models History collaboration audit from Git, projection, and claim blockers", () => {
    expect(projectBoardHistoryCollaborationAudit(gitStatus())).toMatchObject({
      visible: false,
      headline: "No collaboration blockers in history",
      tone: "ready",
    });

    expect(
      projectBoardHistoryCollaborationAudit(
        gitStatus({
          hasRemote: false,
          remote: undefined,
          upstream: undefined,
          mode: "git_no_remote",
        }),
      ),
    ).toMatchObject({
      visible: true,
      headline: "1 collaboration warning in history",
      tone: "warning",
      items: [
        expect.objectContaining({
          id: "collaboration-readiness",
          title: "Git exists, but collaboration is local",
          statusLabel: "Git, no remote",
          actionLabel: "Review Setup",
          tabId: "overview",
        }),
      ],
    });

    const projectionAudit = projectBoardHistoryCollaborationAudit(
      gitStatus({
        projection: {
          ok: false,
          valid: false,
          differenceCount: 1,
          differences: ["Invalid .ambient/board/board.config.json."],
          fileCount: 8,
          cardCount: 0,
          sourceCount: 0,
          eventCount: 0,
          proposalRunCount: 0,
        },
      }),
    );
    expect(projectionAudit).toMatchObject({
      visible: true,
      headline: "2 collaboration blockers in history",
      tone: "danger",
    });
    expect(projectionAudit.items.map((item) => item.id)).toEqual(["collaboration-readiness", "projection-review"]);
    expect(projectionAudit.items[1]).toMatchObject({
      title: "Pulled board cannot be applied",
      statusLabel: "Cannot apply",
      actionLabel: "Inspect Projection",
    });

    const claimAudit = projectBoardHistoryCollaborationAudit(
      gitStatus({
        projection: {
          ok: true,
          valid: true,
          differenceCount: 0,
          differences: [],
          fileCount: 8,
          cardCount: 3,
          sourceCount: 2,
          eventCount: 4,
          proposalRunCount: 1,
          activeClaimCount: 2,
          expiredClaimCount: 0,
          claimConflictCount: 1,
        },
      }),
    );
    expect(claimAudit).toMatchObject({
      visible: true,
      headline: "1 collaboration blocker in history",
      tone: "danger",
      items: [
        expect.objectContaining({
          id: "collaboration-readiness",
          title: "Card ownership needs attention",
          statusLabel: "Claim conflicts",
          actionLabel: "Review Claims",
        }),
      ],
    });
  });

  it("models pulled projection review as card and event level changes", () => {
    expect(projectBoardProjectionReview(gitStatus())).toMatchObject({
      visible: false,
      canApply: false,
    });

    const review = projectBoardProjectionReview(
      gitStatus({
        projection: {
          ok: false,
          valid: true,
          differenceCount: 7,
          differences: [
            "missing card local-only.",
            "unexpected card pulled-ready.",
            "card shared-card differs.",
            "unexpected event evt-proof.",
            "run run-shell proof differs.",
            "active charter differs.",
          ],
          fileCount: 8,
          cardCount: 3,
          sourceCount: 2,
          eventCount: 4,
          proposalRunCount: 1,
          activeClaimCount: 0,
          expiredClaimCount: 0,
          claimConflictCount: 0,
        },
      }),
    );

    expect(review).toMatchObject({
      visible: true,
      canApply: true,
      headline: "Review pulled board changes before applying",
      overflowCount: 1,
    });
    expect(review.rows.map((row) => [row.kind, row.action, row.label])).toEqual([
      ["card", "remove", "Card local-only"],
      ["card", "add", "Card pulled-ready"],
      ["card", "update", "Card shared-card"],
      ["event", "add", "Event evt-proof"],
      ["runtime", "update", "Run run-shell proof"],
      ["charter", "update", "Active charter"],
    ]);

    expect(
      projectBoardProjectionReview(
        gitStatus({
          projection: {
            ok: false,
            valid: false,
            differenceCount: 1,
            differences: ["Unexpected token in cards/card-1.json."],
            fileCount: 8,
            cardCount: 0,
            sourceCount: 0,
            eventCount: 0,
            proposalRunCount: 0,
          },
        }),
      ),
    ).toMatchObject({
      visible: true,
      canApply: false,
      headline: "Pulled board cannot be applied",
      rows: [expect.objectContaining({ action: "invalid", tone: "danger" })],
    });
  });

  it("blocks apply when pulled projection changes conflict with local card execution state", () => {
    const review = projectBoardProjectionReview(
      gitStatus({
        projection: {
          ok: false,
          valid: true,
          differenceCount: 1,
          differences: ["card card-shell differs."],
          conflictCount: 1,
          changes: [
            {
              id: "update:card:card-shell",
              kind: "card",
              action: "update",
              entityId: "card-shell",
              title: "Create shell",
              summary: "Pulled board updates card \"Create shell\".",
              local: { title: "Create shell", status: "in_progress", candidateStatus: "ready_to_create", updatedAt: "2026-05-04T12:10:00.000Z" },
              pulled: { title: "Create shell", status: "ready", candidateStatus: "ready_to_create", updatedAt: "2026-05-04T12:00:00.000Z" },
              changedFields: ["status", "updatedAt"],
              conflict: true,
              conflictReason: "The local card is in_progress; applying the pulled ready card could overwrite active local execution state.",
              recommendedResolution: "manual_resolution_required",
              applyConsequence: "Replace this desktop's card fields with the pulled artifact.",
              keepLocalConsequence: "Keep this desktop's card by exporting and committing local board state.",
              deferConsequence: "Leave this card unchanged until collaborators coordinate.",
            },
          ],
          fileCount: 8,
          cardCount: 3,
          sourceCount: 2,
          eventCount: 4,
          proposalRunCount: 1,
          activeClaimCount: 0,
          expiredClaimCount: 0,
          claimConflictCount: 0,
        },
      }),
    );

    expect(review).toMatchObject({
      visible: true,
      canApply: false,
      conflictCount: 1,
      headline: "Resolve pulled card conflicts before applying",
      rows: [
        expect.objectContaining({
          kind: "card",
          action: "update",
          tone: "danger",
          conflict: true,
          localStatus: "in_progress",
          pulledStatus: "ready",
          applyConsequence: expect.stringContaining("Replace"),
          keepLocalConsequence: expect.stringContaining("exporting and committing"),
          deferConsequence: expect.stringContaining("unchanged"),
        }),
      ],
    });
  });

  it("enables apply once every pulled-card conflict has an explicit resolution", () => {
    const review = projectBoardProjectionReview(
      gitStatus({
        projection: {
          ok: false,
          valid: true,
          differenceCount: 2,
          differences: ["card card-shell differs.", "run run-shell proof differs."],
          conflictCount: 1,
          changes: [
            {
              id: "update:card:card-shell",
              kind: "card",
              action: "update",
              entityId: "card-shell",
              title: "Create shell",
              summary: "Pulled board updates card \"Create shell\".",
              local: { title: "Create shell", status: "in_progress", candidateStatus: "ready_to_create", updatedAt: "2026-05-04T12:10:00.000Z" },
              pulled: { title: "Create shell", status: "ready", candidateStatus: "ready_to_create", updatedAt: "2026-05-04T12:00:00.000Z" },
              changedFields: ["status", "updatedAt"],
              conflict: true,
              conflictReason: "The local card is in_progress; applying the pulled ready card could overwrite active local execution state.",
              recommendedResolution: "manual_resolution_required",
              applyConsequence: "Replace this desktop's card fields with the pulled artifact.",
              keepLocalConsequence: "Keep this desktop's card by exporting and committing local board state.",
              deferConsequence: "Leave this card unchanged until collaborators coordinate.",
            },
            {
              id: "update:runtime:run-shell",
              kind: "runtime",
              action: "update",
              entityId: "run-shell",
              title: "Run artifact run-shell",
              summary: "Pulled board updates execution proof/handoff artifacts for card card-shell.",
              pulled: { title: "Run run-shell", status: "handoff", updatedAt: "2026-05-04T12:20:00.000Z" },
              changedFields: ["proof", "handoff"],
              conflict: false,
              recommendedResolution: "apply_pulled",
              applyConsequence: "Import the pulled run manifest, proof, and handoff so PM Review can use collaborator execution evidence.",
              keepLocalConsequence: "Keep this desktop's execution proof/handoff view by exporting and committing local runtime artifacts instead.",
              deferConsequence: "Leave pulled proof/handoff artifacts unapplied.",
            },
          ],
          fileCount: 8,
          cardCount: 3,
          sourceCount: 2,
          eventCount: 4,
          proposalRunCount: 1,
          activeClaimCount: 0,
          expiredClaimCount: 0,
          claimConflictCount: 0,
        },
      }),
    );

    expect(projectBoardProjectionReviewResolutionState(review, {})).toMatchObject({
      conflictCount: 1,
      resolvedConflictCount: 0,
      canApply: false,
      unresolvedLabels: ["Create shell"],
    });
    expect(projectBoardProjectionReviewResolutionState(review, { "update:card:card-shell": "keep_local" })).toMatchObject({
      conflictCount: 1,
      resolvedConflictCount: 1,
      canApply: true,
      unresolvedLabels: [],
      applyTitle: expect.stringContaining("local overlays"),
      applyImpact: expect.stringContaining("proof/handoff runtime artifact"),
      resolvedConflicts: [
        expect.objectContaining({
          label: "Create shell",
          resolution: "keep_local",
          resolutionLabel: "Keep local",
          exportsLocalOverlay: true,
          consequence: expect.stringContaining("re-export this local card as an overlay"),
        }),
      ],
    });
  });

  it("keeps manual board-level projection conflicts unappliable", () => {
    const review = projectBoardProjectionReview(
      gitStatus({
        projection: {
          ok: false,
          valid: true,
          differenceCount: 1,
          differences: ["board config differs."],
          conflictCount: 1,
          changes: [
            {
              id: "update:board:board-config",
              kind: "board",
              action: "update",
              entityId: "board config",
              title: "Board settings",
              summary: "Pulled board settings refer to a different board identity.",
              changedFields: ["boardId"],
              conflict: true,
              conflictReason: "Pulled artifacts belong to board board-2, but the open local board is board-1.",
              recommendedResolution: "manual_resolution_required",
              applyConsequence: "Do not apply this projection onto the open board.",
              keepLocalConsequence: "Keep this desktop's current board settings.",
              deferConsequence: "Leave board settings unchanged.",
            },
          ],
          fileCount: 8,
          cardCount: 3,
          sourceCount: 2,
          eventCount: 4,
          proposalRunCount: 1,
        },
      }),
    );

    expect(projectBoardProjectionReviewResolutionState(review, { "update:board:board-config": "keep_local" })).toMatchObject({
      conflictCount: 1,
      resolvedConflictCount: 1,
      canApply: false,
      applyImpact: expect.stringContaining("manual board-level resolution"),
      unresolvedLabels: ["Board settings"],
    });
  });

  it("normalizes candidate card edit drafts into update input", () => {
    const card = {
      id: "card-1",
      boardId: "board-1",
      title: "Draft card",
      description: "Original",
      status: "draft" as const,
      candidateStatus: "needs_clarification" as const,
      priority: 5,
      phase: "Phase 1",
      labels: ["frontend"],
      blockedBy: [],
      acceptanceCriteria: ["Old criterion"],
      testPlan: { unit: ["Old unit"], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const draft = {
      ...projectBoardCardEditDraft(card),
      title: " Updated card ",
      candidateStatus: "ready_to_create" as const,
      priority: "101",
      labels: "UI, ui, qa",
      blockedBy: "LOCAL-1\nLOCAL-2\nLOCAL-1",
      acceptanceCriteria: "Ship it\n\nVerify it\nShip it",
      unitTests: "Run unit\nRun unit",
      integrationTests: "Run smoke",
      visualTests: "",
      manualTests: "Review copy",
    };

    expect(projectBoardCardEditCanSave(card, draft)).toBe(true);
    expect(projectBoardCardEditInput(card.id, draft)).toMatchObject({
      title: "Updated card",
      candidateStatus: "ready_to_create",
      priority: 100,
      labels: ["ui", "qa"],
      blockedBy: ["LOCAL-1", "LOCAL-2"],
      acceptanceCriteria: ["Ship it", "Verify it"],
      testPlan: {
        unit: ["Run unit"],
        integration: ["Run smoke"],
        visual: [],
        manual: ["Review copy"],
      },
    });
    expect(projectBoardCardCanSplit({ ...card, acceptanceCriteria: ["One"] })).toBe(false);
    expect(projectBoardCardCanSplit({ ...card, acceptanceCriteria: ["One", "Two"] })).toBe(true);
    expect(projectBoardCardCanSplit({ ...card, acceptanceCriteria: ["One", "Two"], orchestrationTaskId: "task-1" })).toBe(false);
  });

  it("groups draft candidate cards by review state", () => {
    const base = {
      boardId: "board-1",
      description: "",
      status: "draft" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const columns = projectBoardDraftColumns([
      { ...base, id: "card-1", title: "Evidence", candidateStatus: "evidence" },
      { ...base, id: "card-2", title: "Clarify", candidateStatus: "needs_clarification" },
      { ...base, id: "card-3", title: "Ready", candidateStatus: "ready_to_create" },
      { ...base, id: "card-4", title: "Reject", candidateStatus: "rejected" },
      { ...base, id: "card-5", title: "Duplicate", candidateStatus: "duplicate" },
      { ...base, id: "card-6", title: "Task", candidateStatus: "ready_to_create", status: "ready", orchestrationTaskId: "task-1" },
    ]);

    expect(columns.map((column) => [column.id, column.cards.map((card) => card.title)])).toEqual([
      ["evidence", ["Evidence"]],
      ["needs_clarification", ["Clarify"]],
      ["ready_to_create", ["Ready"]],
      ["rejected", ["Reject", "Duplicate"]],
    ]);
    expect(columns[0].title).toBe("Covered / Done");
  });

  it("filters draft inbox candidates by search text, decision state, proof gaps, and stale updates", () => {
    const base = {
      boardId: "board-1",
      description: "Implement the card.",
      status: "draft" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Acceptance is clear."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Manual proof."] },
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const cards = [
      { ...base, id: "card-1", title: "Responsive breakpoint", phase: "Layout", candidateStatus: "ready_to_create" as const, sourceRefs: ["source-chat"] },
      {
        ...base,
        id: "card-2",
        title: "Keyboard mappings",
        candidateStatus: "needs_clarification" as const,
        clarificationQuestions: ["Should numpad operators map directly?"],
        clarificationSuggestions: [
          {
            question: "Should numpad operators map directly?",
            suggestedAnswer: "Support direct numpad operator mappings.",
            rationale: "This matches calculator keyboard conventions.",
            confidence: "high" as const,
            safeToAccept: true,
            questionKind: "expert_default" as const,
          },
        ],
      },
      { ...base, id: "card-3", title: "Display polish", candidateStatus: "needs_clarification" as const, testPlan: { unit: [], integration: [], visual: [], manual: [] } },
      {
        ...base,
        id: "card-4",
        title: "Pending Pi update",
        candidateStatus: "ready_to_create" as const,
        pendingPiUpdate: { sourceId: "run-1", createdAt: "2026-01-01T00:00:00.000Z", changedFields: ["description" as const] },
      },
      { ...base, id: "card-5", title: "Already covered", candidateStatus: "duplicate" as const },
    ];
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        charter: {
          id: "charter-1",
          boardId: "board-1",
          version: 1,
          status: "active",
          goal: "Ship safely",
          currentState: "",
          targetUser: "",
          nonGoals: [],
          qualityBar: "Require proof",
          testPolicy: { requireProofSpec: true, defaultProof: "Require proof before ready." },
          decisionPolicy: {},
          dependencyPolicy: {},
          budgetPolicy: {},
          sourcePolicy: {},
          markdown: "",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        cards,
        sources: [],
        questions: [],
        proposals: [],
        events: [
          {
            id: "event-source-impact",
            boardId: "board-1",
            kind: "source_updated",
            title: "Source inclusion updated",
            summary: "Chat source was included.",
            entityKind: "project_board_source",
            entityId: "source-chat",
            metadata: {
              sourceImpact: {
                schemaVersion: 1,
                sourceId: "source-chat",
                groupSourceIds: ["source-chat"],
                targetedRefreshOptional: true,
                affectedDraftCardIds: ["card-1"],
                modelCallRequired: false,
              },
            },
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    const decisionColumns = projectBoardDraftColumns(cards, { board, query: "numpad", filterId: "needs_decision" });
    expect(decisionColumns.flatMap((column) => column.cards.map((card) => card.title))).toEqual(["Keyboard mappings"]);
    expect(projectBoardDraftColumns(cards, { board, includeSkipped: false }).flatMap((column) => column.cards.map((card) => card.title))).not.toContain("Already covered");
    expect(projectBoardDraftInboxFilterOptions(cards, board).map((option) => [option.id, option.count])).toEqual([
      ["all", 5],
      ["blocking_or_critical", 0],
      ["ready", 2],
      ["needs_decision", 1],
      ["missing_proof", 1],
      ["blocked_by_dependency", 0],
      ["stale_impact", 2],
      ["duplicate", 1],
      ["evidence", 0],
      ["rejected", 0],
    ]);
  });

  it("surfaces blocking and critical-path draft candidates near the front of the Draft Inbox filters", () => {
    const base = {
      boardId: "board-1",
      description: "Implement the card.",
      status: "draft" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Acceptance is clear."],
      testPlan: { unit: ["unit"], integration: [], visual: [], manual: [] },
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const cards: ProjectBoardCard[] = [
      { ...base, id: "foundation", title: "Foundation", priority: 1 },
      { ...base, id: "dependent", title: "Dependent", priority: 2, blockedBy: ["foundation"] },
      { ...base, id: "independent", title: "Independent", priority: 3 },
    ];
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        cards,
        sources: [],
        questions: [],
        proposals: [],
        events: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    const options = projectBoardDraftInboxFilterOptions(cards, board);
    expect(options.slice(0, 3).map((option) => option.id)).toEqual(["all", "blocking_or_critical", "ready"]);
    expect(options.find((option) => option.id === "blocking_or_critical")?.count).toBe(2);
    expect(projectBoardDraftColumns(cards, { board, filterId: "blocking_or_critical" }).flatMap((column) => column.cards.map((card) => card.id))).toEqual([
      "foundation",
      "dependent",
    ]);
  });

  it("orders Draft Inbox lanes by critical path before creation time", () => {
    const base = {
      boardId: "board-1",
      description: "Implement the card.",
      status: "draft" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Acceptance is clear."],
      testPlan: { unit: ["unit"], integration: [], visual: [], manual: [] },
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis-1",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const cards: ProjectBoardCard[] = [
      { ...base, id: "dependent", title: "Dependent", blockedBy: ["foundation"], createdAt: "2026-01-01T00:01:00.000Z" },
      { ...base, id: "unrelated", title: "Earlier unrelated", createdAt: "2026-01-01T00:00:30.000Z" },
      { ...base, id: "foundation", title: "Foundation", createdAt: "2026-01-01T00:02:00.000Z" },
    ];

    expect(projectBoardDraftColumns(cards).find((column) => column.id === "ready_to_create")?.cards.map((card) => card.id)).toEqual([
      "foundation",
      "dependent",
      "unrelated",
    ]);
  });

  it("builds a queue for staged Pi updates across decision, source, and proof refreshes", () => {
    const base = {
      boardId: "board-1",
      description: "Implement the card.",
      status: "draft" as const,
      candidateStatus: "needs_clarification" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Acceptance is clear."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Manual proof."] },
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const cards: ProjectBoardCard[] = [
      {
        ...base,
        id: "decision-card",
        title: "Keyboard decision",
        pendingPiUpdate: {
          sourceId: "decision:should-keyboard-shortcuts-loop",
          createdAt: "2026-01-01T00:00:00.000Z",
          changedFields: ["description", "clarificationAnswers", "clarificationDecisions"],
          description: "Implement keyboard shortcuts after accepting the PM decision.",
          clarificationAnswers: [{ question: "Support shortcuts?", answer: "Yes", answeredAt: "2026-01-01T00:00:00.000Z" }],
          clarificationDecisions: [],
        },
      },
      {
        ...base,
        id: "source-card",
        title: "Source refresh",
        pendingPiUpdate: {
          sourceId: "source:durable-plan",
          createdAt: "2026-01-01T00:00:00.000Z",
          changedFields: ["description", "acceptanceCriteria"],
          description: "Refresh from the refined durable plan.",
          acceptanceCriteria: ["Uses the refined durable artifact."],
        },
      },
      {
        ...base,
        id: "proof-card",
        title: "Proof refresh",
        testPlan: { unit: [], integration: [], visual: [], manual: [] },
        pendingPiUpdate: {
          sourceId: "proof:gmi-e2e-smoke",
          createdAt: "2026-01-01T00:00:00.000Z",
          changedFields: ["testPlan"],
          testPlan: { unit: ["Reducer handles tick."], integration: [], visual: ["Screenshot shows animation."], manual: [] },
        },
      },
      {
        ...base,
        id: "ticketized-card",
        title: "Already ticketized",
        status: "ready" as const,
        orchestrationTaskId: "LOCAL-1",
        pendingPiUpdate: {
          sourceId: "run-1",
          createdAt: "2026-01-01T00:00:00.000Z",
          changedFields: ["description"],
          description: "This should not be applied directly.",
        },
      },
    ];
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        cards,
        sources: [],
        questions: [],
        proposals: [],
        events: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    const queue = projectBoardPiUpdateReviewQueue(board);
    expect(queue).toMatchObject({
      visible: true,
      decisionCount: 1,
      sourceCount: 1,
      proofCount: 1,
      planningCount: 1,
    });
    expect(queue.actionableItems.map((item) => item.card.id)).toEqual(["decision-card", "source-card", "proof-card"]);
    expect(queue.items.map((item) => [item.card.id, item.sourceLabel, item.actionable])).toEqual([
      ["decision-card", "PM decision refresh", true],
      ["source-card", "Source refresh", true],
      ["proof-card", "Proof suggestion", true],
      ["ticketized-card", "Planning refresh", false],
    ]);
    expect(queue.items.find((item) => item.card.id === "proof-card")?.previewLines).toContain("Proof plan: 2 expectations");
    expect(queue.items.find((item) => item.card.id === "ticketized-card")?.blocker).toContain("already ticketized");
  });

  it("builds a cross-card Decisions queue from proposal gaps and canonical clarification decisions", () => {
    const base = {
      boardId: "board-1",
      description: "Implement the card.",
      status: "draft" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Acceptance is clear."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Manual proof."] },
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        cards: [
          {
            ...base,
            id: "card-open",
            title: "Keyboard mappings",
            candidateStatus: "needs_clarification" as const,
            clarificationQuestions: ["Should numpad operators map directly?"],
            clarificationSuggestions: [
              {
                question: "Should numpad operators map directly?",
                suggestedAnswer: "Support direct numpad operator mappings.",
                rationale: "This matches calculator keyboard conventions.",
                confidence: "high" as const,
                safeToAccept: true,
                questionKind: "expert_default" as const,
              },
            ],
          },
          {
            ...base,
            id: "card-answered",
            title: "Answered display",
            candidateStatus: "needs_clarification" as const,
            clarificationQuestions: ["What threshold should auto-shrink use?"],
            clarificationAnswers: [
              {
                question: "What threshold should auto-shrink use?",
                answer: "Begin shrinking after 11 visible characters.",
                answeredAt: "2026-01-01T00:05:00.000Z",
              },
            ],
          },
          {
            ...base,
            id: "card-accepted-default",
            title: "Z accepted default audit",
            candidateStatus: "ready_to_create" as const,
            clarificationDecisions: [
              {
                id: "clarification:animation-style",
                question: "Should the animation use pulse or confetti?",
                canonicalKey: "animation-style",
                source: "card" as const,
                state: "answered" as const,
                answer: "Use a subtle pulse animation.",
                answeredAt: "2026-01-01T00:08:00.000Z",
                suggestedAnswer: "Use a subtle pulse animation.",
                rationale: "Pulse is easy to verify and avoids decorative scope creep.",
                confidence: "high" as const,
                safeToAccept: true,
                questionKind: "expert_default" as const,
              },
            ],
          },
          {
            ...base,
            id: "card-missing-suggestion",
            title: "Preview error default",
            candidateStatus: "needs_clarification" as const,
            clarificationQuestions: ["Should preview errors show a muted indicator?"],
          },
        ],
        sources: [],
        questions: [],
        proposals: [
          {
            id: "proposal-1",
            boardId: "board-1",
            status: "pending",
            summary: "Pi proposal",
            goal: "Goal",
            currentState: "State",
            targetUser: "User",
            qualityBar: "Proof required.",
            assumptions: [],
            questions: ["Which interaction mode should be primary?"],
            answers: [],
            sourceNotes: [],
            cards: [],
            createdAt: "2026-01-01T00:06:00.000Z",
            updatedAt: "2026-01-01T00:06:00.000Z",
          },
        ],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    const queue = projectBoardDecisionQueue(board);
    expect(queue).toMatchObject({
      openCount: 2,
      answeredCount: 2,
      duplicateCount: 1,
      suggestedCount: 1,
      suggestedAuditCount: 1,
      missingSuggestionCount: 1,
      safeSuggestionCount: 1,
      proposalGapCount: 1,
      actionCount: 3,
    });
    expect(queue.auditFilterItems).toEqual([
      { id: "all", label: "All audit", count: 3 },
      { id: "answered", label: "Answered", count: 2 },
      { id: "duplicate", label: "Duplicates", count: 1 },
      { id: "suggested", label: "Suggestion trail", count: 1 },
    ]);
    expect(queue.auditRows.map((row) => [row.cardId, row.state])).toEqual([
      ["card-accepted-default", "answered"],
      ["card-answered", "answered"],
      ["card-answered", "duplicate"],
    ]);
    expect(queue.openRows[0]).toMatchObject({
      cardId: "card-open",
      actionLabel: "Accept suggested default",
      sourceLabel: "Card question",
      impact: expect.objectContaining({ modelCallRequired: false }),
    });
    expect(queue.answeredRows.find((row) => row.cardId === "card-answered")).toMatchObject({
      cardId: "card-answered",
      state: "answered",
      answer: "Begin shrinking after 11 visible characters.",
      detail: expect.stringContaining("Answered"),
    });
    expect(queue.duplicateRows[0]).toMatchObject({
      cardId: "card-answered",
      state: "duplicate",
      duplicateOf: expect.any(String),
      answer: "Begin shrinking after 11 visible characters.",
      detail: expect.stringContaining("hidden from open gates"),
    });
    expect(projectBoardTabs(board).map((tab) => tab.id).slice(0, 4)).toEqual(["overview", "charter", "decisions", "draft_inbox"]);
    expect(projectBoardTabs(board).find((tab) => tab.id === "decisions")?.count).toBe(3);
    expect(defaultProjectBoardTab(board)).toBe("decisions");
    expect(defaultProjectBoardTab({ ...board, status: "draft" })).toBe("charter");

    const proposalAnsweredByCardBoard = project({
      board: {
        ...board,
        cards: [
          {
            ...base,
            id: "card-proposal-answer",
            title: "Answered proposal gap",
            candidateStatus: "ready_to_create" as const,
            clarificationQuestions: ["Synced scrolling between editor and preview?"],
            clarificationAnswers: [
              {
                question: "Synced scrolling between editor and preview?",
                answer: "Use independent scroll for v1.",
                answeredAt: "2026-01-01T00:10:00.000Z",
              },
            ],
          },
        ],
        proposals: [
          {
            id: "proposal-answered-by-card",
            boardId: "board-1",
            status: "pending",
            summary: "Pi proposal",
            goal: "Goal",
            currentState: "State",
            targetUser: "User",
            qualityBar: "Proof required.",
            assumptions: [],
            questions: ["Synced scrolling between editor and preview?"],
            answers: [],
            sourceNotes: [],
            cards: [],
            createdAt: "2026-01-01T00:06:00.000Z",
            updatedAt: "2026-01-01T00:06:00.000Z",
          },
        ],
      },
    }).board!;
    expect(projectBoardDecisionQueue(proposalAnsweredByCardBoard)).toMatchObject({
      openCount: 0,
      answeredCount: 1,
      proposalGapCount: 0,
      actionCount: 0,
    });
    expect(projectBoardTabs(proposalAnsweredByCardBoard).find((tab) => tab.id === "decisions")?.count).toBe(0);
  });

  it("previews Create Ready Tasks with ticketizable, mark-ready, skipped, and dependency counts", () => {
    const base = {
      boardId: "board-1",
      description: "Implement the card.",
      status: "draft" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Acceptance is clear."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Manual proof."] },
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const cards = [
      { ...base, id: "card-1", title: "Ready task", candidateStatus: "ready_to_create" as const },
      { ...base, id: "card-2", title: "Markable task", candidateStatus: "needs_clarification" as const },
      { ...base, id: "card-3", title: "Dependency task", candidateStatus: "ready_to_create" as const, blockedBy: ["card-1"] },
      {
        ...base,
        id: "card-4",
        title: "Decision task",
        candidateStatus: "needs_clarification" as const,
        clarificationQuestions: ["Which formatter should be used?"],
      },
      { ...base, id: "card-5", title: "Proof gap task", candidateStatus: "ready_to_create" as const, testPlan: { unit: [], integration: [], visual: [], manual: [] } },
      { ...base, id: "card-6", title: "Duplicate task", candidateStatus: "duplicate" as const },
    ];
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        charter: {
          id: "charter-1",
          boardId: "board-1",
          version: 1,
          status: "active",
          goal: "Ship safely",
          currentState: "",
          targetUser: "",
          nonGoals: [],
          qualityBar: "Require proof",
          testPolicy: { requireProofSpec: true, defaultProof: "Require proof before ready." },
          decisionPolicy: {},
          dependencyPolicy: {},
          budgetPolicy: {},
          sourcePolicy: {},
          markdown: "",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        cards,
        sources: [],
        questions: [],
        proposals: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    const preview = projectBoardDraftInboxCreateReadyPreview(board);
    expect(preview.ticketizableCards.map((card) => card.title)).toEqual(["Ready task", "Dependency task"]);
    expect(preview.markReadyCards.map((card) => card.title)).toEqual(["Markable task"]);
    expect(preview.decisionBlockedCount).toBe(1);
    expect(preview.proofGapCount).toBe(1);
    expect(preview.dependencyBlockerCount).toBe(1);
    expect(preview.skippedTerminalCount).toBe(1);
    expect(preview.skippedCards.find((item) => item.card.title === "Decision task")?.reasons.join(" ")).toContain("open PM decision");
  });

  it("treats duplicate or rejected draft blockers as terminal audit dependencies", () => {
    const base = {
      boardId: "board-1",
      description: "Implement the card.",
      status: "draft" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Acceptance is clear."],
      testPlan: { unit: ["unit"], integration: [], visual: [], manual: [] },
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const duplicate = { ...base, id: "card-duplicate", title: "Duplicate auth backend", candidateStatus: "duplicate" as const };
    const dependent = { ...base, id: "card-dependent", title: "JWT middleware", blockedBy: [duplicate.id], sourceId: "synthesis:middleware" };
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        charter: {
          id: "charter-1",
          boardId: "board-1",
          version: 1,
          status: "active",
          goal: "Ship safely",
          currentState: "",
          targetUser: "",
          nonGoals: [],
          qualityBar: "Require proof",
          testPolicy: { requireProofSpec: true, defaultProof: "Require proof before ready." },
          decisionPolicy: {},
          dependencyPolicy: {},
          budgetPolicy: {},
          sourcePolicy: {},
          markdown: "",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        cards: [duplicate, dependent],
        sources: [],
        questions: [],
        proposals: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    const preview = projectBoardDraftInboxCreateReadyPreview(board);
    const badges = projectBoardCardDependencyBadges(dependent, board.cards);
    const health = projectBoardDependencyHealth(board.cards);
    const dependentReadiness = health.readiness.find((item) => item.card.id === dependent.id);

    expect(preview.ticketizableCards.map((card) => card.id)).toEqual([dependent.id]);
    expect(preview.dependencyBlockerCount).toBe(0);
    expect(projectBoardDraftInboxFilterOptions(board.cards, board).find((option) => option.id === "blocked_by_dependency")?.count).toBe(0);
    expect(projectBoardDependencyRows(board.cards).find((row) => row.card.id === dependent.id)?.blockedBy).toEqual([]);
    expect(badges).toEqual([
      expect.objectContaining({
        cardId: duplicate.id,
        prefix: "Dependency skipped",
        state: "satisfied",
      }),
    ]);
    expect(dependentReadiness).toMatchObject({
      state: "ready_now",
      waitingOn: [],
    });
  });

  it("explains Draft Inbox drag/drop targets and proof-gated moves", () => {
    const base = {
      id: "card-1",
      boardId: "board-1",
      title: "Ship controls",
      description: "Implement controls.",
      status: "draft" as const,
      candidateStatus: "needs_clarification" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Keyboard input moves the ship."],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        charter: {
          id: "charter-1",
          boardId: "board-1",
          version: 1,
          status: "active",
          goal: "Ship safely",
          currentState: "",
          targetUser: "",
          nonGoals: [],
          qualityBar: "Require proof",
          testPolicy: { requireProofSpec: true, defaultProof: "Require proof before ready." },
          decisionPolicy: {},
          dependencyPolicy: {},
          budgetPolicy: {},
          sourcePolicy: {},
          markdown: "",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        cards: [base],
        sources: [],
        questions: [],
        proposals: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;
    const columns = projectBoardDraftColumns([base]);
    const readyColumn = columns.find((column) => column.id === "ready_to_create")!;
    const rejectedColumn = columns.find((column) => column.id === "rejected")!;
    const needsInfoColumn = columns.find((column) => column.id === "needs_clarification")!;

    expect(projectBoardDraftColumnMoveState(readyColumn).label).toBe("Proof-ready candidates");
    expect(projectBoardDraftColumnMoveState(readyColumn, base, board)).toMatchObject({
      disabled: true,
      tone: "warning",
      label: "Proof required before Ready",
    });
    expect(projectBoardDraftColumnMoveState(needsInfoColumn, base, board)).toMatchObject({
      disabled: true,
      label: "Already here",
    });
    expect(projectBoardDraftColumnMoveState(rejectedColumn, base, board)).toMatchObject({
      disabled: false,
      tone: "danger",
      label: "Drop to move to Rejected / Duplicate",
    });
    expect(
      projectBoardDraftColumnMoveState(readyColumn, { ...base, testPlan: { ...base.testPlan, manual: ["Manual proof"] } }, board),
    ).toMatchObject({
      disabled: false,
      tone: "ready",
      label: "Drop to move to Ready To Create",
    });
  });

  it("summarizes reset impact without implying project files are deleted", () => {
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        cards: [
          {
            id: "draft-card",
            boardId: "board-1",
            title: "Draft",
            description: "",
            status: "draft" as const,
            candidateStatus: "needs_clarification" as const,
            labels: [],
            blockedBy: [],
            acceptanceCriteria: [],
            testPlan: { unit: [], integration: [], visual: [], manual: [] },
            sourceKind: "manual" as const,
            sourceId: "manual",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "linked-card",
            boardId: "board-1",
            title: "Linked",
            description: "",
            status: "in_progress" as const,
            candidateStatus: "ready_to_create" as const,
            labels: [],
            blockedBy: [],
            acceptanceCriteria: [],
            testPlan: { unit: ["Unit"], integration: [], visual: [], manual: [] },
            sourceKind: "planner_plan" as const,
            sourceId: "plan",
            orchestrationTaskId: "task-1",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        sources: [
          {
            id: "source-1",
            boardId: "board-1",
            kind: "markdown" as const,
            sourceKey: "README.md",
            contentHash: "hash",
            title: "README",
            summary: "Summary",
            byteSize: 10,
            relevance: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        questions: [{ id: "question-1", boardId: "board-1", question: "Goal?", required: true, answer: "Ship", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
        proposals: [{
          id: "proposal-1",
          boardId: "board-1",
          status: "pending" as const,
          summary: "Summary",
          goal: "Ship",
          currentState: "Draft",
          targetUser: "User",
          qualityBar: "Proof",
          assumptions: [],
          questions: [],
          answers: [],
          sourceNotes: [],
          cards: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }],
        synthesisRuns: [{
          id: "run-1",
          boardId: "board-1",
          status: "failed" as const,
          stage: "model_request" as const,
          sourceCount: 1,
          includedSourceCount: 1,
          sourceCharCount: 10,
          warningCount: 0,
          events: [],
          startedAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }],
        executionArtifacts: [{ id: "artifact-1", boardId: "board-1", cardId: "linked-card", status: "running" as const, source: "local_export" as const, startedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" }],
        events: [{ id: "event-1", boardId: "board-1", kind: "board_created" as const, title: "Created", summary: "Created", metadata: {}, createdAt: "2026-01-01T00:00:00.000Z" }],
        claims: { active: [claimSummary({ ownedByLocal: true })], expired: [], conflicts: [] },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    const impact = projectBoardResetImpact(board);

    expect(impact.summary).toContain("2 board cards");
    expect(impact.deleted.map((metric) => [metric.label, metric.value])).toEqual([
      ["Cards", 2],
      ["Sources", 1],
      ["Questions", 1],
      ["PM proposals", 1],
      ["Progress runs", 1],
      ["Proof/handoff artifacts", 1],
      ["History events", 1],
      ["Active claims", 1],
    ]);
    expect(impact.deleted[0].detail).toContain("1 draft candidate");
    expect(impact.preserved).toEqual([
      "Project files and Git working tree.",
      "Chat threads and planning artifacts outside this board.",
      "1 existing Local Task; they will no longer be attached to this board.",
    ]);
  });

  it("explains needs-clarification candidates at the PM decision point", () => {
    const base = {
      id: "card-1",
      boardId: "board-1",
      title: "Clarify controls",
      status: "draft" as const,
      candidateStatus: "needs_clarification" as const,
      priority: 1,
      phase: "Gameplay",
      labels: [],
      blockedBy: [],
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    expect(
      projectBoardCandidateClarificationItems({
        ...base,
        clarificationQuestions: ["Should this use thrust inertia or direct arcade steering?"],
        description: "Implement the control model.",
        acceptanceCriteria: ["Ship moves inside the play area."],
        testPlan: { unit: ["Unit test"], integration: [], visual: [], manual: [] },
      })[0],
    ).toEqual(
      expect.objectContaining({
        label: "Clarification question",
        detail: "Should this use thrust inertia or direct arcade steering?",
      }),
    );

    expect(
      projectBoardCandidateClarificationItems({
        ...base,
        sourceKind: "manual" as const,
        description: "Should the ship use tank controls or thrust controls?",
        acceptanceCriteria: [],
        testPlan: { unit: [], integration: [], visual: [], manual: [] },
      }).map((item) => item.label),
    ).toContain("Question from card");

    // Synthesis cards only surface structured questions; their prose is full of
    // technical "?" usage and is never mined.
    expect(
      projectBoardCandidateClarificationItems({
        ...base,
        description: "Should the ship use tank controls or thrust controls?",
        acceptanceCriteria: [],
        testPlan: { unit: [], integration: [], visual: [], manual: [] },
      }).map((item) => item.label),
    ).not.toContain("Question from card");

    expect(
      projectBoardCandidateClarificationItems({
        ...base,
        clarificationQuestions: ["Should this use thrust inertia or direct arcade steering?"],
        clarificationAnswers: [
          {
            question: "Should this use thrust inertia or direct arcade steering?",
            answer: "Use inertia.",
            answeredAt: "2026-01-02T00:00:00.000Z",
          },
        ],
        description: "Implement the control model.",
        acceptanceCriteria: ["Ship moves inside the play area."],
        testPlan: { unit: ["Unit test"], integration: [], visual: [], manual: [] },
      }).map((item) => item.detail),
    ).not.toContain("Should this use thrust inertia or direct arcade steering?");

    expect(
      projectBoardCandidateClarificationItems({
        ...base,
        clarificationQuestions: [],
        clarificationAnswers: [
          {
            question: "Should this use thrust inertia or direct arcade steering?",
            answer: "Use inertia.",
            answeredAt: "2026-01-02T00:00:00.000Z",
          },
        ],
        description: "Implement the control model.\n\n## Clarifications\n- Q: Should this use thrust inertia or direct arcade steering?\n  A: Use inertia.",
        acceptanceCriteria: ["Ship moves inside the play area."],
        testPlan: { unit: ["Unit test"], integration: [], visual: [], manual: [] },
      }).map((item) => item.label),
    ).not.toContain("Question from card");
    expect(
      projectBoardCandidateClarificationItems({
        ...base,
        clarificationQuestions: [],
        clarificationAnswers: [
          {
            question: "Should this use thrust inertia or direct arcade steering?",
            answer: "Use inertia.",
            answeredAt: "2026-01-02T00:00:00.000Z",
          },
        ],
        description: "Implement the control model.\n\n## Clarifications\n- Q: Should this use thrust inertia or direct arcade steering?\n  A: Use inertia.",
        acceptanceCriteria: ["Ship moves inside the play area."],
        testPlan: { unit: ["Unit test"], integration: [], visual: [], manual: [] },
      }),
    ).toEqual([]);

    const answerInput = projectBoardClarificationAnswerInput(
      {
        ...base,
        clarificationQuestions: ["Should this use thrust inertia or direct arcade steering?", "What proof is required?"],
        description: "Implement the control model.",
        acceptanceCriteria: ["Ship moves inside the play area."],
        testPlan: { unit: ["Unit test"], integration: [], visual: [], manual: [] },
      },
      "Should this use thrust inertia or direct arcade steering?",
      "Use inertia-based thrust from the design document.",
    );
    expect(answerInput).toMatchObject({
      cardId: "card-1",
      clarificationQuestions: ["What proof is required?"],
      clarificationAnswers: [
        expect.objectContaining({
          question: "Should this use thrust inertia or direct arcade steering?",
          answer: "Use inertia-based thrust from the design document.",
        }),
      ],
    });
    expect(answerInput.description).toContain("## Clarifications");
    expect(answerInput.description).toContain("Use inertia-based thrust");

    const clarificationCard = {
      ...base,
      clarificationQuestions: ["What proof is required?"],
      description: "Implement the control model.",
      acceptanceCriteria: ["Ship moves inside the play area."],
      testPlan: { unit: ["Unit test"], integration: [], visual: [], manual: [] },
    };
    const composedAnswerInput = projectBoardCardEditWithClarificationAnswerInput(
      clarificationCard,
      {
        ...projectBoardCardEditDraft(clarificationCard),
        description: "Edited details before accepting.",
        manualTests: "Manual proof survives accept",
      },
      "What proof is required?",
      "Run the unit test and complete the manual proof.",
    );
    expect(composedAnswerInput).toMatchObject({
      cardId: "card-1",
      description: expect.stringContaining("Edited details before accepting."),
      testPlan: expect.objectContaining({ manual: ["Manual proof survives accept"] }),
      clarificationQuestions: [],
      clarificationAnswers: [
        expect.objectContaining({
          question: "What proof is required?",
          answer: "Run the unit test and complete the manual proof.",
        }),
      ],
    });

    const duplicateRenderingQuestion =
      "The plan locks 'Canvas 2D' but the project charter specifies 'Three.js/WebGL.' Which rendering substrate should the game use? This determines the entire renderer architecture, asset pipeline, and downstream card dependencies.";
    const duplicateRenderingQuestionVariant =
      "The implementation plan locks 'Canvas 2D' as the rendering substrate, but the project charter specifies a 'Three.js/WebGL spaceship game.' Which substrate should the game use? This is a foundational architecture decision that blocks the rendering card and all downstream visual cards.";
    const duplicateQuestionCard = {
      ...base,
      clarificationQuestions: [duplicateRenderingQuestion, duplicateRenderingQuestionVariant],
      description: "Resolve the rendering substrate.",
      acceptanceCriteria: ["Renderer choice is documented."],
      testPlan: { unit: ["Unit test"], integration: [], visual: [], manual: [] },
    };
    expect(projectBoardPendingClarificationQuestions(duplicateQuestionCard)).toEqual([duplicateRenderingQuestion]);
    expect(
      projectBoardCandidateClarificationItems(duplicateQuestionCard).filter((item) => item.label === "Clarification question").map((item) => item.detail),
    ).toEqual([duplicateRenderingQuestion]);
    expect(projectBoardClarificationAnswerInput(duplicateQuestionCard, duplicateRenderingQuestionVariant, "Use Three.js/WebGL.")).toMatchObject({
      clarificationQuestions: [],
      clarificationAnswers: [
        expect.objectContaining({
          question: duplicateRenderingQuestionVariant,
          answer: "Use Three.js/WebGL.",
        }),
      ],
    });

    const noQuestionCard = {
      ...base,
      description: "Implement the game shell.",
      acceptanceCriteria: ["Canvas renders."],
      testPlan: { unit: ["Unit test"], integration: [], visual: [], manual: [] },
    };
    expect(projectBoardCandidateClarificationItems(noQuestionCard)).toEqual([
      expect.objectContaining({
        label: "No explicit question attached",
        tone: "neutral",
      }),
    ]);
    expect(projectBoardCandidateClarificationItems(noQuestionCard, boardSummary({ cards: [noQuestionCard] }))).toEqual([]);

    const closedParent = {
      ...base,
      id: "parent-card",
      title: "Open random-picker/index.html via browser_local_preview",
      status: "done" as const,
      candidateStatus: "ready_to_create" as const,
      description: "Open the local preview.",
      acceptanceCriteria: ["Preview opens."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Browser preview was checked."] },
    };
    const proofFollowUp = {
      ...base,
      id: "proof-follow-up",
      title: "Complete proof for Open random-picker/index.html via browser_local_preview",
      sourceKind: "run_follow_up" as const,
      sourceId: "run-1",
      blockedBy: ["parent-card"],
      description: "Complete proof for the already-finished local preview task.",
      acceptanceCriteria: ["Proof is captured or the follow-up is dismissed."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Capture browser preview proof."] },
    };
    const proofFollowUpBoard = boardSummary({
      cards: [closedParent, proofFollowUp],
    });
    expect(projectBoardCardCanMarkReady(proofFollowUp, proofFollowUpBoard)).toBe(false);
    expect(projectBoardCandidateClarificationItems(proofFollowUp, proofFollowUpBoard)).toEqual([]);
  });

  it("surfaces proof-scope warnings before ready candidates are ticketized", () => {
    const card = {
      id: "card-1",
      boardId: "board-1",
      title: "Build InputAdapter for keyboard-to-intent mapping",
      description: "Translate keyboard input into player intent.",
      status: "draft" as const,
      candidateStatus: "ready_to_create" as const,
      priority: 1,
      phase: "Input",
      labels: ["input"],
      blockedBy: [],
      acceptanceCriteria: ["Keyboard events produce stable intent objects."],
      testPlan: {
        unit: ["Unit-test key state transitions."],
        integration: ["Exercise the game-loop input boundary."],
        visual: ["Holding thrust key in browser causes ship to accelerate visually."],
        manual: [],
      },
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis:input-adapter",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active" as const,
        title: "App board",
        summary: "Active",
        cards: [card],
        sources: [],
        questions: [],
        proposals: [],
        synthesisRuns: [
          {
            id: "run-1",
            boardId: "board-1",
            status: "succeeded" as const,
            stage: "proposal_created" as const,
            sourceCount: 1,
            includedSourceCount: 1,
            sourceCharCount: 100,
            cardCount: 1,
            warningCount: 1,
            progressiveRecordCount: 1,
            progressiveSummary: {
              recordCount: 1,
              candidateCardCount: 1,
              questionCount: 0,
              sourceCoverageCount: 0,
              dependencyEdgeCount: 0,
              warningCount: 1,
              errorCount: 0,
              latestWarning: "Proof scope mismatch.",
            },
            progressiveRecords: [
              {
                type: "warning",
                code: "proof_scope_mismatch",
                message:
                  "\"Build InputAdapter for keyboard-to-intent mapping\" looks like a pure/module-boundary card but has browser or screenshot proof.",
                createdAt: "2026-01-01T00:01:00.000Z",
                metadata: {
                  cardId: "synthesis:input-adapter",
                  title: "Build InputAdapter for keyboard-to-intent mapping",
                  proofOwnership: "pure_module",
                  visualProofItems: ["Holding thrust key in browser causes ship to accelerate visually."],
                },
              },
            ],
            planningSnapshots: [
              {
                id: "snapshot-1",
                boardId: "board-1",
                runId: "run-1",
                kind: "final" as const,
                planningStatus: "succeeded" as const,
                planningStage: "proposal_created" as const,
                createdAt: "2026-01-01T00:01:00.000Z",
                cardCount: 1,
                readyCandidateCount: 1,
                ticketizedCount: 0,
                sourceHashes: [],
                cardIds: ["card-1"],
                cards: [],
                renderFingerprint: "planning-snapshot-proof-warning",
              },
            ],
            events: [],
            startedAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:01:00.000Z",
            completedAt: "2026-01-01T00:01:00.000Z",
          },
        ],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    const warnings = projectBoardPlanningWarningsForCard(card, board);

    expect(projectBoardSynthesisRunProofScopeWarnings(board.synthesisRuns?.[0])[0]).toMatchObject({
      code: "proof_scope_mismatch",
      cardRef: "synthesis:input-adapter",
      proofOwnership: "pure_module",
      visualProofItems: ["Holding thrust key in browser causes ship to accelerate visually."],
    });
    expect(warnings).toHaveLength(1);
    expect(projectBoardPlanningWarningActionTitle(warnings)).toContain("Move screenshot/browser/visual proof");
    expect(projectBoardCreateReadyTasksState(board).title).toContain("proof-scope warning");

    const needsClarificationCard = { ...card, candidateStatus: "needs_clarification" as const };
    const readyColumn = projectBoardDraftColumns([needsClarificationCard]).find((column) => column.id === "ready_to_create")!;
    expect(projectBoardDraftColumnMoveState(readyColumn, needsClarificationCard, { ...board, cards: [needsClarificationCard] })).toMatchObject({
      disabled: false,
      tone: "warning",
      label: "Review proof warning before Ready",
    });
  });

  it("keeps proof-scope warnings advisory by default but blocks strict-policy ticketization until acknowledged", () => {
    const card = {
      id: "card-1",
      boardId: "board-1",
      title: "Build InputAdapter for keyboard-to-intent mapping",
      description: "Translate keyboard input into player intent.",
      status: "draft" as const,
      candidateStatus: "ready_to_create" as const,
      priority: 1,
      phase: "Input",
      labels: ["input"],
      blockedBy: [],
      acceptanceCriteria: ["Keyboard events produce stable intent objects."],
      testPlan: {
        unit: ["Unit-test key state transitions."],
        integration: ["Exercise the game-loop input boundary."],
        visual: ["Holding thrust key in browser causes ship to accelerate visually."],
        manual: [],
      },
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis:input-adapter",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const warningRun = {
      id: "run-1",
      boardId: "board-1",
      status: "succeeded" as const,
      stage: "proposal_created" as const,
      sourceCount: 1,
      includedSourceCount: 1,
      sourceCharCount: 100,
      cardCount: 1,
      warningCount: 1,
      progressiveRecordCount: 1,
      progressiveRecords: [
        {
          type: "warning",
          code: "proof_scope_mismatch",
          message:
            "\"Build InputAdapter for keyboard-to-intent mapping\" looks like a pure/module-boundary card but has browser or screenshot proof.",
          createdAt: "2026-01-01T00:01:00.000Z",
          metadata: {
            cardId: "synthesis:input-adapter",
            title: "Build InputAdapter for keyboard-to-intent mapping",
            proofOwnership: "pure_module",
            visualProofItems: ["Holding thrust key in browser causes ship to accelerate visually."],
          },
        },
      ],
      planningSnapshots: [
        {
          id: "snapshot-1",
          boardId: "board-1",
          runId: "run-1",
          kind: "final" as const,
          planningStatus: "succeeded" as const,
          planningStage: "proposal_created" as const,
          createdAt: "2026-01-01T00:01:00.000Z",
          cardCount: 1,
          readyCandidateCount: 1,
          ticketizedCount: 0,
          sourceHashes: [],
          cardIds: ["card-1"],
          cards: [],
          renderFingerprint: "planning-snapshot-proof-warning",
        },
      ],
      events: [],
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
      completedAt: "2026-01-01T00:01:00.000Z",
    };
    const baseBoard = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active" as const,
        title: "App board",
        summary: "Active",
        cards: [card],
        sources: [],
        questions: [],
        proposals: [],
        synthesisRuns: [warningRun],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;
    const strictBoard = {
      ...baseBoard,
      charter: {
        id: "charter-1",
        boardId: "board-1",
        version: 1,
        status: "active" as const,
        goal: "Ship a safe board.",
        currentState: "Strict proof policy is active.",
        targetUser: "Ambient Desktop operator",
        nonGoals: [],
        qualityBar: "Require acknowledgement for proof ownership warnings.",
        testPolicy: { proofScopeWarningPolicy: "acknowledgement_required" },
        decisionPolicy: {},
        dependencyPolicy: {},
        budgetPolicy: {},
        sourcePolicy: {},
        markdown: "# Charter",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    };

    expect(projectBoardReadyTicketizationCards(baseBoard).map((item) => item.id)).toEqual(["card-1"]);
    expect(projectBoardCreateReadyTasksState(baseBoard)).toMatchObject({
      count: 1,
      disabled: false,
    });

    expect(projectBoardReadyTicketizationCards(strictBoard)).toEqual([]);
    expect(projectBoardCreateReadyTasksState(strictBoard)).toMatchObject({
      count: 0,
      disabled: true,
      title: expect.stringContaining("must be acknowledged"),
    });

    const acknowledgedStrictBoard = {
      ...strictBoard,
      cards: [
        {
          ...card,
          userTouchedFields: ["candidateStatus" as const],
          userTouchedAt: "2026-01-01T00:02:00.000Z",
        },
      ],
    };
    expect(projectBoardReadyTicketizationCards(acknowledgedStrictBoard).map((item) => item.id)).toEqual(["card-1"]);
    expect(projectBoardCreateReadyTasksState(acknowledgedStrictBoard)).toMatchObject({
      count: 1,
      disabled: false,
      title: expect.stringContaining("acknowledged proof-scope warning"),
    });
  });

  it("links cards back to their source basis", () => {
    const source = {
      id: "source-gdd",
      boardId: "board-1",
      kind: "functional_spec" as const,
      sourceKey: "docs/GDD.md",
      title: "Game Design Document",
      summary: "Main game scope",
      path: "docs/GDD.md",
      relevance: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const card = {
      id: "card-1",
      boardId: "board-1",
      title: "Implement ship controls",
      description: "Controls from GDD.",
      status: "draft" as const,
      candidateStatus: "needs_clarification" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Ship moves."],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis:ship-controls",
      sourceRefs: ["source-gdd", "docs/GDD.md"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    expect(projectBoardCardSourceBasis(card, [source])[0]).toEqual(
      expect.objectContaining({ label: "Game Design Document", sourceId: "source-gdd" }),
    );
    expect(projectBoardCardsForSourceGroup({ id: "group-1", primary: source, observations: [source], generatedObservationCount: 0 }, [card])).toHaveLength(1);
  });

  it("builds source review filters from canonical source groups", () => {
    const sourceBase = {
      boardId: "board-1",
      summary: "Relevant source",
      relevance: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      classifiedBy: "ambient_pi" as const,
      includeInSynthesis: true,
      classificationReason: "Pi selected this source for planning.",
    };
    const sources = [
      { ...sourceBase, id: "source-1", title: "Architecture", kind: "architecture_artifact" as const, path: "docs/architecture.md", changeState: "new" as const },
      { ...sourceBase, id: "source-2", title: "Workflow", kind: "workflow_artifact" as const, path: "WORKFLOW.md", changeState: "changed" as const },
      { ...sourceBase, id: "source-3", title: "Workflow", kind: "workflow_artifact" as const, path: "test-results/WORKFLOW.md", changeState: "changed" as const },
      {
        ...sourceBase,
        id: "source-4",
        title: "Scratch",
        kind: "ignored" as const,
        path: "scratch.md",
        changeState: "unchanged" as const,
        classifiedBy: "user" as const,
        includeInSynthesis: false,
      },
    ];
    const groups = projectBoardSourceGroups(sources);

    expect(groups).toHaveLength(3);
    const workflowGroup = groups.find((group) => group.primary.title === "Workflow")!;
    expect(workflowGroup.primary.path).toBe("WORKFLOW.md");
    expect(projectBoardSourceObservationLabel(workflowGroup)).toBe("2 observations, 1 generated");
    expect(projectBoardSourceFilterItems(groups)).toEqual([
      { kind: "all", label: "All", count: 3 },
      { kind: "included_sources", label: "Included", count: 2 },
      { kind: "ignored_sources", label: "Ignored for synthesis", count: 1 },
      { kind: "architecture_artifact", label: "Architecture", count: 1 },
      { kind: "ignored", label: "Ignored", count: 1 },
      { kind: "workflow_artifact", label: "Workflow", count: 1 },
    ]);
    expect(projectBoardSourceGroupsForFilter(groups, "included_sources").map((group) => group.primary.title)).toEqual(["Architecture", "Workflow"]);
    expect(projectBoardSourceGroupsForFilter(groups, "ignored_sources").map((group) => group.primary.title)).toEqual(["Scratch"]);
    expect(projectBoardSourcesForFilter(sources, "included_sources").map((source) => source.id)).toEqual(["source-1", "source-2", "source-3"]);
    expect(projectBoardSourcesForFilter(sources, "ignored_sources").map((source) => source.id)).toEqual(["source-4"]);
    expect(projectBoardSourcesForFilter(sources, "workflow_artifact").map((source) => source.id)).toEqual(["source-2", "source-3"]);
    expect(projectBoardSourcesForFilter(sources, "all")).toHaveLength(4);
    expect(projectBoardSourceChangeFilterItems(groups)).toEqual([
      { kind: "all", label: "All changes", count: 3 },
      { kind: "new", label: "New", count: 1 },
      { kind: "changed", label: "Changed", count: 1 },
      { kind: "unchanged", label: "Unchanged", count: 1 },
    ]);
    expect(projectBoardSourceGroupsForChangeFilter(groups, "changed").map((group) => group.primary.title)).toEqual(["Workflow"]);
    const sourceSummary = projectBoardSourceChangeSummary(groups, [
        {
          id: "event-1",
          boardId: "board-1",
          kind: "sources_refreshed",
          title: "Sources refreshed",
          summary: "",
          metadata: { removedCount: 2 },
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ]);
    expect(sourceSummary).toMatchObject({
      newCount: 1,
      changedCount: 1,
      unchangedCount: 1,
      removedCount: 2,
      includedCount: 2,
      ignoredCount: 1,
      headline: "1 new, 1 changed, 2 removed since the last refresh.",
    });
    expect(sourceSummary.detail).toContain("2 included for Decisions and card generation");
    expect(sourceSummary.detail).toContain("1 ignored but visible");
    expect(sourceSummary.refreshTitle).toContain("Ignored sources stay visible in inventory");
    expect(sourceSummary.refreshTitle).toContain("User source classifications are preserved");
    expect(projectBoardSourceChangeDetail(workflowGroup)).toContain("Changed. Workflow, Included in synthesis. classified by Pi");

    const ignoredGroup = groups.find((group) => group.primary.kind === "ignored")!;
    expect(projectBoardSourceInclusion(workflowGroup.primary)).toMatchObject({
      included: true,
      label: "Included",
      addCardsEligible: true,
    });
    expect(projectBoardSourceInclusion(ignoredGroup.primary)).toMatchObject({
      included: false,
      label: "Ignored",
      badgeLabel: "Ignored for synthesis",
      addCardsEligible: false,
    });
    expect(projectBoardSourceChangeDetail(ignoredGroup)).toContain("Visible in source inventory and refresh history");
    expect(projectBoardSourceGroupCanElaborate(workflowGroup)).toBe(true);
    expect(projectBoardSourceGroupCanElaborate(ignoredGroup)).toBe(false);
    expect(projectBoardSourceGroupIncludedSourceIds(workflowGroup)).toEqual(["source-2", "source-3"]);
    expect(projectBoardSourceGroupIncludedSourceIds(ignoredGroup)).toEqual([]);

    const scope = projectBoardAddCardsSourceScope(groups, [workflowGroup.id]);
    expect(scope).toMatchObject({
      selectedGroupCount: 1,
      selectedObservationCount: 2,
      selectedSourceIds: ["source-2", "source-3"],
      disabled: false,
      label: "Elaborate 1 Source",
    });
    expect(projectBoardAddCardsSourceScope(groups, [ignoredGroup.id])).toMatchObject({
      selectedGroupCount: 0,
      selectedObservationCount: 0,
      selectedSourceIds: [],
      disabled: true,
      label: "Select Sources",
    });
    expect(projectBoardAddCardsSourceScope(groups, [workflowGroup.id, ignoredGroup.id])).toMatchObject({
      selectedGroupCount: 1,
      selectedObservationCount: 2,
      selectedSourceIds: ["source-2", "source-3"],
    });
    expect(projectBoardAddCardsSourceScope(groups, [], true)).toMatchObject({
      disabled: true,
      label: "Elaborating",
    });

    const durableGroups = [
      {
        id: "durable-plan",
        primary: {
          ...sourceBase,
          id: "durable-plan-source",
          title: "Refined Durable Plan",
          kind: "plan_artifact" as const,
          path: ".ambient/board/plans/App-DurablePlan.html",
          authorityRole: "primary" as const,
        },
        observations: [],
        generatedObservationCount: 0,
      },
      {
        id: "chat-thread",
        primary: {
          ...sourceBase,
          id: "chat-source",
          title: "Planning chat",
          kind: "thread" as const,
          threadId: "thread-1",
          authorityRole: "ignored" as const,
          includeInSynthesis: false,
        },
        observations: [],
        generatedObservationCount: 0,
      },
    ];
    const durableSummary = projectBoardSourceChangeSummary(durableGroups);
    expect(durableSummary).toMatchObject({
      durablePlanPrimaryCount: 1,
      durablePlanIgnoredThreadCount: 1,
      sourceAuthorityNotice: "Durable plan selected as source of truth; 1 chat thread ignored by default.",
    });
    expect(durableSummary.detail).toContain("Durable plan selected as source of truth");
    expect(projectBoardSourceFilterItems(durableGroups)).toEqual([
      { kind: "all", label: "All", count: 2 },
      { kind: "included_sources", label: "Included", count: 1 },
      { kind: "ignored_sources", label: "Ignored for synthesis", count: 1 },
      { kind: "ignored_threads", label: "Ignored threads", count: 1 },
      { kind: "plan_artifact", label: "Plan", count: 1 },
      { kind: "thread", label: "Thread", count: 1 },
    ]);
    expect(projectBoardSourceGroupsForFilter(durableGroups, "ignored_threads").map((group) => group.primary.title)).toEqual(["Planning chat"]);
  });

  it("previews source inclusion impact without rewriting existing cards", () => {
    const sourceBase = {
      boardId: "board-1",
      summary: "Planning context.",
      relevance: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const durableSource = {
      ...sourceBase,
      id: "durable-plan-source",
      title: "Refined Durable Plan",
      kind: "plan_artifact" as const,
      path: ".ambient/board/plans/App-DurablePlan.html",
      authorityRole: "primary" as const,
      includeInSynthesis: true,
      byteSize: 6000,
    };
    const chatSource = {
      ...sourceBase,
      id: "chat-source",
      title: "Planning chat",
      kind: "thread" as const,
      threadId: "thread-1",
      includeInSynthesis: false,
      authorityRole: "ignored" as const,
      byteSize: 9000,
    };
    const includedChatSource = {
      ...sourceBase,
      id: "included-chat-source",
      title: "Promoted UX chat",
      kind: "thread" as const,
      threadId: "thread-2",
      includeInSynthesis: true,
      byteSize: 7000,
    };
    const baseCard: ProjectBoardCard = {
      id: "card-1",
      boardId: "board-1",
      title: "Draft from chat",
      description: "",
      status: "draft",
      candidateStatus: "ready_to_create",
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "board_synthesis",
      sourceId: "included-chat-source",
      sourceRefs: ["included-chat-source", "thread-2"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const readyCard: ProjectBoardCard = {
      ...baseCard,
      id: "card-2",
      title: "Ready from durable plan",
      status: "ready",
      sourceId: "durable-plan-source",
      sourceRefs: ["durable-plan-source"],
    };

    const board = { sources: [durableSource, chatSource, includedChatSource], cards: [baseCard, readyCard] };
    const defaultPreview = projectBoardSourceImpactPreview(board);

    expect(defaultPreview).toMatchObject({
      modelCallRequired: false,
      durablePlanPrimaryCount: 1,
      includedChatCount: 1,
      ignoredChatCount: 1,
      affectedDraftCount: 1,
      affectedExecutableCount: 0,
    });
    expect(defaultPreview.headline).toBe("Durable plan primary; 1 chat excluded");
    expect(defaultPreview.detail).toContain("Existing board cards are not rewritten by default.");
    expect(defaultPreview.metrics.find((metric) => metric.label === "Card rewrites")?.value).toBe(0);

    const selectedGroup = projectBoardSourceGroups(board.sources).find((group) => group.primary.id === "included-chat-source")!;
    const selectedPreview = projectBoardSourceImpactPreview(board, { selectedGroupIds: [selectedGroup.id] });

    expect(selectedPreview).toMatchObject({
      modelCallRequired: true,
      selectedGroupCount: 1,
      selectedObservationCount: 1,
      estimatedPromptChars: 7000,
      affectedCardIds: ["card-1"],
      affectedDraftCount: 1,
    });
    expect(selectedPreview.headline).toBe("1 source group can elaborate additive cards");
    expect(selectedPreview.groups[0]).toMatchObject({
      title: "Promoted UX chat",
      kindLabel: "Thread",
      included: true,
      estimatedPromptChars: 7000,
      affectedDraftCount: 1,
    });
    expect(selectedPreview.cards[0]).toMatchObject({ cardId: "card-1", sourceLabel: "Draft can refresh" });
  });

  it("suggests editable kickoff defaults from source authority context", () => {
    const board = {
      id: "board-1",
      projectPath: "/workspace/app",
      status: "draft" as const,
      title: "Asteroids",
      summary: "",
      cards: [],
      sources: [
        {
          id: "durable-plan-source",
          boardId: "board-1",
          title: "Revised Durable Plan",
          kind: "plan_artifact" as const,
          path: ".ambient/board/plans/Asteroids-DurablePlan.html",
          summary: "Authoritative plan.",
          relevance: 1,
          includeInSynthesis: true,
          authorityRole: "primary" as const,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "thread-source",
          boardId: "board-1",
          title: "Planning chat",
          kind: "thread" as const,
          threadId: "thread-1",
          summary: "Older thread.",
          relevance: 1,
          includeInSynthesis: false,
          authorityRole: "ignored" as const,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      questions: [],
      proposals: [],
      events: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(
      projectBoardKickoffDefaultAnswer(
        board,
        {
          id: "question-1",
          boardId: "board-1",
          question: "Which sources are authoritative?",
          required: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        1,
      ),
    ).toContain("Revised Durable Plan");
    expect(
      projectBoardKickoffDefaultAnswer(
        board,
        {
          id: "answered",
          boardId: "board-1",
          question: "Goal?",
          required: true,
          answer: "Saved answer",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        0,
      ),
    ).toBe("Saved answer");
    expect(
      projectBoardKickoffDefaultAnswer(
        board,
        {
          id: "execution-policy",
          boardId: "board-1",
          question: "How should Ambient sequence and retry card execution when work is blocked or incomplete?",
          required: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        4,
      ),
    ).toContain("retry transient failures");
  });

  it("formats kickoff default provider errors without leaking raw JSON", () => {
    const message = projectBoardKickoffDefaultProviderErrorMessage(
      'Ambient project-board kickoff default suggestion failed (402): {"error":{"message":"Daily and monthly free usage exhausted. Daily budget resets in 20 hours. Purchase credits for uninterrupted access.","type":"insufficient_quota_error"}}',
    );

    expect(message).toBe(
      "Ambient/Pi default suggestion failed (HTTP 402): Daily and monthly free usage exhausted. Daily budget resets in 20 hours. Purchase credits for uninterrupted access. (quota limit)",
    );
    expect(message).not.toContain('{"error"');
  });

  it("models board tabs, dependency rows, phase groups, and proof summary", () => {
    const base = {
      boardId: "board-1",
      description: "",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const cards = [
      { ...base, id: "card-1", title: "Foundation", phase: "Phase 1", priority: 1, orchestrationTaskId: "task-1", testPlan: { ...base.testPlan, unit: ["unit"] } },
      { ...base, id: "card-2", title: "Dependent", phase: "Phase 2", priority: 2, orchestrationTaskId: "task-2", blockedBy: ["card-1"] },
      { ...base, id: "card-3", title: "Candidate", status: "draft" as const, phase: "Phase 2" },
    ];
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        cards,
        sources: [
          {
            id: "source-1",
            boardId: "board-1",
            kind: "markdown",
            title: "README",
            summary: "Project notes",
            path: "README.md",
            relevance: 0.8,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        questions: [],
        proposals: [],
        events: [
          {
            id: "event-1",
            boardId: "board-1",
            kind: "plan_promoted",
            title: "Plan added to board",
            summary: "Project plan entered the draft inbox.",
            entityKind: "project_board_card",
            entityId: "card-3",
            metadata: { artifactId: "artifact-1" },
            createdAt: "2026-01-01T00:05:00.000Z",
          },
        ],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    expect(projectBoardTabs(board).map((tab) => [tab.id, tab.count])).toEqual([
      ["overview", 3],
      ["charter", 1],
      ["decisions", 0],
      ["draft_inbox", 1],
      ["map", 2],
      ["board", 2],
      ["proof", 2],
      ["integration", 0],
      ["history", 1],
    ]);
    board.proposals = [
      {
        id: "proposal-1",
        boardId: "board-1",
        status: "pending",
        summary: "Pi proposal",
        goal: "Goal",
        currentState: "State",
        targetUser: "User",
        qualityBar: "Proof required.",
        assumptions: [],
        questions: ["Which control model should ship first?"],
        answers: [],
        sourceNotes: [],
        cards: [],
        createdAt: "2026-01-01T00:06:00.000Z",
        updatedAt: "2026-01-01T00:06:00.000Z",
      },
    ];
    expect(projectBoardTabs(board).find((tab) => tab.id === "decisions")?.count).toBe(1);
    expect(defaultProjectBoardTab(board)).toBe("decisions");
    expect(projectBoardEventKindLabel(board.events![0].kind)).toBe("Plan");
    expect(projectBoardEventKindLabel("synthesis_proposal_created")).toBe("Proposal");
    expect(projectBoardEventKindLabel("synthesis_proposal_answered")).toBe("Proposal");
    expect(projectBoardEventKindLabel("synthesis_proposal_card_reviewed")).toBe("Proposal");
    expect(projectBoardEventKindLabel("board_revision_started")).toBe("Revision");
    expect(projectBoardEventKindLabel("manual_card_created")).toBe("Manual");
    expect(projectBoardEventKindLabel("source_updated")).toBe("Source");
    expect(projectBoardEventKindLabel("ready_tasks_created")).toBe("Ticket");
    expect(projectBoardEventKindLabel("card_proof_reviewed")).toBe("Proof");
    expect(projectBoardEventKindLabel("card_proof_review_ignored")).toBe("Proof");
    expect(projectBoardEventKindLabel("card_execution_session_assigned")).toBe("Session");
    expect(projectBoardEventKindLabel("card_run_completed")).toBe("Run");
    expect(projectBoardEventKindLabel("card_run_handoff_created")).toBe("Handoff");
    expect(projectBoardEventKindLabel("card_claimed")).toBe("Claim");
    expect(projectBoardEventKindLabel("execution_readiness_blocked")).toBe("Execution");
    expect(projectBoardEventKindLabel("workflow_created")).toBe("Workflow");
    expect(projectBoardEventKindLabel("workflow_raw_updated")).toBe("Workflow");
    expect(projectBoardEventKindLabel("deliverable_integration_resolved")).toBe("Integration");
    expect(projectBoardEventSummary(board.events)).toBe("1 plan event");
    board.status = "draft";
    board.proposals = [];
    expect(defaultProjectBoardTab(board)).toBe("charter");
    board.status = "active";
    board.cards = [
      { ...base, id: "card-draft-only", title: "Candidate only", status: "draft" as const, phase: "Phase 1" },
    ];
    expect(defaultProjectBoardTab(board)).toBe("draft_inbox");
    board.cards = cards;
    expect(projectBoardEventGroups(board.events)).toHaveLength(1);
    expect(projectBoardDependencyRows(cards).find((row) => row.card.id === "card-1")?.unblocks.map((card) => card.id)).toEqual(["card-2"]);
    expect(projectBoardPhaseGroups(cards, new Set(["card-1"])).map((group) => [group.phase, group.cards.length, group.blockedCount, group.readyCount, group.reviewCount, group.criticalPathCount, group.tone])).toEqual([
      ["Phase 1", 1, 0, 1, 0, 1, "critical"],
      ["Phase 2", 2, 1, 1, 0, 0, "blocked"],
    ]);
    expect(projectBoardPhaseGroups([{ ...base, id: "card-review", title: "Review", status: "review" as const, phase: "Phase 3" }])[0]?.tone).toBe("review");
    expect(projectBoardCardVisualTone({ ...base, id: "tone-blocked", title: "Blocked", status: "draft" as const, candidateStatus: "needs_clarification" })).toBe("blocked");
    expect(projectBoardCardVisualTone({ ...base, id: "tone-ready", title: "Ready", status: "ready" as const, candidateStatus: "ready_to_create" }, "ready_now")).toBe("ready");
    expect(projectBoardCardVisualTone({ ...base, id: "tone-running", title: "Running", status: "in_progress" as const }, "running")).toBe("running");
    expect(projectBoardTestSummary(cards)).toMatchObject({
      unit: 1,
      integration: 0,
      visual: 0,
      manual: 0,
      missing: [
        expect.objectContaining({ id: "card-2" }),
        expect.objectContaining({ id: "card-3" }),
      ],
    });
    expect(projectBoardProofCoverageForBoard(board)).toMatchObject({
      unit: [expect.objectContaining({ id: "card-1" })],
      integrationOrBrowser: [],
      manual: [],
      missing: [expect.objectContaining({ id: "card-2" }), expect.objectContaining({ id: "card-3" })],
      strict: false,
      relaxedWarning: true,
    });
  });

  it("counts proof review queue cards in the Proof tab badge", () => {
    const now = "2026-01-01T00:00:00.000Z";
    const card: ProjectBoardCard = {
      id: "card-proof-review",
      boardId: "board-1",
      title: "Review finished proof",
      description: "Inspect the finished run.",
      status: "review",
      candidateStatus: "ready_to_create",
      labels: ["local-task"],
      blockedBy: [],
      acceptanceCriteria: ["Proof is inspectable."],
      testPlan: { unit: ["Run unit proof."], integration: [], visual: [], manual: [] },
      sourceKind: "manual",
      sourceId: "manual:card-proof-review",
      orchestrationTaskId: "task-proof-review",
      proofReview: {
        status: "ready_for_review",
        summary: "Proof is ready for PM review.",
        satisfied: ["Unit proof passed."],
        missing: [],
        followUpCardIds: [],
        runId: "run-proof-review",
        reviewedAt: now,
        reviewer: "deterministic",
        recommendedAction: "close",
      },
      createdAt: now,
      updatedAt: now,
    };
    const task: OrchestrationTask = {
      id: "task-proof-review",
      identifier: "LOCAL-1",
      title: "Review finished proof",
      state: "needs_review",
      labels: ["project-board"],
      blockedBy: [],
      sourceKind: "project_board_card",
      projectPath: "/workspace/app",
      createdAt: now,
      updatedAt: now,
    };
    const run: OrchestrationRun = {
      id: "run-proof-review",
      taskId: task.id,
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/workspace/app/.ambient-codex/orchestration/workspaces/LOCAL-1",
      startedAt: now,
      finishedAt: now,
      proofOfWork: {
        kind: "agent-run",
        commands: ["pnpm test"],
        changedFiles: ["src/proof.ts"],
      },
    };
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        cards: [card],
        sources: [],
        questions: [],
        proposals: [],
        events: [],
        createdAt: now,
        updatedAt: now,
      },
    }).board!;
    const orchestration = { tasks: [task], runs: [run] };

    expect(projectBoardTestSummaryForBoard(board).missing).toHaveLength(0);
    expect(projectBoardProofReviewQueueSummary(board, orchestration)).toMatchObject({
      count: 1,
      cardIds: ["card-proof-review"],
    });
    expect(projectBoardTabs(board, orchestration).find((tab) => tab.id === "proof")?.count).toBe(1);
  });

  it("excludes sibling-board deliverables from the integration queue", () => {
    const now = "2026-01-01T00:00:00.000Z";
    // Two boards share one workspace folder: this board's card links task-1; task-2
    // belongs to the OTHER board (a board-card task with no card here).
    const card: ProjectBoardCard = {
      id: "card-own",
      boardId: "board-1",
      title: "Implement Unit Converter App",
      description: "Build the converter.",
      status: "review",
      candidateStatus: "ready_to_create",
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Converter works."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Open it."] },
      sourceKind: "board_synthesis",
      sourceId: "synthesis:converter",
      orchestrationTaskId: "task-1",
      createdAt: now,
      updatedAt: now,
    };
    const ownTask: OrchestrationTask = {
      id: "task-1",
      identifier: "LOCAL-1",
      title: "Implement Unit Converter App",
      description: "Build the converter.",
      state: "review",
      labels: ["project-board"],
      blockedBy: [],
      sourceKind: "project_board_card",
      projectPath: "/workspace/app",
      createdAt: now,
      updatedAt: now,
    };
    const foreignTask: OrchestrationTask = {
      ...ownTask,
      id: "task-2",
      identifier: "LOCAL-2",
      title: "Scaffold Vite project (other board)",
    };
    const manualTask: OrchestrationTask = {
      ...ownTask,
      id: "task-3",
      identifier: "LOCAL-3",
      title: "Manual local task",
      sourceKind: "manual",
    };
    const run = (id: string, taskId: string): OrchestrationRun => ({
      id,
      taskId,
      attemptNumber: 1,
      status: "completed",
      workspacePath: `/workspace/app/.ambient-codex/orchestration/workspaces/${taskId}`,
      startedAt: now,
      finishedAt: now,
      proofOfWork: { kind: "agent-run", changedFiles: ["index.html"], artifactFiles: [], commands: [], commits: [], dependencyImports: [] },
    });
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "Converter board",
        summary: "Active",
        cards: [card],
        sources: [],
        questions: [],
        proposals: [],
        events: [],
        createdAt: now,
        updatedAt: now,
      },
    }).board!;
    const orchestration = { tasks: [ownTask, foreignTask, manualTask], runs: [run("run-1", "task-1"), run("run-2", "task-2"), run("run-3", "task-3")] };

    const queue = projectBoardDeliverableIntegrationQueue(board, orchestration);

    const titles = queue.items.map((item) => item.task?.title);
    // Own card's run and the manual (non-board) task stay; the sibling board's run is excluded.
    expect(titles).toContain("Implement Unit Converter App");
    expect(titles).toContain("Manual local task");
    expect(titles).not.toContain("Scaffold Vite project (other board)");
    expect(queue.items).toHaveLength(2);
  });

  it("models deliverable integration as an explicit apply/export/defer queue", () => {
    const now = "2026-01-01T00:00:00.000Z";
    const card: ProjectBoardCard = {
      id: "card-deliverable",
      boardId: "board-1",
      title: "Build Pomodoro root",
      description: "Create the Pomodoro app files.",
      status: "review",
      candidateStatus: "ready_to_create",
      phase: "Phase 2",
      labels: ["local-task"],
      blockedBy: [],
      acceptanceCriteria: ["Pomodoro app files are ready to review."],
      testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
      sourceKind: "manual",
      sourceId: "manual:card-deliverable",
      orchestrationTaskId: "task-1",
      createdAt: now,
      updatedAt: now,
    };
    const task: OrchestrationTask = {
      id: "task-1",
      identifier: "LOCAL-1",
      title: "Build Pomodoro root",
      description: "Create the Pomodoro app files.",
      state: "review",
      labels: ["project-board"],
      blockedBy: [],
      sourceKind: "project_board_card",
      projectPath: "/workspace/app",
      createdAt: now,
      updatedAt: now,
    };
    const run: OrchestrationRun = {
      id: "run-1",
      taskId: task.id,
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/workspace/app/.ambient-codex/orchestration/workspaces/LOCAL-1",
      startedAt: now,
      finishedAt: now,
      proofOfWork: {
        kind: "agent-run",
        changedFiles: ["index.html", "src/pomodoro.ts", "tests/pomodoro.spec.ts", ".ambient-codex/session.json", "node_modules/cache/index.js"],
        artifactFiles: ["dist/screenshot.png"],
        commands: ["pnpm test"],
        commits: ["abc123"],
        dependencyImports: ["date-fns"],
      },
    };
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        cards: [card],
        sources: [],
        questions: [],
        proposals: [],
        events: [],
        createdAt: now,
        updatedAt: now,
      },
    }).board!;
    const orchestration = { tasks: [task], runs: [run] };

    const pending = projectBoardDeliverableIntegrationQueue(board, orchestration);
    expect(pending).toMatchObject({
      pendingCount: 1,
      materialFileCount: 4,
      excludedFileCount: 2,
    });
    expect(pending.items[0]).toMatchObject({
      status: "pending",
      materialFiles: expect.arrayContaining([expect.objectContaining({ path: "index.html" }), expect.objectContaining({ path: "src/pomodoro.ts" })]),
      excludedFiles: expect.arrayContaining([
        expect.objectContaining({ path: ".ambient-codex/session.json", exclusionReason: "runtime_folder" }),
        expect.objectContaining({ path: "node_modules/cache/index.js", exclusionReason: "dependency_folder" }),
      ]),
    });
    expect(pending.items[0].actions.map((action) => [action.action, action.disabled])).toEqual([
      ["apply_to_root", false],
      ["export_bundle", false],
      ["defer", false],
    ]);
    expect(projectBoardTabs(board, orchestration).find((tab) => tab.id === "integration")?.count).toBe(1);

    board.events = [
      {
        id: "event-deferred",
        boardId: board.id,
        kind: "deliverable_integration_resolved",
        title: "Deliverable integration deferred",
        summary: "Deferred.",
        entityKind: "orchestration_run",
        entityId: run.id,
        metadata: {
          runId: run.id,
          taskId: task.id,
          cardId: card.id,
          action: "defer",
          status: "deferred",
          materialFiles: ["index.html"],
          excludedFiles: [".ambient-codex/session.json"],
          appliedFiles: [],
          skippedFiles: [],
          reason: "Waiting for PM design review.",
        },
        createdAt: "2026-01-01T00:01:00.000Z",
      },
      {
        id: "event-integrated",
        boardId: board.id,
        kind: "deliverable_integration_resolved",
        title: "Deliverables applied to project root",
        summary: "Applied.",
        entityKind: "orchestration_run",
        entityId: run.id,
        metadata: {
          runId: run.id,
          taskId: task.id,
          cardId: card.id,
          action: "apply_to_root",
          status: "integrated",
          materialFiles: ["index.html", "src/pomodoro.ts"],
          excludedFiles: [".ambient-codex/session.json"],
          appliedFiles: ["index.html", "src/pomodoro.ts"],
          skippedFiles: [],
        },
        createdAt: "2026-01-01T00:02:00.000Z",
      },
    ];
    const resolved = projectBoardDeliverableIntegrationQueue(board, orchestration);
    expect(resolved.pendingCount).toBe(0);
    expect(resolved.integratedCount).toBe(1);
    expect(resolved.deferredCount).toBe(0);
    expect(resolved.items[0]).toMatchObject({ status: "integrated", actionLabel: "Integrated" });
    expect(resolved.items[0].actions.every((action) => action.disabled)).toBe(true);
  });

  it("models Start Fresh superseded-card history review from audit metadata", () => {
    const event: ProjectBoardEvent = {
      id: "evt-start-fresh",
      boardId: "board-1",
      kind: "card_updated",
      title: "Start Fresh cleared draft synthesis cards",
      summary: "Superseded 1 untouched draft synthesis card. Moved 1 preserved card back to non-active review.",
      entityKind: "project_board_synthesis_run",
      entityId: "run-abandoned",
      metadata: {
        decision: "start_fresh_supersede_drafts",
        abandonedRunId: "run-abandoned",
        supersededDraftCardIds: ["card-superseded"],
        supersededDraftCards: [
          {
            cardId: "card-superseded",
            title: "Old generated shell",
            sourceId: "synthesis:shell",
            status: "draft",
            candidateStatus: "ready_to_create",
            clarificationQuestionCount: 2,
          },
        ],
        preservedCardIds: ["card-preserved"],
        preservedCards: [
          {
            cardId: "card-preserved",
            title: "User edited gameplay loop",
            sourceId: "synthesis:gameplay",
            status: "ready",
            candidateStatus: "ready_to_create",
            userTouchedFields: ["description"],
            orchestrationTaskId: "task-1",
          },
        ],
        demotedPreservedCardIds: ["card-preserved"],
      },
      createdAt: "2026-01-01T00:08:00.000Z",
    };

    expect(projectBoardEventHasSupersededCardReview(event)).toBe(true);
    expect(projectBoardSupersededCardReview([event])).toMatchObject({
      eventCount: 1,
      supersededCount: 1,
      demotedCount: 1,
      preservedCount: 0,
      summary: "1 superseded draft card, 1 preserved card moved back to review",
      items: [
        {
          category: "superseded",
          cardId: "card-superseded",
          title: "Old generated shell",
          sourceId: "synthesis:shell",
          runId: "run-abandoned",
          clarificationQuestionCount: 2,
        },
        {
          category: "demoted",
          cardId: "card-preserved",
          title: "User edited gameplay loop",
          userTouchedFields: ["description"],
          orchestrationTaskId: "task-1",
        },
      ],
    });
    expect(projectBoardSupersededCardReview([{ ...event, metadata: {} }]).summary).toBe("No Start Fresh superseded cards have been recorded yet.");
  });

  it("models existing Local Tasks that can be imported into a project board", () => {
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        cards: [
          {
            id: "card-1",
            boardId: "board-1",
            title: "Attached",
            description: "",
            status: "ready",
            candidateStatus: "ready_to_create",
            labels: [],
            blockedBy: [],
            acceptanceCriteria: [],
            testPlan: { unit: [], integration: [], visual: [], manual: [] },
            sourceKind: "local_task_import",
            sourceId: "task-attached",
            orchestrationTaskId: "task-attached",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        sources: [],
        questions: [],
        proposals: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;
    const tasks = [
      {
        id: "task-attached",
        identifier: "LOCAL-1",
        title: "Already attached",
        state: "ready",
        labels: [],
        blockedBy: [],
        sourceKind: "local",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "task-orphan",
        identifier: "LOCAL-2",
        title: "Orphan task",
        state: "todo",
        labels: [],
        blockedBy: [],
        sourceKind: "local",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "task-board-owned",
        identifier: "LOCAL-3",
        title: "Board owned",
        state: "ready",
        labels: [],
        blockedBy: [],
        sourceKind: "project_board_card",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    expect(projectBoardUnattachedLocalTasks(board, tasks).map((task) => task.id)).toEqual(["task-orphan"]);
  });

  it("groups project board proof coverage by validation style", () => {
    const base = {
      boardId: "board-1",
      description: "",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        cards: [
          { ...base, id: "unit", title: "Unit", testPlan: { ...base.testPlan, unit: ["pnpm test"] } },
          { ...base, id: "integration", title: "Integration", testPlan: { ...base.testPlan, integration: ["pnpm e2e"] } },
          { ...base, id: "visual", title: "Visual", testPlan: { ...base.testPlan, visual: ["visual smoke"] } },
          { ...base, id: "manual", title: "Manual", testPlan: { ...base.testPlan, manual: ["review"] } },
          { ...base, id: "missing", title: "Missing" },
          { ...base, id: "evidence", title: "Evidence", candidateStatus: "evidence" as const },
        ],
        sources: [],
        questions: [],
        proposals: [],
        charter: {
          id: "charter-1",
          boardId: "board-1",
          version: 1,
          status: "active",
          goal: "",
          currentState: "",
          targetUser: "",
          nonGoals: [],
          qualityBar: "Require proof",
          testPolicy: { requireProofSpec: true },
          decisionPolicy: {},
          dependencyPolicy: {},
          budgetPolicy: {},
          sourcePolicy: {},
          markdown: "",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    const coverage = projectBoardProofCoverageForBoard(board);

    expect(coverage.unit.map((card) => card.id)).toEqual(["unit"]);
    expect(coverage.integration.map((card) => card.id)).toEqual(["integration"]);
    expect(coverage.visual.map((card) => card.id)).toEqual(["visual"]);
    expect(coverage.integrationOrBrowser.map((card) => card.id)).toEqual(["integration", "visual"]);
    expect(coverage.manual.map((card) => card.id)).toEqual(["manual"]);
    expect(coverage.missing.map((card) => card.id)).toEqual(["missing"]);
    expect(coverage.strict).toBe(true);
    expect(coverage.relaxedWarning).toBe(false);
  });

  it("detects unresolved blockers, cycles, and deterministic dependency order", () => {
    const base = {
      boardId: "board-1",
      description: "",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-base",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const cards = [
      { ...base, id: "foundation", title: "Foundation", priority: 1, sourceId: "artifact-foundation" },
      { ...base, id: "dependent", title: "Dependent", priority: 2, blockedBy: ["foundation", "missing-ref"] },
      { ...base, id: "cycle-a", title: "Cycle A", priority: 3, blockedBy: ["cycle-b"] },
      { ...base, id: "cycle-b", title: "Cycle B", priority: 4, blockedBy: ["cycle-a"] },
      { ...base, id: "source-ref", title: "Source ref", priority: 5, blockedBy: ["artifact-foundation"], testPlan: { unit: ["unit"], integration: [], visual: [], manual: [] } },
    ];

    const health = projectBoardDependencyHealth(cards);

    expect(health.unresolved.map((item) => [item.card.id, item.blockerRef])).toEqual([["dependent", "missing-ref"]]);
    expect(health.cycles).toEqual([{ cardIds: ["cycle-a", "cycle-b"], titles: ["Cycle A", "Cycle B"] }]);
    expect(health.cycleRepairSuggestions[0]).toMatchObject({
      card: expect.objectContaining({ id: "cycle-b" }),
      blocker: expect.objectContaining({ id: "cycle-a" }),
      blockerRef: "cycle-a",
    });
    expect(health.criticalPath.cards.map((card) => card.id)).toEqual(["foundation", "dependent"]);
    expect(health.criticalPath.summary).toContain("2-card critical path");
    expect(health.orderedCards.slice(0, 3).map((card) => card.id)).toEqual(["foundation", "dependent", "source-ref"]);
    expect(health.readiness.map((item) => [item.card.id, item.order, item.state])).toEqual([
      ["foundation", 1, "ready_after_proof"],
      ["dependent", 2, "blocked_issue"],
      ["source-ref", 3, "waiting_on_dependencies"],
      ["cycle-a", 4, "cycle"],
      ["cycle-b", 5, "cycle"],
    ]);
    expect(health.readiness.find((item) => item.card.id === "foundation")).toMatchObject({
      impactLabel: "Would make 1 downstream card ready.",
      criticalPath: true,
      criticalPathIndex: 1,
    });
  });

  it("classifies card dependency badges by current blocker state", () => {
    const base = {
      boardId: "board-1",
      description: "",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: ["unit"], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-base",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const cards: ProjectBoardCard[] = [
      { ...base, id: "done-card", title: "Finished foundation", status: "done", orchestrationTaskId: "task-done" },
      { ...base, id: "ready-card", title: "Still waiting", status: "ready", orchestrationTaskId: "task-ready" },
      { ...base, id: "dependent", title: "Dependent", status: "in_progress", blockedBy: ["done-card", "ready-card", "missing-ref", "LOCAL-7"] },
    ];
    const tasks = [
      {
        id: "task-done",
        identifier: "LOCAL-1",
        title: "Finished foundation",
        state: "done",
        labels: [],
        blockedBy: [],
        sourceKind: "project_board_card",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "task-ready",
        identifier: "LOCAL-2",
        title: "Still waiting",
        state: "ready",
        labels: [],
        blockedBy: [],
        sourceKind: "project_board_card",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "task-review",
        identifier: "LOCAL-7",
        title: "Review handoff",
        state: "review",
        labels: [],
        blockedBy: [],
        sourceKind: "local",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    expect(projectBoardCardDependencyBadges(cards[2], cards, { tasks }).map((badge) => [badge.ref, badge.prefix, badge.state, badge.label])).toEqual([
      ["done-card", "Dependency ready", "satisfied", "Finished foundation"],
      ["ready-card", "Blocked by", "blocked", "Still waiting"],
      ["missing-ref", "Unresolved blocker", "unresolved", "missing-ref"],
      ["LOCAL-7", "Dependency ready", "satisfied", "LOCAL-7"],
    ]);
  });

  it("previews dependency edit impact before mutating blocker lists", () => {
    const base = {
      boardId: "board-1",
      description: "",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: ["unit"], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-base",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const cards = [
      { ...base, id: "foundation", title: "Foundation", priority: 1 },
      { ...base, id: "feature", title: "Feature", priority: 2, blockedBy: ["foundation"] },
      { ...base, id: "polish", title: "Polish", priority: 3, blockedBy: ["feature"] },
    ];

    const removeImpact = projectBoardDependencyChangeImpactPreview(cards[1], cards, {
      action: "remove_blocker",
      blockerRef: "foundation",
    });
    const cycleImpact = projectBoardDependencyChangeImpactPreview(cards[0], cards, {
      action: "add_blocker",
      blockerRef: "polish",
    });

    expect(removeImpact).toMatchObject({
      visible: true,
      tone: "ready",
      modelCallRequired: false,
      existingCardsRewritten: false,
      blockerLabel: "Foundation",
      beforeState: "waiting_on_dependencies",
      afterState: "ready_now",
      readyNowDelta: 1,
      issueDelta: 0,
    });
    expect(removeImpact.deltaLabel).toBe("+1 ready");
    expect(removeImpact.affectedCards.map((item) => [item.cardId, item.beforeLabel, item.afterLabel])).toContainEqual([
      "feature",
      "Waiting on dependencies (#2)",
      "Ready now (#2)",
    ]);
    expect(cycleImpact).toMatchObject({
      visible: true,
      tone: "danger",
      issueDelta: 1,
      beforeState: "ready_now",
      afterState: "cycle",
    });
    expect(cycleImpact.headline).toContain("dependency issues");
    expect(cycleImpact.afterMetrics.find((metric) => metric.label === "Issues")?.value).toBe(1);
  });

  it("explains ready, blocked, running, and review map states", () => {
    const base = {
      boardId: "board-1",
      description: "",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: ["unit"], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-base",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const cards = [
      { ...base, id: "done", title: "Done", status: "done" as const, priority: 1 },
      { ...base, id: "running", title: "Running", status: "in_progress" as const, priority: 2 },
      { ...base, id: "review", title: "Review", status: "review" as const, priority: 3 },
      { ...base, id: "ready", title: "Ready", priority: 4, blockedBy: ["done"] },
      { ...base, id: "blocked", title: "Blocked", priority: 5, blockedBy: ["running"] },
      { ...base, id: "proof", title: "Proof", priority: 6, testPlan: { unit: [], integration: [], visual: [], manual: [] } },
      { ...base, id: "manual-blocked", title: "Manual Blocked", status: "blocked" as const, priority: 7 },
      {
        ...base,
        id: "clarify",
        title: "Clarify",
        status: "draft" as const,
        candidateStatus: "needs_clarification" as const,
        priority: 8,
        clarificationQuestions: ["Which input model should ship?"],
      },
      {
        ...base,
        id: "ready-unanswered",
        title: "Ready but unanswered",
        status: "draft" as const,
        candidateStatus: "ready_to_create" as const,
        priority: 9,
        clarificationQuestions: ["Which renderer should ship?"],
      },
    ];

    const readiness = projectBoardDependencyHealth(cards).readiness;

    expect(readiness.map((item) => [item.card.id, item.state, item.label])).toEqual([
      ["done", "done", "Done"],
      ["running", "running", "Running"],
      ["review", "waiting_on_review", "Waiting on review"],
      ["ready", "ready_now", "Ready now"],
      ["blocked", "waiting_on_dependencies", "Waiting on dependencies"],
      ["proof", "ready_after_proof", "Ready after proof"],
      ["manual-blocked", "blocked_issue", "Blocked"],
      ["clarify", "needs_clarification", "Needs clarification"],
      ["ready-unanswered", "needs_clarification", "Needs clarification"],
    ]);
    expect(readiness.find((item) => item.card.id === "blocked")?.waitingOn.map((card) => card.id)).toEqual(["running"]);
  });

  it("uses pulled execution proof to satisfy dependency blockers while keeping the card in PM review", () => {
    const base = {
      boardId: "board-1",
      description: "",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Works"],
      testPlan: { unit: ["unit"], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-base",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const cards = [
      { ...base, id: "foundation", title: "Create game shell", priority: 1, sourceId: "artifact-foundation" },
      { ...base, id: "controls", title: "Add controls", priority: 2, blockedBy: ["foundation"], sourceId: "artifact-controls" },
    ];
    const artifact: ProjectBoardExecutionArtifact = {
      id: "run-foundation",
      boardId: "board-1",
      cardId: "foundation",
      status: "completed",
      source: "git",
      workspaceBranch: "board/foundation",
      startedAt: "2026-01-01T00:01:00.000Z",
      updatedAt: "2026-01-01T00:04:00.000Z",
      completedAt: "2026-01-01T00:04:00.000Z",
      proof: {
        summary: "Created the shell with a visible canvas.",
        commands: ["pnpm test"],
        changedFiles: ["src/game.ts"],
        screenshots: [],
        browserTraces: [],
        visualChecks: [],
        manualChecks: [],
        createdAt: "2026-01-01T00:04:00.000Z",
      },
      handoff: {
        summary: "Shell is ready for dependent controls work.",
        completed: ["Mounted canvas."],
        remaining: [],
        risks: [],
        followUps: [],
        createdAt: "2026-01-01T00:04:00.000Z",
      },
      createdAt: "2026-01-01T00:04:00.000Z",
    };
    const board = {
      id: "board-1",
      projectPath: "/workspace/app",
      status: "active" as const,
      title: "Game board",
      summary: "",
      cards,
      sources: [],
      questions: [],
      proposals: [],
      executionArtifacts: [artifact],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:04:00.000Z",
    };

    const readiness = projectBoardDependencyHealth(board).readiness;

    expect(readiness.find((item) => item.card.id === "foundation")).toMatchObject({
      state: "waiting_on_review",
      label: "Pulled proof",
      newlyReadyUnblocks: [expect.objectContaining({ id: "controls" })],
    });
    expect(readiness.find((item) => item.card.id === "controls")).toMatchObject({
      state: "ready_now",
      waitingOn: [],
    });
  });

  it("summarizes pulled execution artifacts for project-manager review", () => {
    const base = {
      boardId: "board-1",
      description: "",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Works"],
      testPlan: { unit: ["unit"], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-base",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const cards = [
      { ...base, id: "shell", title: "Shell", priority: 1, sourceId: "artifact-shell" },
      { ...base, id: "controls", title: "Controls", priority: 2, sourceId: "artifact-controls", blockedBy: ["shell"] },
      { ...base, id: "audio", title: "Audio", priority: 3, sourceId: "artifact-audio" },
      {
        ...base,
        id: "resize-follow-up",
        title: "Add resize regression",
        description: "Pulled handoff follow-up from Shell.\n\nManual-only proof",
        status: "draft" as const,
        candidateStatus: "needs_clarification" as const,
        priority: 4,
        sourceKind: "run_follow_up" as const,
        sourceId: "run-shell#follow-up:1",
        blockedBy: ["shell"],
        labels: ["run-follow-up", "pulled-handoff"],
      },
    ];
    const completed: ProjectBoardExecutionArtifact = {
      id: "run-shell",
      boardId: "board-1",
      cardId: "shell",
      status: "completed",
      source: "git",
      startedAt: "2026-01-01T00:01:00.000Z",
      updatedAt: "2026-01-01T00:02:00.000Z",
      completedAt: "2026-01-01T00:02:00.000Z",
      proof: {
        summary: "Shell proof is present.",
        commands: ["pnpm test"],
        changedFiles: ["src/shell.ts"],
        screenshots: [],
        browserTraces: [],
        visualChecks: [],
        manualChecks: [],
        createdAt: "2026-01-01T00:02:00.000Z",
      },
      handoff: {
        summary: "Shell can unblock controls, but resize should be checked again.",
        completed: ["Canvas mounted."],
        remaining: [],
        risks: ["Resize behavior only checked manually."],
        followUps: [{ title: "Add resize regression", reason: "Manual-only proof", blockedBy: ["shell"] }],
        createdAt: "2026-01-01T00:02:00.000Z",
      },
      createdAt: "2026-01-01T00:02:00.000Z",
    };
    const failed: ProjectBoardExecutionArtifact = {
      id: "run-audio",
      boardId: "board-1",
      cardId: "audio",
      status: "failed",
      source: "git",
      startedAt: "2026-01-01T00:03:00.000Z",
      updatedAt: "2026-01-01T00:04:00.000Z",
      handoff: {
        summary: "Audio manager could not initialize.",
        completed: [],
        remaining: ["Retry with mocked audio context."],
        risks: ["Browser audio policy blocked initialization."],
        followUps: [],
        createdAt: "2026-01-01T00:04:00.000Z",
      },
      createdAt: "2026-01-01T00:04:00.000Z",
    };
    const board = {
      id: "board-1",
      projectPath: "/workspace/app",
      status: "active" as const,
      title: "Game board",
      summary: "",
      cards,
      sources: [],
      questions: [],
      proposals: [],
      executionArtifacts: [completed, failed],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:04:00.000Z",
    };

    const review = projectBoardExecutionPmReview(board);

    expect(review).toMatchObject({
      total: 2,
      completed: 1,
      failed: 1,
      followUpCount: 1,
      riskCount: 2,
    });
    expect(review.impacts.find((impact) => impact.artifact.id === "run-shell")).toMatchObject({
      tone: "warning",
      newlyReadyUnblocks: expect.arrayContaining([
        expect.objectContaining({ id: "controls" }),
      ]),
    });
    expect(review.impacts.find((impact) => impact.artifact.id === "run-shell")?.newlyReadyUnblocks.map((card) => card.id)).not.toContain("resize-follow-up");
    expect(review.impacts.find((impact) => impact.artifact.id === "run-audio")).toMatchObject({
      tone: "danger",
      action: expect.stringContaining("retry"),
    });
    expect(review.materializedFollowUps).toEqual([
      expect.objectContaining({
        card: expect.objectContaining({ id: "resize-follow-up" }),
        parentCard: expect.objectContaining({ id: "shell" }),
        runId: "run-shell",
        statusLabel: "Needs clarification",
        blockerLabel: "Blocked by Shell",
        summary: "Manual-only proof",
      }),
    ]);
    expect(projectBoardTabs(board).find((tab) => tab.id === "decisions")?.count).toBe(0);
    expect(projectBoardDependencyHealth(board).readiness.find((item) => item.card.id === "audio")).toMatchObject({
      state: "blocked_issue",
      label: "Pulled run failed",
    });
  });

  it("builds dependency edit options for unticketized draft cards", () => {
    const base = {
      boardId: "board-1",
      description: "",
      status: "draft" as const,
      candidateStatus: "needs_clarification" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-base",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const card = { ...base, id: "draft", title: "Draft", priority: 2, blockedBy: ["card:ready"] };
    const cards = [
      { ...base, id: "ready", title: "Ready blocker", status: "ready" as const, priority: 1 },
      card,
      { ...base, id: "done", title: "Done blocker", status: "done" as const, priority: 3 },
      { ...base, id: "archived", title: "Archived blocker", status: "archived" as const, priority: 4 },
    ];

    expect(projectBoardCardCanEditDependencies(card)).toBe(true);
    expect(projectBoardCardCanEditDependencies({ ...card, orchestrationTaskId: "task-1" })).toBe(false);
    expect(projectBoardCardCanEditDependencies({ ...card, status: "ready" })).toBe(false);
    expect(projectBoardDependencyEditOptions(card, cards)).toEqual([
      { ref: "ready", label: "Ready blocker", disabled: true, reason: "Already a blocker" },
      { ref: "done", label: "Done blocker", disabled: false, reason: undefined },
    ]);
  });

  it("resolves the first board-card blocker that can be jumped to", () => {
    const base = {
      boardId: "board-1",
      description: "",
      status: "draft" as const,
      candidateStatus: "needs_clarification" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-base",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const blocker = { ...base, id: "draft-blocker", title: "Draft blocker", status: "blocked" as const, sourceId: "artifact-blocker" };
    const ticketizedBlocker = {
      ...base,
      id: "ticketized-blocker",
      title: "Ticketized blocker",
      status: "ready" as const,
      orchestrationTaskId: "task-blocker",
      sourceId: "artifact-ticketized",
    };
    const card = {
      ...base,
      id: "dependent",
      title: "Dependent",
      status: "ready" as const,
      blockedBy: ["missing-ref", "project-board-card:draft-blocker", "task-blocker"],
    };
    const cards = [
      card,
      blocker,
      ticketizedBlocker,
      { ...base, id: "archived-blocker", title: "Archived", status: "archived" as const, sourceId: "artifact-archived" },
    ];

    expect(projectBoardPrimaryBlockingCard(card, cards)?.id).toBe("draft-blocker");
    expect(projectBoardPrimaryBlockingCard({ ...card, blockedBy: ["task-blocker"] }, cards)?.id).toBe("ticketized-blocker");
    expect(projectBoardPrimaryBlockingCard({ ...card, blockedBy: ["dependent", "artifact-archived"] }, cards)).toBeUndefined();
    expect(projectBoardCardIsDraftInboxCandidate(blocker)).toBe(true);
    expect(projectBoardCardIsDraftInboxCandidate(ticketizedBlocker)).toBe(false);
  });

  it("models active card detail from linked task state, dependencies, and run history", () => {
    const base = {
      boardId: "board-1",
      description: "Card description.",
      status: "in_progress" as const,
      candidateStatus: "ready_to_create" as const,
      labels: ["ui"],
      blockedBy: [],
      acceptanceCriteria: ["Accept it"],
      testPlan: { unit: ["Run unit"], integration: ["Run smoke"], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-base",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const cards = [
      { ...base, id: "foundation", title: "Foundation", status: "done" as const, orchestrationTaskId: "task-foundation" },
      {
        ...base,
        id: "active",
        title: "Active card",
        orchestrationTaskId: "task-active",
        blockedBy: ["foundation", "LOCAL-7", "missing-ref"],
      },
      { ...base, id: "dependent", title: "Dependent", status: "ready" as const, blockedBy: ["card:active"] },
    ];
    const tasks = [
      {
        id: "task-active",
        identifier: "LOCAL-8",
        title: "Active task",
        state: "in_progress",
        labels: ["project-board"],
        blockedBy: ["LOCAL-7"],
        sourceKind: "project_board_card",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:05:00.000Z",
      },
      {
        id: "task-blocker",
        identifier: "LOCAL-7",
        title: "Task blocker",
        state: "needs_review",
        labels: [],
        blockedBy: [],
        sourceKind: "local",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:01:00.000Z",
      },
    ];
    const runs = [
      {
        id: "run-old",
        taskId: "task-active",
        attemptNumber: 0,
        status: "failed",
        workspacePath: "/tmp/old",
        startedAt: "2026-01-01T00:01:00.000Z",
      },
      {
        id: "run-new",
        taskId: "task-active",
        attemptNumber: 1,
        status: "running",
        workspacePath: "/tmp/new",
        startedAt: "2026-01-01T00:03:00.000Z",
        proofOfWork: { changedFiles: ["src/App.tsx"] },
      },
    ];

    const detail = projectBoardActiveCardDetail(cards[1], cards, tasks, runs);

    expect(detail.task?.identifier).toBe("LOCAL-8");
    expect(detail.latestRun?.id).toBe("run-new");
    expect(detail.runs.map((run) => run.id)).toEqual(["run-new", "run-old"]);
    expect(detail.blockedByCards.map((card) => card.id)).toEqual([]);
    expect(detail.blockedByTasks.map((task) => task.identifier)).toEqual([]);
    expect(detail.unresolvedBlockers).toEqual(["missing-ref"]);
    expect(detail.unblocks.map((card) => card.id)).toEqual(["dependent"]);
    expect(detail.proofExpectationCount).toBe(2);
    expect(detail.progressLedger.map((entry) => [entry.id, entry.state])).toEqual([
      ["completed_work", "active"],
      ["remaining_work", "blocked"],
      ["files_touched", "done"],
      ["verification", "done"],
      ["proof_collected", "done"],
      ["task_actions", "active"],
      ["blockers_questions", "blocked"],
      ["next_action", "blocked"],
    ]);
    expect(detail.progressLedger.find((entry) => entry.id === "files_touched")?.detail).toBe("src/App.tsx");
    expect(detail.progressLedger.find((entry) => entry.id === "next_action")?.detail).toContain("unresolved missing-ref");
  });

  it("does not treat satisfied dependency refs as active execution blockers", () => {
    const foundation: ProjectBoardCard = {
      boardId: "board-1",
      id: "foundation",
      title: "Foundation",
      description: "Done prerequisite.",
      status: "done",
      candidateStatus: "ready_to_create",
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Foundation exists."],
      testPlan: { unit: ["Checked."], integration: [], visual: [], manual: [] },
      sourceKind: "board_synthesis",
      sourceId: "synthesis:foundation",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const validation: ProjectBoardCard = {
      ...foundation,
      id: "validation",
      title: "Validate complete game",
      status: "ready",
      blockedBy: ["synthesis:foundation"],
      sourceId: "synthesis:validation",
      orchestrationTaskId: "task-validation",
    };
    const task: OrchestrationTask = {
      id: "task-validation",
      identifier: "LOCAL-7",
      title: "Validate complete game",
      state: "ready",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const detail = projectBoardActiveCardDetail(validation, [foundation, validation], [task], []);
    const execution = projectBoardExecutionControlModel(validation, { events: [] }, detail);

    expect(detail.blockedByCards).toEqual([]);
    expect(execution).toMatchObject({
      state: "ready",
      blockerLabel: "No blockers",
      headline: "Ready Local Task needs a run",
    });
  });

  it("groups active card inspector state into decision, execution, proof, dependency, source, feedback, and history sections", () => {
    const card: ProjectBoardCard = {
      boardId: "board-1",
      id: "ticketized-card",
      title: "Build hello animation",
      description: "Create a tiny animated hello world page.",
      status: "ready",
      candidateStatus: "ready_to_create",
      labels: ["ui"],
      blockedBy: [],
      acceptanceCriteria: ["The greeting animates."],
      testPlan: { unit: [], integration: ["Open the page"], visual: ["Capture desktop screenshot"], manual: [] },
      sourceKind: "planner_plan",
      sourceId: "source-plan",
      sourceRefs: ["source-plan"],
      orchestrationTaskId: "task-hello",
      clarificationDecisions: [
        {
          id: "decision-open",
          question: "Should the greeting pulse or slide?",
          canonicalKey: "animation-style",
          source: "card",
          state: "open",
          suggestedAnswer: "Use a subtle pulse.",
          safeToAccept: true,
        },
        {
          id: "decision-answered",
          question: "Should it support reduced motion?",
          canonicalKey: "reduced-motion",
          source: "card",
          state: "answered",
          answer: "Yes.",
          answeredAt: "2026-01-01T00:01:00.000Z",
        },
        {
          id: "decision-duplicate",
          question: "Should the text pulse?",
          canonicalKey: "animation-style-alt",
          source: "description",
          state: "duplicate",
          duplicateOf: "decision-open",
        },
      ],
      pendingPiUpdate: {
        sourceId: "decision-refresh",
        createdAt: "2026-01-01T00:01:00.000Z",
        changedFields: ["description", "testPlan"],
        description: "Create a tiny animated hello world page with a pulse.",
        testPlan: { unit: [], integration: ["Open the page"], visual: ["Capture desktop and mobile screenshots"], manual: [] },
      },
      runFeedback: [
        {
          id: "feedback-1",
          feedback: "Use a reduced-motion-safe pulse.",
          source: "decision_impact",
          createdAt: "2026-01-01T00:02:00.000Z",
        },
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const board = {
      id: "board-1",
      projectPath: "/workspace/app",
      status: "active" as const,
      title: "Hello board",
      summary: "Tiny project",
      cards: [card],
      sources: [
        {
          id: "source-plan",
          boardId: "board-1",
          kind: "plan_artifact" as const,
          title: "Hello Durable Plan",
          summary: "Plan for a tiny hello world page.",
          path: ".ambient/board/plans/hello.html",
          relevance: 1,
          authorityRole: "primary" as const,
          includeInSynthesis: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      questions: [],
      proposals: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const task = {
      id: "task-hello",
      identifier: "LOCAL-HELLO",
      title: "Build hello animation",
      state: "ready",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const detail = projectBoardActiveCardDetail(card, [card], [task], []);
    const execution = projectBoardExecutionControlModel(card, {}, detail);
    const overview = projectBoardActiveCardOverviewModel(card, board, detail, execution);

    expect(overview.sections.map((section) => section.id)).toEqual([
      "decision",
      "pi_update",
      "execution",
      "proof",
      "dependencies",
      "source",
      "feedback",
      "history",
    ]);
    expect(overview.decisionAudit).toEqual({ open: 1, answered: 1, duplicate: 1, dismissed: 0 });
    expect(overview.sections.find((section) => section.id === "decision")).toMatchObject({
      headline: "1 open decision",
      tone: "warning",
    });
    expect(overview.sections.find((section) => section.id === "pi_update")).toMatchObject({
      label: "Protected Pi proposal",
      headline: "2 proposed fields",
      tone: "warning",
    });
    expect(overview.sections.find((section) => section.id === "source")?.detail).toBe("Hello Durable Plan");
    expect(overview.sections.find((section) => section.id === "feedback")).toMatchObject({
      headline: "1 additive note",
      tone: "ready",
    });
    expect(overview.badges.map((badge) => badge.label)).toEqual(["Card", "Task", "Run", "Proof"]);
  });

  it("surfaces pulled execution artifacts as card run history and PM handoff context", () => {
    const card = {
      boardId: "board-1",
      id: "card-shell",
      title: "Create shell",
      description: "Card description.",
      status: "review" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Canvas mounts"],
      testPlan: { unit: [], integration: ["Run smoke"], visual: [], manual: [] },
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis:shell",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const artifact: ProjectBoardExecutionArtifact = {
      id: "run-shell-1",
      boardId: "board-1",
      cardId: "card-shell",
      status: "completed",
      source: "git",
      piSessionId: "sessions/card-shell.json",
      workspaceBranch: "board/card-shell",
      startedAt: "2026-01-01T00:01:00.000Z",
      updatedAt: "2026-01-01T00:02:00.000Z",
      completedAt: "2026-01-01T00:02:00.000Z",
      proof: {
        summary: "Created the shell.",
        commands: ["pnpm test"],
        changedFiles: ["src/App.tsx"],
        screenshots: ["test-results/shell.png"],
        browserTraces: [],
        visualChecks: [{ result: "pass" }],
        manualChecks: [],
        createdAt: "2026-01-01T00:02:00.000Z",
      },
      handoff: {
        summary: "Shell is ready for controls.",
        completed: ["Mounted one canvas."],
        remaining: ["Implement controls."],
        risks: [],
        followUps: [],
        createdAt: "2026-01-01T00:02:00.000Z",
      },
      createdAt: "2026-01-01T00:02:00.000Z",
    };

    const detail = projectBoardActiveCardDetail(card, [card], [], [], [artifact]);

    expect(detail.latestExecutionArtifact?.id).toBe("run-shell-1");
    expect(detail.latestRun).toMatchObject({
      id: "run-shell-1",
      status: "completed",
      workspacePath: "Git board artifact: board/card-shell",
      proofOfWork: {
        kind: "git-board-run-artifact",
        lastAssistantText: "Shell is ready for controls.",
        changedFiles: ["src/App.tsx"],
      },
    });
    expect(detail.progressLedger.find((entry) => entry.id === "completed_work")).toMatchObject({
      state: "done",
      detail: "Shell is ready for controls.",
    });
    expect(projectBoardProofEvidenceModel(detail.latestRun!, card)).toMatchObject({
      hasProof: true,
      summary: expect.stringContaining("1 meaningful changed file"),
    });
  });

  it("treats needs_review task blockers as dependency-satisfied in the card ledger", () => {
    const card = {
      boardId: "board-1",
      id: "active",
      title: "Dependent card",
      description: "",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: ["LOCAL-1"],
      acceptanceCriteria: ["Ship the dependent work."],
      testPlan: { unit: ["Run unit"], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-dependent",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const tasks = [
      {
        id: "task-blocker",
        identifier: "LOCAL-1",
        title: "Prerequisite task",
        state: "needs_review",
        labels: [],
        blockedBy: [],
        sourceKind: "local",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:01:00.000Z",
      },
    ];

    const detail = projectBoardActiveCardDetail(card, [card], tasks, []);

    expect(detail.blockedByTasks.map((task) => task.identifier)).toEqual([]);
    expect(detail.progressLedger.find((entry) => entry.id === "blockers_questions")).toMatchObject({
      state: "done",
      detail: "No blockers or review questions are recorded.",
    });
  });

  it("explains PM proof decisions and exposes close controls", () => {
    const card = {
      id: "review-card",
      boardId: "board-1",
      title: "Review card",
      description: "Ready for PM proof close.",
      status: "review" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Proof is sufficient."],
      testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-review",
      orchestrationTaskId: "task-review",
      proofReview: {
        status: "ready_for_review" as const,
        summary: "All proof expectations have been satisfied.",
        satisfied: ["Unit proof passed."],
        missing: [],
        followUpCardIds: [],
        runId: "run-review",
        reviewedAt: "2026-01-01T00:05:00.000Z",
        recommendedAction: "close" as const,
        evidenceQuality: "strong" as const,
        confidence: 0.88,
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const board = {
      charter: {
        budgetPolicy: {
          maxPassesPerCard: 5,
          pauseOnTerminalBlocker: true,
          smallestSufficientProof: true,
        },
      },
    };
    const task = {
      id: "task-review",
      identifier: "LOCAL-10",
      title: "Review card",
      state: "needs_review",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };

    const decision = projectBoardProofDecisionModel(card, board, task);
    const detail = projectBoardActiveCardDetail(card, [card], [task], []);
    const controls = projectBoardExecutionControlModel(card, board, detail);

    expect(decision.statusLabel).toBe("Ready for review");
    expect(decision.recommendationLabel).toBe("Recommended: close");
    expect(decision.policySummary).toContain("Focus passes: 5");
    expect(decision.nextAction).toContain("Accept as done");
    expect(decision.readyForDecision).toBe(true);
    expect(decision.readinessLabel).toBe("Ready for decision");
    expect(decision.actions.find((action) => action.action === "retry")?.label).toBe("Send back for revision");
    expect(decision.actions.find((action) => action.action === "retry")?.title).toContain("include the reviewer note in the next run prompt");
    expect(decision.actions.map((action) => [action.action, action.disabled])).toEqual([
      ["accept_done", false],
      ["retry", false],
      ["mark_blocked", false],
    ]);
    expect(controls.state).toBe("review");
    expect(controls.headline).toContain("Review proof");
    expect(controls.actions.map((action) => [action.action, action.disabled])).toEqual([
      ["accept_done", false],
      ["retry_card", false],
      ["mark_blocked", false],
    ]);
    expect(controls.policySummary).toContain("pause on terminal blockers");

    const doneDecision = projectBoardProofDecisionModel({ ...card, status: "done" as const }, board, { ...task, state: "done" });
    expect(doneDecision.nextAction).toContain("no proof close decision is needed");
    expect(doneDecision.actions).toEqual([]);

    const runningRun: OrchestrationRun = {
      id: "run-review-active",
      taskId: task.id,
      attemptNumber: 1,
      status: "running",
      workspacePath: "/workspace/app/.ambient-codex/orchestration/workspaces/LOCAL-10-active",
      startedAt: "2026-01-01T00:06:00.000Z",
      proofOfWork: { kind: "agent-run", lastAssistantText: "Still gathering proof." },
    };
    const runningDecision = projectBoardProofDecisionModel(
      { ...card, status: "in_progress" as const, proofReview: undefined },
      board,
      { ...task, state: "in_progress" },
      runningRun,
    );
    expect(runningDecision).toMatchObject({
      statusLabel: "Proof not ready",
      readyForDecision: false,
      readinessLabel: "Proof not ready",
      awaitingRun: true,
    });
    expect(runningDecision.readinessReason).toContain("Wait for the current run to finish");
    expect(runningDecision.actions.map((action) => [action.action, action.disabled])).toEqual([
      ["accept_done", true],
      ["retry", true],
      ["mark_blocked", true],
    ]);
  });

  it("summarizes runtime-budget split follow-up children on the parent card", () => {
    const parent = {
      id: "parent-card",
      boardId: "board-1",
      title: "Large card",
      description: "Timed out after useful progress.",
      status: "blocked" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Create shell.", "Wire controls."],
      testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-parent",
      orchestrationTaskId: "task-parent",
      proofReview: {
        status: "needs_follow_up" as const,
        summary: "Partial progress needs split follow-up.",
        satisfied: ["Create shell."],
        missing: ["Wire controls."],
        followUpCardIds: ["child-card"],
        runId: "run-parent",
        reviewedAt: "2026-01-01T00:05:00.000Z",
        recommendedAction: "follow_up" as const,
      },
      splitOutcome: {
        status: "proposed" as const,
        source: "runtime_budget" as const,
        sourceRunId: "run-parent",
        reason: "Runtime budget exceeded after 90s.",
        partialProofSummary: "The shell was created before timeout.",
        completedCriteria: ["Create shell."],
        remainingCriteria: ["Wire controls."],
        childCardIds: ["child-card", "missing-child"],
        maxRuntimeMs: 90_000,
        elapsedMs: 95_000,
        createdAt: "2026-01-01T00:05:00.000Z",
        updatedAt: "2026-01-01T00:05:00.000Z",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const child = {
      id: "child-card",
      boardId: "board-1",
      title: "Continue large card",
      description: "Finish remaining work.",
      status: "draft" as const,
      candidateStatus: "needs_clarification" as const,
      labels: ["runtime-split-follow-up"],
      blockedBy: [],
      acceptanceCriteria: ["Wire controls."],
      testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
      sourceKind: "run_follow_up" as const,
      sourceId: "run-parent#runtime-split",
      createdAt: "2026-01-01T00:05:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };

    const detail = projectBoardActiveCardDetail(parent, [parent, child], [], []);

    expect(detail.splitOutcome).toMatchObject({
      statusLabel: "Proposed",
      sourceLabel: "Runtime budget",
      reason: "Runtime budget exceeded after 90s.",
      completedCriteria: ["Create shell."],
      remainingCriteria: ["Wire controls."],
      unresolvedChildIds: ["missing-child"],
    });
    expect(detail.splitOutcome?.children).toEqual([
      {
        card: child,
        statusLabel: "Needs clarification",
        blockedByParent: false,
      },
    ]);

    const task = {
      id: "task-parent",
      identifier: "LOCAL-20",
      title: "Large card",
      state: "needs_info",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const terminalParent = {
      ...parent,
      splitOutcome: { ...parent.splitOutcome, childCardIds: ["child-card"], status: "approved" as const },
    };
    const terminalChild = { ...child, candidateStatus: "evidence" as const };
    const terminalDetail = projectBoardActiveCardDetail(terminalParent, [terminalParent, terminalChild], [task], []);

    expect(terminalDetail.splitOutcome?.canCloseViaSplit).toBe(true);
    expect(terminalDetail.splitOutcome?.actions.map((action) => [action.action, action.disabled])).toEqual([
      ["approve_split", true],
      ["retry_original", false],
      ["merge_followups", false],
      ["mark_replaced", false],
      ["accept_done_via_split", false],
      ["reject_split", false],
    ]);
  });

  it("previews proof follow-up cards without model calls or parent rewrites", () => {
    const parent: ProjectBoardCard = {
      id: "parent-card",
      boardId: "board-1",
      title: "Responsive layout task",
      description: "Needs visual proof before close.",
      status: "blocked",
      candidateStatus: "ready_to_create",
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Layout adapts below 400px."],
      testPlan: { unit: [], integration: [], visual: ["Capture desktop and mobile screenshots."], manual: [] },
      sourceKind: "planner_plan",
      sourceId: "artifact-parent",
      orchestrationTaskId: "task-parent",
      proofReview: {
        status: "needs_follow_up",
        summary: "Implementation changed files, but visual proof is missing.",
        satisfied: ["Implementation files changed."],
        missing: ["Visual proof missing for mobile viewport."],
        followUpCardIds: ["follow-up-card", "missing-card"],
        runId: "run-parent",
        reviewedAt: "2026-01-01T00:05:00.000Z",
        recommendedAction: "follow_up",
        evidenceQuality: "mixed",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const followUp: ProjectBoardCard = {
      id: "follow-up-card",
      boardId: "board-1",
      title: "Collect responsive layout visual proof",
      description: "Capture the missing mobile proof and close the parent if it passes.",
      status: "draft",
      candidateStatus: "needs_clarification",
      labels: ["proof-follow-up"],
      blockedBy: ["parent-card"],
      acceptanceCriteria: ["Attach a 375px screenshot.", "Confirm layout does not crop controls."],
      testPlan: { unit: [], integration: [], visual: ["Capture 375px and 1280px screenshots."], manual: ["Inspect screenshot evidence."] },
      sourceKind: "run_follow_up",
      sourceId: "run-parent#proof-follow-up",
      createdAt: "2026-01-01T00:05:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };

    const impact = projectBoardProofFollowUpImpactModel(parent, [parent, followUp]);

    expect(impact).toMatchObject({
      visible: true,
      headline: "1 proof follow-up card proposed",
      followUpCardCount: 1,
      missingProofCount: 1,
      modelCallRequired: false,
      existingCardsRewritten: false,
      unresolvedFollowUpCardIds: ["missing-card"],
    });
    expect(impact.parentOutcome).toContain("not rewritten");
    expect(impact.metrics.map((metric) => [metric.label, metric.value])).toEqual([
      ["Follow-ups", "1"],
      ["Missing proof", "1"],
      ["Model calls", "0"],
      ["Rewritten fields", "0"],
    ]);
    expect(impact.cards).toEqual([
      expect.objectContaining({
        cardId: "follow-up-card",
        sourceLabel: "Proof follow-up draft",
        statusLabel: "Needs clarification",
        blockerLabel: "Blocked by parent: Responsive layout task",
        blockedByParent: true,
        proofExpectationCount: 2,
        proofExpectations: ["Visual: Capture 375px and 1280px screenshots.", "Manual: Inspect screenshot evidence."],
      }),
    ]);
  });

  it("flags proof follow-up recommendations that have not materialized a draft card", () => {
    const parent: ProjectBoardCard = {
      id: "parent-card",
      boardId: "board-1",
      title: "Animation polish task",
      description: "Needs another proof pass.",
      status: "review",
      candidateStatus: "ready_to_create",
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Animation does not stutter."],
      testPlan: { unit: [], integration: [], visual: ["Record animation proof."], manual: [] },
      sourceKind: "planner_plan",
      sourceId: "artifact-parent",
      proofReview: {
        status: "needs_follow_up",
        summary: "Follow-up proof is required.",
        satisfied: [],
        missing: ["Animation proof missing."],
        followUpCardIds: [],
        runId: "run-parent",
        reviewedAt: "2026-01-01T00:05:00.000Z",
        recommendedAction: "follow_up",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };

    const impact = projectBoardProofFollowUpImpactModel(parent, [parent]);

    expect(impact.visible).toBe(true);
    expect(impact.headline).toBe("Proof follow-up recommended");
    expect(impact.followUpCardCount).toBe(0);
    expect(impact.detail).toContain("no draft follow-up card is linked yet");
    expect(impact.parentOutcome).toContain("materialized");
  });

  it("puts failed execution retry and disabled close policy in one PM control model", () => {
    const card = {
      id: "failed-card",
      boardId: "board-1",
      title: "Failed card",
      description: "Needs another worker pass.",
      status: "in_progress" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Proof is sufficient."],
      testPlan: { unit: ["Run unit proof."], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-failed",
      orchestrationTaskId: "task-failed",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const task = {
      id: "task-failed",
      identifier: "LOCAL-11",
      title: "Failed card",
      state: "needs_info",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const run = {
      id: "run-failed",
      taskId: "task-failed",
      attemptNumber: 1,
      status: "failed",
      workspacePath: "/tmp/failed-card",
      threadId: "thread-failed",
      startedAt: "2026-01-01T00:03:00.000Z",
      error: "Missing API token.",
      proofOfWork: {
        kind: "agent-run",
        lastAssistantStatus: "error",
      },
    };

    const detail = projectBoardActiveCardDetail(card, [card], [task], [run]);
    const controls = projectBoardExecutionControlModel(card, {}, detail);

    expect(controls.state).toBe("blocked");
    expect(controls.headline).toContain("retry");
    expect(controls.detail).toContain("missing information");
    expect(controls.actions.find((action) => action.action === "start_run")).toMatchObject({
      label: "Retry run",
      disabled: false,
      runId: "run-failed",
    });
    expect(controls.actions.find((action) => action.action === "accept_done")).toMatchObject({
      disabled: true,
      title: "Wait for the PM proof review before applying a close decision.",
    });
    expect(controls.actions.find((action) => action.action === "open_run_chat")).toMatchObject({
      threadId: "thread-failed",
    });
  });

  it("allows manual PM close decisions for stopped runs with reviewable evidence", () => {
    const card = {
      id: "failed-proof-card",
      boardId: "board-1",
      title: "Failed card with proof",
      description: "The worker changed files before the provider failed.",
      status: "blocked" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Proof is sufficient."],
      testPlan: { unit: ["Run unit proof."], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-failed-proof",
      orchestrationTaskId: "task-failed-proof",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const task = {
      id: "task-failed-proof",
      identifier: "LOCAL-12",
      title: "Failed card with proof",
      state: "budget_exhausted",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const run = {
      id: "run-failed-proof",
      taskId: "task-failed-proof",
      attemptNumber: 1,
      status: "failed",
      workspacePath: "/tmp/failed-card-proof",
      threadId: "thread-failed-proof",
      startedAt: "2026-01-01T00:03:00.000Z",
      finishedAt: "2026-01-01T00:04:00.000Z",
      error: "429 Rate limit exceeded.",
      proofOfWork: {
        kind: "agent-run",
        changedFiles: ["src/output.ts"],
        testOutput: "node test.mjs -> 20 passed, 0 failed",
      },
    };

    const detail = projectBoardActiveCardDetail(card, [card], [task], [run]);
    const controls = projectBoardExecutionControlModel(card, {}, detail);

    expect(controls.state).toBe("blocked");
    expect(controls.detail).toContain("accept manually");
    expect(controls.actions.find((action) => action.action === "start_run")).toMatchObject({
      label: "Retry run",
      disabled: false,
      runId: "run-failed-proof",
    });
    expect(controls.actions.find((action) => action.action === "accept_done")).toMatchObject({
      disabled: false,
      title: expect.stringContaining("manual inspection"),
    });
    expect(controls.actions.find((action) => action.action === "retry_card")).toMatchObject({
      disabled: false,
      title: expect.stringContaining("reviewer feedback"),
    });
    expect(controls.actions.find((action) => action.action === "mark_blocked")).toMatchObject({
      disabled: false,
      title: expect.stringContaining("terminal error"),
    });
  });

  it("projects accepted stopped-run cards as clean done state across board controls", () => {
    const card: ProjectBoardCard = {
      id: "accepted-stopped-card",
      boardId: "board-1",
      title: "Accepted stopped card",
      description: "The worker changed files before a provider failure, and PM accepted the proof.",
      status: "done",
      candidateStatus: "ready_to_create",
      labels: [],
      blockedBy: ["old-blocker"],
      acceptanceCriteria: ["Proof is sufficient."],
      testPlan: { unit: ["Run unit proof."], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan",
      sourceId: "artifact-accepted",
      orchestrationTaskId: "task-accepted",
      proofReview: {
        status: "done",
        summary: "Accepted as done by user PM decision. Reason: changed files and unit proof were sufficient.",
        satisfied: ["Unit proof passed.", "Accepted by user PM decision."],
        missing: [],
        followUpCardIds: [],
        runId: "run-stopped",
        reviewedAt: "2026-01-01T00:07:00.000Z",
        recommendedAction: "close",
        evidenceQuality: "strong",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:07:00.000Z",
    };
    const blocker: ProjectBoardCard = {
      ...card,
      id: "old-blocker",
      title: "Historical blocker",
      blockedBy: [],
      orchestrationTaskId: "task-blocker",
      proofReview: undefined,
    };
    const task = {
      id: "task-accepted",
      identifier: "LOCAL-7",
      title: "Accepted stopped card",
      state: "done",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:07:00.000Z",
    };
    const run = {
      id: "run-stopped",
      taskId: "task-accepted",
      attemptNumber: 1,
      status: "failed",
      workspacePath: "/tmp/accepted-stopped-card",
      threadId: "thread-stopped",
      startedAt: "2026-01-01T00:03:00.000Z",
      finishedAt: "2026-01-01T00:06:00.000Z",
      error: "Provider failed after proof was recorded.",
      proofOfWork: {
        kind: "agent-run",
        changedFiles: ["src/output.ts"],
        testOutput: "node test.mjs -> passed",
      },
    };

    const projection = projectBoardCanonicalCardProjection(card, { task, latestRun: run });
    const detail = projectBoardActiveCardDetail(card, [card, blocker], [task], [run]);
    const controls = projectBoardExecutionControlModel(card, {}, detail);
    const overview = projectBoardActiveCardOverviewModel(card, { sources: [] }, detail, controls);

    expect(projection).toMatchObject({
      kind: "done_after_stopped_run",
      visualStatus: "done",
      statusLabel: "Done: accepted with evidence",
      runLabel: "Historical stopped run accepted",
      blockerLabel: "No active blockers",
      suppressRetryActions: true,
      suppressStaleRunState: true,
      suppressBlockers: true,
      terminalDone: true,
    });
    expect(projectBoardColumns([card]).find((column) => column.id === "done")?.cards.map((item) => item.id)).toEqual(["accepted-stopped-card"]);
    expect(projectBoardCardVisualTone(card)).toBe("done");
    expect(detail.progressLedger.find((entry) => entry.id === "blockers_questions")).toMatchObject({
      state: "done",
      detail: "No active blockers remain after the PM done decision.",
    });
    expect(detail.progressLedger.find((entry) => entry.id === "next_action")).toMatchObject({
      state: "done",
      detail: "No next action is required; historical run issues are audit-only.",
    });
    expect(controls).toMatchObject({
      state: "done",
      headline: "Done: accepted with evidence",
      runLabel: "Historical stopped run accepted",
      proofLabel: "Accepted with evidence",
      blockerLabel: "No active blockers",
    });
    expect(controls.actions.map((action) => action.action)).not.toContain("start_run");
    expect(controls.actions.map((action) => action.action)).not.toContain("accept_done");
    expect(controls.actions.map((action) => action.action)).not.toContain("mark_blocked");
    expect(controls.actions.map((action) => action.action)).not.toContain("retry_card");
    expect(overview.badges.map((badge) => [badge.label, badge.value, badge.tone])).toEqual(
      expect.arrayContaining([
        ["Card", "Done: accepted with evidence", "done"],
        ["Run", "Historical stopped run accepted", "done"],
        ["Proof", "Accepted with evidence", "done"],
      ]),
    );
    expect(overview.sections.find((section) => section.id === "history")).toMatchObject({
      tone: "done",
      detail: "Historical stopped run accepted; retained for audit.",
    });

    const readyTaskWithoutRun = {
      ...task,
      state: "ready",
      updatedAt: "2026-01-01T00:08:00.000Z",
    };
    const readyDetail = projectBoardActiveCardDetail(card, [card], [readyTaskWithoutRun], []);
    const readyControls = projectBoardExecutionControlModel(
      card,
      {
        workflowReadiness: {
          status: "missing",
          path: "/tmp/workflow/WORKFLOW.md",
          checkedAt: "2026-01-01T00:08:00.000Z",
          warnings: [],
          message: "No workflow file is present.",
        },
      },
      readyDetail,
    );
    expect(readyControls).toMatchObject({
      state: "done",
      blockerLabel: "No active blockers",
    });
    expect(readyControls.actions.map((action) => action.action)).not.toContain("prepare_run");
  });

  it("uses retry attempt order when accepted proof runs share timestamps", () => {
    const card: ProjectBoardCard = {
      id: "accepted-retry-card",
      boardId: "board-1",
      title: "Accepted retry card",
      description: "The worker failed once, retried immediately, and PM accepted the passing proof.",
      status: "done",
      candidateStatus: "ready_to_create",
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Retry proof is sufficient."],
      testPlan: { unit: ["Run unit proof."], integration: [], visual: [], manual: [] },
      sourceKind: "manual",
      sourceId: "retry-fixture",
      orchestrationTaskId: "task-retry",
      proofReview: {
        status: "done",
        summary: "Accepted as done by user PM decision. Reason: retry proof passed.",
        satisfied: ["Retry proof passed.", "Accepted by user PM decision."],
        missing: [],
        followUpCardIds: [],
        runId: "run-retry-completed",
        reviewedAt: "2026-01-01T00:05:00.000Z",
        recommendedAction: "close",
        evidenceQuality: "strong",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const task = {
      id: "task-retry",
      identifier: "LOCAL-8",
      title: card.title,
      state: "done",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const sharedTime = "2026-01-01T00:04:00.000Z";
    const failedRun = {
      id: "run-retry-failed",
      taskId: task.id,
      attemptNumber: 0,
      status: "failed",
      workspacePath: "/tmp/retry-card",
      threadId: "thread-failed",
      startedAt: sharedTime,
      finishedAt: sharedTime,
      lastEventAt: sharedTime,
      error: "Initial proof failed.",
      proofOfWork: {
        commands: [{ command: "pnpm test", exitCode: 1 }],
      },
    };
    const completedRun = {
      id: "run-retry-completed",
      taskId: task.id,
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/tmp/retry-card",
      threadId: "thread-completed",
      startedAt: sharedTime,
      finishedAt: sharedTime,
      lastEventAt: sharedTime,
      proofOfWork: {
        changedFiles: ["src/retry.ts"],
        commands: [{ command: "pnpm test", exitCode: 0 }],
      },
    };

    const detail = projectBoardActiveCardDetail(card, [card], [task], [failedRun, completedRun]);
    const projection = projectBoardCanonicalCardProjection(card, { task, latestRun: detail.latestRun });
    const controls = projectBoardExecutionControlModel(card, {}, detail);

    expect(detail.latestRun?.id).toBe("run-retry-completed");
    expect(projection).toMatchObject({
      kind: "done_with_manual_evidence",
      statusLabel: "Done with evidence",
      runLabel: "Historical run accepted",
      suppressRetryActions: true,
      suppressStaleRunState: true,
      suppressBlockers: true,
    });
    expect(controls).toMatchObject({
      state: "done",
      headline: "Done with evidence",
      runLabel: "Historical run accepted",
      blockerLabel: "No active blockers",
    });
  });

  it("allows manual PM close decisions for completed runs when the task still needs review", () => {
    const card = {
      id: "completed-budget-card",
      boardId: "board-1",
      title: "Completed card with proof",
      description: "The worker completed the run but did not emit a terminal task action.",
      status: "blocked" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Proof is sufficient."],
      testPlan: { unit: ["Run unit proof."], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-completed-proof",
      orchestrationTaskId: "task-completed-proof",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const task = {
      id: "task-completed-proof",
      identifier: "LOCAL-13",
      title: "Completed card with proof",
      state: "budget_exhausted",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const run = {
      id: "run-completed-proof",
      taskId: "task-completed-proof",
      attemptNumber: 1,
      status: "completed" as const,
      workspacePath: "/tmp/completed-card-proof",
      threadId: "thread-completed-proof",
      startedAt: "2026-01-01T00:03:00.000Z",
      finishedAt: "2026-01-01T00:04:00.000Z",
      proofOfWork: {
        kind: "agent-run",
        lastAssistantText: "The fixture is valid and all required scenarios are present.",
        commands: ["node -e \"JSON.parse(fs.readFileSync('tokens.json'))\""],
      },
    };

    const detail = projectBoardActiveCardDetail(card, [card], [task], [run]);
    const projection = projectBoardCanonicalCardProjection(card, { task, latestRun: detail.latestRun });
    const controls = projectBoardExecutionControlModel(card, {}, detail);

    expect(projection).toMatchObject({
      kind: "review",
      visualStatus: "review",
      statusLabel: "Review",
      proofLabel: "Needs PM review",
      suppressStaleRunState: true,
    });
    expect(projectBoardColumns([card], { tasks: [task], runs: [run] }).find((column) => column.id === "review")?.cards.map((item) => item.id)).toEqual(["completed-budget-card"]);
    expect(projectBoardExecutionOverview(boardSummary({ cards: [card] }), [task], [run])).toMatchObject({
      state: "review",
      headline: "Proof is waiting for review",
      metrics: expect.arrayContaining([
        { label: "Review", value: 1 },
        { label: "Blocked", value: 0 },
      ]),
      action: { action: "inspect_card", label: "Review Proof", cardId: "completed-budget-card" },
    });
    expect(controls).toMatchObject({
      state: "review",
      statusLabel: "PM decision",
      headline: "Review proof and choose a PM close action",
      taskLabel: "LOCAL-13 · Needs Review",
      blockerLabel: "No blockers",
    });
    expect(controls.actions.find((action) => action.action === "accept_done")).toMatchObject({
      disabled: false,
      title: expect.stringContaining("manual inspection"),
    });
    expect(controls.actions.find((action) => action.action === "retry_card")).toMatchObject({
      disabled: false,
    });
  });

  it("surfaces durable execution blockers in ready-card controls", () => {
    const card = {
      id: "ready-card",
      boardId: "board-1",
      title: "Ready card",
      description: "Needs an execution contract before dispatch.",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Run the work."],
      testPlan: { unit: ["Run unit proof."], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-ready",
      orchestrationTaskId: "task-ready",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const task = {
      id: "task-ready",
      identifier: "LOCAL-12",
      title: "Ready card",
      state: "ready",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const event: ProjectBoardEvent = {
      id: "event-workflow",
      boardId: "board-1",
      kind: "execution_readiness_blocked",
      title: "Execution blocked: missing WORKFLOW.md",
      summary: "Ready Local Tasks could not be prepared because /workspace/app/WORKFLOW.md is missing.",
      entityKind: "project_board",
      entityId: "board-1",
      metadata: { blocker: "missing_workflow" },
      createdAt: "2026-01-01T00:06:00.000Z",
    };

    const detail = projectBoardActiveCardDetail(card, [card], [task], []);
    const controls = projectBoardExecutionControlModel(
      card,
      {
        events: [event],
        workflowReadiness: {
          status: "missing",
          path: "/workspace/app/WORKFLOW.md",
          checkedAt: "2026-01-01T00:06:00.000Z",
          warnings: [],
        },
      },
      detail,
    );

    expect(controls.state).toBe("blocked");
    expect(controls.detail).toContain("/workspace/app/WORKFLOW.md is missing");
    expect(controls.blockerLabel).toBe("Missing Workflow");
    expect(controls.actions.find((action) => action.action === "prepare_run")).toMatchObject({
      disabled: true,
      title: "Workflow file not found: /workspace/app/WORKFLOW.md",
    });

    const autoDispatchOffControls = projectBoardExecutionControlModel(
      card,
      {
        events: [],
        workflowReadiness: {
          status: "ready",
          path: "/workspace/app/WORKFLOW.md",
          checkedAt: "2026-01-01T00:06:00.000Z",
          warnings: [],
          autoDispatch: false,
        },
      },
      detail,
    );
    expect(autoDispatchOffControls.state).toBe("ready");
    expect(autoDispatchOffControls.actions.find((action) => action.action === "prepare_run")).toMatchObject({
      disabled: false,
      title: "Prepare the next eligible ready Local Task run so it can be started from this board.",
    });
  });

  it("classifies proof artifacts for PM evidence inspection", () => {
    const card = {
      id: "evidence-card",
      boardId: "board-1",
      title: "Evidence card",
      description: "Needs inspectable evidence.",
      status: "review" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Render the game shell."],
      testPlan: { unit: ["Run state tests."], integration: ["Run smoke build."], visual: ["Capture a screenshot."], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-evidence",
      proofReview: {
        status: "ready_for_review" as const,
        summary: "Proof is strong enough to close.",
        satisfied: ["Unit proof recorded.", "Visual/browser proof recorded."],
        missing: [],
        followUpCardIds: [],
        runId: "run-evidence",
        reviewedAt: "2026-01-01T00:07:00.000Z",
        reviewer: "ambient_pi" as const,
        model: "ambient-pi",
        confidence: 0.88,
        evidenceQuality: "strong" as const,
        recommendedAction: "close" as const,
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:07:00.000Z",
    };
    const run = {
      id: "run-evidence",
      taskId: "task-evidence",
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1",
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        kind: "agent-run",
        messageCount: 8,
        lastAssistantStatus: "done",
        changedFiles: [
          { path: "src/App.tsx", status: " M", category: "modified" },
          { path: "src/game/state.test.ts", status: "A ", category: "added" },
          { path: "test-results/spaceship-shell.png", status: "??", category: "untracked" },
          { path: "node_modules/.vite/vitest/results.json", status: " M", category: "modified" },
        ],
        gitStatus: [" M src/App.tsx", "A  src/game/state.test.ts"],
        screenshots: [{ path: "/tmp/project/test-results/spaceship-shell.png", width: 1280, height: 720 }],
        visualChecks: [{ path: "test-results/spaceship-shell.png", result: "nonblank_image_detected", width: 1280, height: 720, nonBlackPixels: 1234 }],
        browserTraces: ["test-results/trace.zip"],
        testOutput: "pnpm test passed",
        afterRunHook: { ok: true, command: "pnpm test", output: "tests passed", durationMs: 420 },
        focusLoop: { action: "finish", reason: "proof_satisfied", passNumber: 2 },
        lastAssistantText: "Implemented the shell and captured a nonblank screenshot.",
        diff: "diff --git a/src/App.tsx b/src/App.tsx\n+render shell",
        diffTruncated: true,
      },
    };

    const evidence = projectBoardProofEvidenceModel(run, card);

    expect(evidence.summary).toContain("3 meaningful changed files");
    expect(evidence.metrics.map((metric) => metric.label)).toEqual(
      expect.arrayContaining(["Messages", "Assistant", "Files", "Visual", "Checks", "Trace", "Focus", "Diff"]),
    );
    expect(evidence.fileGroups.map((group) => [group.label, group.files.map((file) => file.path)])).toEqual([
      ["Implementation", ["src/App.tsx"]],
      ["Tests", ["src/game/state.test.ts"]],
      ["Visual", ["test-results/spaceship-shell.png"]],
      ["Dependencies", ["node_modules/.vite/vitest/results.json"]],
    ]);
    expect(evidence.files.find((file) => file.path.includes("node_modules"))?.meaningful).toBe(false);
    expect(evidence.artifacts.map((artifact) => artifact.kind)).toEqual(["screenshot", "log", "browser_trace", "command"]);
    expect(evidence.artifacts[0]).toMatchObject({
      label: "Screenshot 1",
      dimensionsLabel: "1280x720",
      viewportLabel: "Desktop viewport 1280x720",
      visualRole: "desktop",
    });
    expect(evidence.artifacts[0]?.previewSrc).toBe("file:///tmp/project/test-results/spaceship-shell.png");
    expect(evidence.artifacts[1]).toMatchObject({ kind: "log", label: "Nonblank Image Detected", detail: expect.stringContaining("1234 nonblack pixels") });
    expect(evidence.hook).toMatchObject({ label: "afterRun passed", tone: "success" });
    expect(evidence.artifacts[3]).toMatchObject({ kind: "command", detail: "pnpm test passed" });
    expect(evidence.focus).toMatchObject({ label: "Focus loop Finish", detail: expect.stringContaining("proof_satisfied") });
    expect(evidence.review).toMatchObject({
      reviewer: "Ambient/Pi PM judge",
      confidence: "88%",
      evidenceQuality: "Strong",
      recommendedAction: "close",
    });
    expect(evidence.inspection).toMatchObject({
      headline: "Proof packet needs PM attention",
      qualityLabel: "Strong evidence · Needs review",
      qualityTone: "warning",
      issueCount: 0,
      issueTarget: "inspection-checklist",
      workspaceLabel: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1",
      diffLabel: "Diff attached, truncated",
      failedAssertions: [],
    });
    expect(evidence.inspection.checklist.map((item) => [item.label, item.tone])).toEqual(
      expect.arrayContaining([
        ["Implementation evidence", "success"],
        ["Command / test evidence", "success"],
        ["Visual evidence", "success"],
        ["PM judge", "success"],
      ]),
    );
    expect(evidence.inspection.checklist.map((item) => [item.label, item.target])).toEqual(
      expect.arrayContaining([
        ["Command / test evidence", "command-evidence"],
        ["Visual evidence", "visual-evidence"],
        ["PM judge", "pm-judge"],
      ]),
    );
    expect(evidence.inspection.visualEvidence.map((item) => [item.label, item.statusLabel, item.tone])).toEqual([
      ["Visual proof", "Screenshot attached", "success"],
      ["Desktop visual check", "Additional visual check", "success"],
      ["Browser trace", "Additional trace", "success"],
    ]);
    expect(evidence.inspection.visualEvidence[0]).toMatchObject({
      role: "desktop",
      viewportLabel: "Desktop viewport 1280x720",
      dimensionsLabel: "1280x720",
      comparisonLabel: "Desktop viewport screenshot is available for PM review.",
    });
  });

  it("classifies absolute files inside the run workspace by their relative source path", () => {
    const workspacePath = "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-absolute";
    const run = {
      id: "run-absolute-files",
      taskId: "task-absolute-files",
      attemptNumber: 1,
      status: "completed",
      workspacePath,
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        changedFiles: [
          `${workspacePath}/index.html`,
          `file://${workspacePath}/src/app.js`,
          `${workspacePath}/.ambient-codex/browser/screenshots/title.png`,
          `${workspacePath}/node_modules/cache/index.js`,
        ],
      },
    };

    const evidence = projectBoardProofEvidenceModel(run);

    expect(evidence.summary).toContain("2 meaningful changed files");
    expect(evidence.fileGroups.map((group) => [group.label, group.files.map((file) => file.path)])).toEqual([
      ["Implementation", [`${workspacePath}/index.html`, `file://${workspacePath}/src/app.js`]],
      ["Generated/cache", [`${workspacePath}/.ambient-codex/browser/screenshots/title.png`]],
      ["Dependencies", [`${workspacePath}/node_modules/cache/index.js`]],
    ]);
  });

  it("identifies missing visual proof and failed assertions in proof packet inspection", () => {
    const card = {
      id: "weak-visual-card",
      boardId: "board-1",
      title: "Weak visual card",
      description: "Needs mobile and desktop proof.",
      status: "blocked" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Responsive layout is visible."],
      testPlan: { unit: ["Run layout tests."], integration: [], visual: ["Capture mobile and desktop screenshots."], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-weak-visual",
      proofReview: {
        status: "needs_follow_up" as const,
        summary: "Desktop proof exists, but mobile proof and tests failed.",
        satisfied: ["Desktop screenshot recorded."],
        missing: ["Mobile screenshot proof missing.", "Command/test proof failed."],
        followUpCardIds: [],
        runId: "run-weak-visual",
        reviewedAt: "2026-01-01T00:07:00.000Z",
        evidenceQuality: "weak" as const,
        recommendedAction: "follow_up" as const,
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:07:00.000Z",
    };
    const run = {
      id: "run-weak-visual",
      taskId: "task-weak-visual",
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-2",
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        changedFiles: ["src/responsive.css"],
        screenshots: [{ path: "proof/desktop-layout.png", absolutePath: "data:image/png;base64,AAAA", width: 1280, height: 720 }],
        commands: [{ command: "pnpm test", result: "failed", output: "layout.spec.ts failed at mobile breakpoint" }],
        diff: "diff --git a/src/responsive.css b/src/responsive.css\n+@media (max-width: 400px){}",
        lastAssistantText: "Desktop screenshot captured. Mobile screenshot was not captured because the viewport setup failed.",
      },
    };

    const evidence = projectBoardProofEvidenceModel(run, card);

    expect(evidence.inspection.qualityLabel).toBe("Weak evidence · 4 review issues");
    expect(evidence.inspection.qualityTone).toBe("danger");
    expect(evidence.inspection.issueCount).toBe(4);
    expect(evidence.inspection.issueTarget).toBe("proof-issues");
    expect(evidence.inspection.headline).toContain("review issues");
    expect(evidence.inspection.visualEvidence.map((item) => [item.label, item.statusLabel, item.tone])).toEqual([
      ["Mobile screenshot", "Missing evidence", "danger"],
      ["Desktop screenshot", "Screenshot attached", "success"],
    ]);
    expect(evidence.inspection.visualEvidence[0]).toMatchObject({
      role: "mobile",
      viewportLabel: "Mobile viewport",
      comparisonLabel: "Expected evidence is missing",
    });
    expect(evidence.inspection.visualEvidence[1]).toMatchObject({
      role: "desktop",
      viewportLabel: "Desktop viewport 1280x720",
      dimensionsLabel: "1280x720",
      thumbnailSrc: "data:image/png;base64,AAAA",
    });
    expect(evidence.inspection.checklist.find((item) => item.label === "Visual evidence")?.target).toBe("visual-evidence");
    expect(evidence.inspection.checklist.find((item) => item.label === "Command / test evidence")?.target).toBe("command-evidence");
    expect(evidence.inspection.failedAssertions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Command 1"),
        "Mobile screenshot proof missing.",
        "Command/test proof failed.",
        expect.stringContaining("Mobile screenshot was not captured"),
      ]),
    );
    expect(evidence.inspection.transcriptExcerpt).toContain("Mobile screenshot was not captured");
  });

  it("keeps strong PM evidence distinct from review issues in proof packet inspection", () => {
    const card = {
      id: "strong-with-issues-card",
      boardId: "board-1",
      title: "Strong evidence with issues",
      description: "The judge thinks proof is strong, but deterministic review still found issues.",
      status: "review" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Tests are passing."],
      testPlan: { unit: ["Run tests."], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-strong-with-issues",
      proofReview: {
        status: "ready_for_review" as const,
        summary: "The implementation is likely complete.",
        satisfied: ["Core tests were reported."],
        missing: ["Command/test proof failed."],
        followUpCardIds: [],
        runId: "run-strong-with-issues",
        reviewedAt: "2026-01-01T00:07:00.000Z",
        evidenceQuality: "strong" as const,
        confidence: 0.97,
        recommendedAction: "close" as const,
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:07:00.000Z",
    };
    const run = {
      id: "run-strong-with-issues",
      taskId: "task-strong-with-issues",
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-3",
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        changedFiles: ["src/engine.ts"],
        commands: [{ command: "pnpm test", exitCode: 1, output: "engine.test.ts failed" }],
        lastAssistantText: "Tests reported one failure.",
      },
    };

    const evidence = projectBoardProofEvidenceModel(run, card);

    expect(evidence.inspection.qualityTone).toBe("danger");
    expect(evidence.inspection.qualityLabel).toBe("Strong evidence · 2 review issues");
    expect(evidence.review).toMatchObject({ evidenceQuality: "Strong", confidence: "97%" });
    expect(evidence.inspection.headline).toBe("2 review issues need attention");
    expect(evidence.inspection.checklist.find((item) => item.label === "Command / test evidence")?.target).toBe("command-evidence");
    expect(evidence.inspection.checklist.find((item) => item.label === "PM judge")?.target).toBe("pm-judge");
  });

  it("exposes accessible proof inspection jump targets for the renderer", () => {
    const inspection = {
      headline: "2 review issues need attention",
      detail: "1 meaningful file · strong evidence · 2 review issues",
      qualityLabel: "Strong evidence · 2 review issues",
      qualityTone: "danger" as const,
      issueCount: 2,
      issueTarget: "proof-issues" as const,
      workspaceLabel: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-3",
      diffLabel: "Diff attached",
      checklist: [
        { label: "Command / test evidence", detail: "1 command record attached.", tone: "danger" as const, target: "command-evidence" as const },
        { label: "Visual evidence", detail: "No visual proof expected for this card.", tone: "neutral" as const },
        { label: "PM judge", detail: "ready_for_review · close · Strong · 97%", tone: "success" as const, target: "pm-judge" as const },
      ],
      visualEvidence: [],
      failedAssertions: ["Command 1 failed.", "Command/test proof failed."],
    };

    const navigation = projectBoardProofInspectionNavigationModel(inspection, "run strong/issues", "card #1");

    expect(navigation).toMatchObject({
      anchorPrefix: "proof-card-1-run-strong-issues",
      inspectionId: "proof-card-1-run-strong-issues-inspection",
      issueTargetId: "proof-card-1-run-strong-issues-proof-issues",
      proofIssuesId: "proof-card-1-run-strong-issues-proof-issues",
      commandEvidenceId: "proof-card-1-run-strong-issues-command-evidence",
      pmJudgeId: "proof-card-1-run-strong-issues-pm-judge",
      issueJumpAriaLabel: "Jump to 2 review issues need attention.",
    });
    expect(navigation.checklist).toEqual([
      {
        label: "Command / test evidence",
        checkId: "proof-card-1-run-strong-issues-check-command-test-evidence",
        target: "command-evidence",
        targetId: "proof-card-1-run-strong-issues-command-evidence",
        ariaLabel: "Jump to supporting proof evidence for Command / test evidence.",
      },
      {
        label: "Visual evidence",
        checkId: "proof-card-1-run-strong-issues-check-visual-evidence",
        target: undefined,
        targetId: undefined,
        ariaLabel: undefined,
      },
      {
        label: "PM judge",
        checkId: "proof-card-1-run-strong-issues-check-pm-judge",
        target: "pm-judge",
        targetId: "proof-card-1-run-strong-issues-pm-judge",
        ariaLabel: "Jump to supporting proof evidence for PM judge.",
      },
    ]);
  });

  it("routes visual-only proof gaps to the visual evidence target", () => {
    const card = {
      id: "visual-gap-card",
      boardId: "board-1",
      title: "Visual gap card",
      description: "Needs mobile and desktop proof, but only desktop exists.",
      status: "review" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Responsive layout is visible."],
      testPlan: { unit: [], integration: [], visual: ["Capture mobile and desktop screenshots."], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-visual-gap",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:07:00.000Z",
    };
    const run = {
      id: "run-visual-gap",
      taskId: "task-visual-gap",
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-4",
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        changedFiles: ["src/responsive.css"],
        screenshots: [{ path: "proof/desktop-layout.png", absolutePath: "data:image/png;base64,AAAA", width: 1280, height: 720 }],
        diff: "diff --git a/src/responsive.css b/src/responsive.css\n+@media (max-width: 400px){}",
        lastAssistantText: "Desktop screenshot captured.",
      },
    };

    const evidence = projectBoardProofEvidenceModel(run, card);

    expect(evidence.inspection.issueCount).toBe(1);
    expect(evidence.inspection.issueTarget).toBe("visual-evidence");
    expect(evidence.inspection.headline).toBe("1 visual evidence gap");
    expect(evidence.inspection.failedAssertions).toEqual([]);
    expect(evidence.inspection.visualEvidence.map((item) => [item.label, item.statusLabel, item.tone])).toEqual([
      ["Mobile screenshot", "Missing evidence", "danger"],
      ["Desktop screenshot", "Screenshot attached", "success"],
    ]);
    expect(evidence.inspection.checklist.find((item) => item.label === "Visual evidence")?.target).toBe("visual-evidence");
  });

  it("resolves relative proof screenshot previews against the run workspace", () => {
    const run: OrchestrationRun = {
      id: "run-relative-proof",
      taskId: "task-relative-proof",
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1",
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        screenshots: [{ path: ".ambient-codex/browser/screenshots/browser-proof.png", width: 1440, height: 900 }],
      },
    };

    const evidence = projectBoardProofEvidenceModel(run);

    expect(evidence.artifacts[0]).toMatchObject({
      kind: "screenshot",
      path: ".ambient-codex/browser/screenshots/browser-proof.png",
      previewSrc: "file:///tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1/.ambient-codex/browser/screenshots/browser-proof.png",
    });
    expect(evidence.inspection.visualEvidence[0]?.thumbnailSrc).toBe(
      "file:///tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1/.ambient-codex/browser/screenshots/browser-proof.png",
    );
  });

  it("uses screenshot sequences for animation proof and previews visual check images", () => {
    const card = {
      id: "animated-proof-card",
      boardId: "board-1",
      title: "Animated proof card",
      description: "Needs motion proof.",
      status: "review" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Canvas transitions between visible states."],
      testPlan: { unit: [], integration: [], visual: ["Capture animation in browser showing title, paused, and gravity storm states."], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-animation",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:07:00.000Z",
    };
    const run: OrchestrationRun = {
      id: "run-animation-proof",
      taskId: "task-animation-proof",
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1",
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        screenshots: [
          { path: ".ambient-codex/browser/screenshots/title.png", width: 1280, height: 720, summary: "TITLE state" },
          { path: ".ambient-codex/browser/screenshots/paused.png", width: 1280, height: 720, summary: "PAUSED state" },
          { path: ".ambient-codex/browser/screenshots/gravity-storm.png", width: 1280, height: 720, summary: "GRAVITY STORM state" },
        ],
        visualChecks: [
          {
            path: ".ambient-codex/browser/screenshots/title.png",
            result: "nonblank_image_detected",
            width: 1280,
            height: 720,
            summary: "Browser evidence title state.",
          },
        ],
      },
    };

    const evidence = projectBoardProofEvidenceModel(run, card);
    const [animationProof, browserProof] = evidence.inspection.visualEvidence;

    expect(animationProof).toMatchObject({
      label: "Animation visual proof",
      statusLabel: "3 motion frames attached",
      role: "animation",
      tone: "success",
      thumbnailSrc: "file:///tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1/.ambient-codex/browser/screenshots/title.png",
      comparisonLabel: "Motion proof includes 3 captured states for PM review.",
    });
    expect(animationProof?.frames?.map((frame) => frame.path)).toEqual([
      ".ambient-codex/browser/screenshots/title.png",
      ".ambient-codex/browser/screenshots/paused.png",
      ".ambient-codex/browser/screenshots/gravity-storm.png",
    ]);
    expect(browserProof).toMatchObject({
      label: "Browser visual proof",
      statusLabel: "Visual check attached",
      role: "browser",
      tone: "success",
      thumbnailSrc: "file:///tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1/.ambient-codex/browser/screenshots/title.png",
    });
  });

  it("surfaces structured task actions as proof evidence and card progress", () => {
    const card = {
      id: "action-card",
      boardId: "board-1",
      title: "Action card",
      description: "Needs structured progress.",
      status: "in_progress" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Render the shell."],
      testPlan: { unit: ["Run unit tests."], integration: [], visual: ["Capture a screenshot."], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-action",
      orchestrationTaskId: "task-action",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:07:00.000Z",
    };
    const task = {
      id: "task-action",
      identifier: "LOCAL-42",
      title: "Action task",
      state: "in_progress",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:07:00.000Z",
    };
    const run = {
      id: "run-action",
      taskId: "task-action",
      attemptNumber: 0,
      status: "running",
      workspacePath: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-42",
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        kind: "agent-run",
        taskToolActions: [
          {
            actionId: "heartbeat-1",
            action: "task_heartbeat",
            cardId: "action-card",
            createdAt: "2026-01-01T00:04:00.000Z",
            summary: "Mounted the shell and moved into verification.",
            completed: ["Created the render loop."],
            remaining: ["Capture visual proof."],
            metadata: { transport: "native_tool", toolName: "task_heartbeat" },
          },
          {
            actionId: "proof-1",
            action: "task_report_proof",
            cardId: "action-card",
            createdAt: "2026-01-01T00:06:00.000Z",
            summary: "Unit and visual proof passed.",
            commands: ["pnpm vitest src/game/renderLoop.test.ts"],
            changedFiles: ["src/game/renderLoop.ts"],
            screenshots: ["/tmp/project/test-results/render-loop.png"],
            browserTraces: [],
            visualChecks: [{ path: "test-results/render-loop.png", result: "nonblank_image_detected", width: 1024, height: 768 }],
            manualChecks: ["Opened the scene locally."],
            metadata: { transport: "native_tool", toolName: "task_report_proof" },
          },
        ],
        taskActionDiagnostics: {
          schemaVersion: 1,
          actionCount: 2,
          nativeToolActionCount: 2,
          fencedFallbackActionCount: 0,
          unknownActionCount: 0,
          terminalActionCount: 1,
          nativeToolUsed: true,
          fallbackJsonUsed: false,
          fallbackOnly: false,
          missingProtocol: [],
          integrityIssueCount: 0,
        },
      },
    };

    const evidence = projectBoardProofEvidenceModel(run, card);
    const detail = projectBoardActiveCardDetail(card, [card], [task], [run]);
    const overview = projectBoardActiveCardOverviewModel(card, { sources: [] }, detail, projectBoardExecutionControlModel(card, { events: [] }, detail));

    expect(evidence.summary).toContain("2 task actions");
    expect(evidence.metrics.map((metric) => metric.label)).toContain("Actions");
    expect(evidence.taskActions.map((action) => [action.label, action.tone])).toEqual([
      ["Progress heartbeat", "neutral"],
      ["Proof reported", "success"],
    ]);
    expect(evidence.files.map((file) => file.path)).toEqual(["src/game/renderLoop.ts"]);
    expect(evidence.artifacts.map((artifact) => artifact.kind)).toEqual(["screenshot", "log", "command", "log"]);
    expect(detail.progressLedger.find((entry) => entry.id === "completed_work")).toMatchObject({
      state: "active",
      detail: expect.stringContaining("Proof reported"),
    });
    expect(detail.progressLedger.find((entry) => entry.id === "task_actions")).toMatchObject({
      state: "done",
      detail: expect.stringContaining("Native task tools: 2; fallback JSON: 0; terminal: 1"),
    });
    expect(detail.progressLedger.find((entry) => entry.id === "task_actions")).toMatchObject({
      state: "done",
      detail: expect.stringContaining("Proof reported"),
    });
    expect(detail.progressLedger.find((entry) => entry.id === "verification")?.detail).toContain("4 verification items");
    expect(detail.progressLedger.find((entry) => entry.id === "proof_collected")?.detail).toContain("2 task actions");
    expect(overview.sections.find((section) => section.id === "proof")?.detail).toContain("Native task tools: 2; fallback JSON: 0; terminal: 1");
  });

  it("treats running transcript snapshots as live progress instead of completed proof", () => {
    const card = {
      id: "progress-card",
      boardId: "board-1",
      title: "Build shell",
      description: "Create the first shell.",
      status: "in_progress" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Canvas mounts."],
      testPlan: { unit: ["Run unit tests"], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-progress",
      orchestrationTaskId: "task-progress",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const task = {
      id: "task-progress",
      identifier: "LOCAL-12",
      title: "Build shell",
      state: "in_progress",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const run = {
      id: "run-progress",
      taskId: "task-progress",
      attemptNumber: 0,
      status: "running",
      workspacePath: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-12",
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        kind: "agent-run-progress",
        elapsedMs: 6500,
        outputCharCount: 1204,
        messageCount: 3,
        toolMessageCount: 1,
        lastAssistantText: "Working on the shell.",
        lastAssistantStatus: "streaming",
        taskToolActions: [
          {
            actionId: "heartbeat-1",
            action: "task_heartbeat",
            cardId: "progress-card",
            createdAt: "2026-01-01T00:04:00.000Z",
            summary: "Scaffolded the shell and started validation.",
            completed: ["Created app scaffold."],
            remaining: ["Finish validation."],
          },
        ],
      },
    };

    const detail = projectBoardActiveCardDetail(card, [card], [task], [run]);
    const evidence = projectBoardProofEvidenceModel(run, card);

    expect(evidence.summary).toContain("1,204 output chars");
    expect(evidence.metrics.map((metric) => [metric.label, metric.value])).toEqual(
      expect.arrayContaining([
        ["Elapsed", "6.5s"],
        ["Output", "1,204 chars"],
        ["Tools", "1"],
      ]),
    );
    expect(detail.progressLedger.find((entry) => entry.id === "completed_work")).toMatchObject({
      state: "active",
      detail: expect.stringContaining("Progress heartbeat"),
    });
    expect(detail.progressLedger.find((entry) => entry.id === "verification")).toMatchObject({
      state: "active",
    });
    expect(detail.progressLedger.find((entry) => entry.id === "proof_collected")).toMatchObject({
      state: "active",
      detail: expect.stringContaining("6.5s elapsed"),
    });
    expect(detail.progressLedger.find((entry) => entry.id === "proof_collected")?.detail).toContain("1,204 output chars");
    expect(detail.progressLedger.find((entry) => entry.id === "proof_collected")?.detail).toContain("1 tool card");
    expect(detail.progressLedger.find((entry) => entry.id === "task_actions")).toMatchObject({
      state: "active",
    });
  });

  it("explains progress ledger states for failed runs and missing proof specs", () => {
    const base = {
      boardId: "board-1",
      description: "Card description.",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Accept it"],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-base",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const card = { ...base, id: "blocked", title: "Blocked card", orchestrationTaskId: "task-blocked" };
    const task = {
      id: "task-blocked",
      identifier: "LOCAL-9",
      title: "Blocked task",
      state: "ready",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const failedRun = {
      id: "run-failed",
      taskId: "task-blocked",
      attemptNumber: 0,
      status: "failed",
      workspacePath: "/tmp/failed",
      startedAt: "2026-01-01T00:03:00.000Z",
      error: "Need API credentials.",
      proofOfWork: {
        kind: "agent-run",
        messageCount: 3,
        lastAssistantStatus: "error",
        afterRunHook: { ok: false, durationMs: 125 },
        focusLoop: { passNumber: 2, maxTurns: 3, action: "finish", reason: "needs_info", missingProof: [] },
      },
    };

    const detail = projectBoardActiveCardDetail(card, [card], [task], [failedRun]);

    expect(detail.proofExpectationCount).toBe(0);
    expect(detail.progressLedger.map((entry) => [entry.id, entry.state])).toEqual([
      ["completed_work", "blocked"],
      ["remaining_work", "blocked"],
      ["files_touched", "missing"],
      ["verification", "blocked"],
      ["proof_collected", "done"],
      ["task_actions", "missing"],
      ["blockers_questions", "blocked"],
      ["next_action", "blocked"],
    ]);
    expect(detail.progressLedger.find((entry) => entry.id === "blockers_questions")?.detail).toContain("Need API credentials");
    expect(detail.progressLedger.find((entry) => entry.id === "proof_collected")?.detail).toContain("focus pass 2 needs_info");
    expect(detail.progressLedger.find((entry) => entry.id === "verification")?.detail).toContain("afterRun hook failed");
  });

  it("surfaces explicit task pause states in the progress ledger", () => {
    const card = {
      id: "needs-info-card",
      boardId: "board-1",
      title: "Needs info card",
      description: "Card description.",
      status: "blocked" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Accept it"],
      testPlan: { unit: ["Run unit"], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-base",
      orchestrationTaskId: "task-needs-info",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const task = {
      id: "task-needs-info",
      identifier: "LOCAL-10",
      title: "Needs info task",
      state: "needs_info",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };

    const detail = projectBoardActiveCardDetail(card, [card], [task], []);

    expect(detail.progressLedger.find((entry) => entry.id === "remaining_work")).toMatchObject({
      state: "blocked",
      detail: "Collect the missing information or credentials before retrying this task.",
    });
    expect(detail.progressLedger.find((entry) => entry.id === "next_action")).toMatchObject({
      state: "blocked",
      detail: "Collect the missing information or credentials before retrying this task.",
    });
  });

  it("models strict proof policy readiness gates", () => {
    const missingProofCard = {
      id: "card-1",
      boardId: "board-1",
      title: "Missing proof",
      description: "",
      status: "draft" as const,
      candidateStatus: "needs_clarification" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "Strict board",
        summary: "Strict",
        charter: {
          id: "charter-1",
          boardId: "board-1",
          version: 1,
          status: "active",
          goal: "Ship safely",
          currentState: "",
          targetUser: "",
          nonGoals: [],
          qualityBar: "Require proof",
          testPolicy: { requireProofSpec: true, defaultProof: "Require proof before ready." },
          decisionPolicy: {},
          dependencyPolicy: {},
          budgetPolicy: {},
          sourcePolicy: {},
          markdown: "",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        cards: [missingProofCard],
        sources: [],
        questions: [],
        proposals: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    expect(projectBoardRequiresProofSpec(board)).toBe(true);
    expect(projectBoardCardCanMarkReady(missingProofCard, board)).toBe(false);
    expect(projectBoardTestSummaryForBoard(board)).toMatchObject({ strict: true, missing: [expect.objectContaining({ id: "card-1" })] });
    expect(projectBoardCardCanMarkReady({ ...missingProofCard, testPlan: { ...missingProofCard.testPlan, manual: ["Review manually."] } }, board)).toBe(true);
  });

  it("does not allow obsolete run follow-up cards to be marked ready after their parent is done", () => {
    const parent: ProjectBoardCard = {
      boardId: "board-1",
      id: "parent-card",
      title: "Implement the feature",
      description: "Parent implementation card.",
      status: "done",
      candidateStatus: "ready_to_create",
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Feature works."],
      testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
      sourceKind: "board_synthesis",
      sourceId: "synthesis:feature",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const followUp: ProjectBoardCard = {
      ...parent,
      id: "proof-follow-up",
      title: "Complete proof for the feature",
      description: "Collect missing proof.",
      status: "draft",
      candidateStatus: "needs_clarification",
      blockedBy: [parent.id],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Review proof."] },
      sourceKind: "run_follow_up",
      sourceId: "run-1#proof-review",
    };
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "Follow-up board",
        summary: "",
        cards: [parent, followUp],
        sources: [],
        questions: [],
        proposals: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    expect(projectBoardCardCanMarkReady(followUp, board)).toBe(false);
  });

  it("models PM Review report UI variants for constraints, conflicts, ignored sources, and activation recommendations", () => {
    const scenarios: Array<{
      name: string;
      report: ProjectBoardPmReviewReport;
      expectedCoverage: Partial<ReturnType<typeof projectBoardPmReviewReportUiModel>["coverage"]>;
      expectedSections: string[];
      excludedText?: string[];
    }> = [
      {
        name: "ready_with_constraints",
        report: pmReviewReport({
          readiness: "ready_for_card_generation",
          summary: "The calculator charter is ready for card generation, constrained to the MVP.",
          sourceConfidence: "medium",
          sourceConfidenceNotes: ["Primary PRD is authoritative, but changed implementation notes should constrain card scope."],
          risks: ["Changed implementation notes could pull the first board beyond MVP scope."],
          sourceAuthorityNotes: ["Treat docs/PRD.md as primary over changed implementation notes."],
          recommendedActivationScope: "Generate only the calculator shell, arithmetic reducer, and visual proof cards.",
          cardGenerationConstraints: ["Generate at most three MVP cards.", "Defer settings, theming, memory, and collaboration cards."],
        }),
        expectedCoverage: { recommendationScope: true, cardGenerationConstraints: true, sourceAuthority: true },
        expectedSections: ["Source confidence: Medium", "Risks", "Source authority", "Card generation constraints"],
      },
      {
        name: "source_conflict_needs_answer",
        report: pmReviewReport({
          readiness: "needs_answers",
          summary: "The editor charter has a blocking source conflict around sync scope.",
          sourceConfidence: "low",
          sourceConfidenceNotes: ["Primary and scratch sources disagree on whether sync is in scope."],
          blockingQuestions: ["Should the first board stay local-only, or include cloud sync/account work?"],
          risks: ["Generating cards before resolving sync scope would produce conflicting implementation work."],
          sourceConflicts: ["docs/PRD.md excludes cloud sync, while scratch/collaboration.md proposes cloud sync and login."],
          sourceAuthorityNotes: ["Prefer docs/PRD.md unless the PM explicitly overrides sync scope."],
          recommendedActivationScope: "Ask the sync-scope question before card generation.",
          cardGenerationConstraints: ["Do not generate sync, login, or collaboration cards until the PM resolves the conflict."],
        }),
        expectedCoverage: { blockingQuestions: true, sourceConflicts: true, cardGenerationConstraints: true },
        expectedSections: ["Source confidence: Low", "Blocking questions", "Source conflicts", "Card generation constraints"],
      },
      {
        name: "ignored_source_excluded",
        report: pmReviewReport({
          summary: "The included PRD is enough for a local kanban board.",
          sourceConfidence: "high",
          sourceConfidenceNotes: ["The ignored spike was excluded; the included PRD covers the local board scope."],
          risks: ["Do not reintroduce ignored spike scope."],
          sourceAuthorityNotes: ["Only docs/kanban-prd.md should guide the first board."],
          recommendedActivationScope: "Generate local kanban board cards from the PRD only.",
          cardGenerationConstraints: ["Exclude experimental ledger scope."],
        }),
        expectedCoverage: { sourceConfidence: true, recommendationScope: true, cardGenerationConstraints: true },
        expectedSections: ["Source confidence: High", "Source authority", "Card generation constraints"],
        excludedText: ["blockchain", "token-gated"],
      },
      {
        name: "recommendation_scope_ready_for_activation",
        report: pmReviewReport({
          readiness: "ready_for_activation",
          summary: "The asteroids charter is ready to activate a narrow first playable slice.",
          sourceConfidence: "high",
          sourceConfidenceNotes: ["The GDD is primary and covers the first playable slice."],
          risks: ["Powerups and online leaderboard work should not enter the first board."],
          sourceAuthorityNotes: ["Treat docs/asteroids-gdd.md as authoritative for first playable scope."],
          recommendedActivationScope: "Activate only player movement, asteroid spawning, shooting, collision, score, and visual proof.",
          cardGenerationConstraints: ["Leave powerups, boss waves, online leaderboard, and monetization to later Add Cards work."],
        }),
        expectedCoverage: { recommendationScope: true, cardGenerationConstraints: true, sourceAuthority: true },
        expectedSections: ["Source confidence: High", "Risks", "Source authority", "Card generation constraints"],
      },
    ];

    for (const scenario of scenarios) {
      const model = projectBoardPmReviewReportUiModel(scenario.report);
      const renderedText = [
        model.readinessLabel,
        model.summary,
        model.recommendedActivationScope,
        ...model.sections.flatMap((section) => [section.title, ...section.items]),
      ].join("\n");

      expect(model.recommendedActivationScope.trim().length, scenario.name).toBeGreaterThan(20);
      expect(model.coverage, scenario.name).toMatchObject({
        sourceConfidence: true,
        gitState: true,
        ...scenario.expectedCoverage,
      });
      for (const title of scenario.expectedSections) {
        expect(model.sections.map((section) => section.title), scenario.name).toContain(title);
      }
      for (const excluded of scenario.excludedText ?? []) {
        expect(renderedText.toLowerCase(), scenario.name).not.toContain(excluded);
      }
    }
  });

  it("models live Pi session preview with terminal copy gating", () => {
    const now = "2026-01-01T00:00:00.000Z";
    const card: ProjectBoardCard = {
      id: "card-live",
      boardId: "board-1",
      title: "Show live Pi events",
      description: "Expose session activity from the selected board card.",
      status: "in_progress",
      candidateStatus: "ready_to_create",
      labels: ["project-board"],
      blockedBy: [],
      acceptanceCriteria: ["Live activity stays scoped to the selected card."],
      testPlan: { unit: ["Model preview state."], integration: [], visual: [], manual: [] },
      sourceKind: "manual",
      sourceId: "manual:card-live",
      orchestrationTaskId: "task-1",
      executionThreadId: "thread-1",
      createdAt: now,
      updatedAt: now,
    };
    const task: OrchestrationTask = {
      id: "task-1",
      identifier: "LOCAL-1",
      title: "Show live Pi events",
      state: "in_progress",
      labels: ["project-board"],
      blockedBy: [],
      sourceKind: "project_board_card",
      createdAt: now,
      updatedAt: now,
    };
    const runningRun: OrchestrationRun = {
      id: "run-1",
      taskId: "task-1",
      attemptNumber: 0,
      status: "running",
      workspacePath: "/workspace/app/.ambient-codex/orchestration/workspaces/LOCAL-1",
      threadId: "thread-1",
      startedAt: now,
      lastEventAt: now,
      proofOfWork: {
        progress: { messageCount: 3, toolMessageCount: 1, elapsedMs: 42_000 },
        lastAssistantText: "Inspecting the board detail pane and wiring recent activity into the selected card.",
      },
    };

    const running = projectBoardLiveSessionPreviewModel({
      card,
      task,
      latestRun: runningRun,
      threadStatus: "tool",
      activityLines: [{ id: "activity-1", kind: "tool", text: "Tool call: file_read App.tsx", timestamp: Date.parse(now) }],
      now: Date.parse(now) + 42_000,
    });

    expect(running).toMatchObject({
      visible: true,
      active: true,
      terminal: false,
      statusLabel: "Tool call running",
      latestAssistantText: expect.stringContaining("Inspecting the board detail pane"),
    });
    expect(running.copyAction).toMatchObject({
      disabled: true,
      label: "Copy Session to Thread",
    });
    expect(running.activity[0]).toMatchObject({ label: "Tool call", text: expect.stringContaining("file_read") });

    const completed = projectBoardLiveSessionPreviewModel({
      card: { ...card, status: "review" },
      task: { ...task, state: "needs_review" },
      latestRun: { ...runningRun, status: "completed", finishedAt: "2026-01-01T00:02:00.000Z" },
      threadStatus: "idle",
    });

    expect(completed).toMatchObject({
      active: false,
      terminal: true,
      statusLabel: "Completed",
    });
    expect(completed.copyAction).toMatchObject({
      disabled: false,
      runId: "run-1",
      threadId: "thread-1",
    });
  });
});

function pmReviewReport(overrides: Partial<ProjectBoardPmReviewReport> = {}): ProjectBoardPmReviewReport {
  return {
    readiness: "ready_for_card_generation",
    summary: "The charter is ready for a lightweight PM review.",
    sourceConfidence: "high",
    sourceConfidenceNotes: ["The selected source set is sufficient for this review."],
    gitState: "git_ready",
    gitStateNotes: ["Git coordination is ready."],
    blockingQuestions: [],
    risks: [],
    sourceConflicts: [],
    sourceAuthorityNotes: [],
    recommendedActivationScope: "Generate the next narrow draft board from this PM review recommendation.",
    cardGenerationConstraints: [],
    ...overrides,
  };
}
