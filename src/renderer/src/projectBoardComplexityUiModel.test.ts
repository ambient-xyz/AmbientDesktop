import { describe, expect, it } from "vitest";
import type {
  ProjectBoardPlanningSnapshot,
  ProjectBoardSource,
  ProjectBoardSummary,
  ProjectBoardSynthesisRun,
} from "../../shared/projectBoardTypes";
import { projectBoardComplexityEstimate } from "./projectBoardComplexityUiModel";

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

describe("projectBoardComplexityUiModel", () => {
  it("calibrates a simple local app as small in fallback shadow mode", () => {
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

    expect(estimate.source).toBe("fallback_shadow");
    expect(estimate.band).toBe("small");
    expect(estimate.planningMode).toBe("fast");
    expect(estimate.suggestedCardBudget).toMatchObject({ min: 1, max: 5 });
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
            summary:
              "Large existing app code mentions backend APIs, authentication, payments, integrations, realtime sync, and collaboration.",
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
        summary:
          "Build a realtime dashboard with authentication, roles, database schema, backend API, Stripe billing, webhooks, and deployment.",
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
});
