import { describe, expect, it } from "vitest";

import type {
  ProjectBoardPlanningSnapshot,
  ProjectBoardSource,
  ProjectBoardSummary,
  ProjectBoardSynthesisRun,
} from "../../shared/types";
import { projectBoardComplexityEstimate } from "./projectBoardComplexityUiModel";

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

function synthesisRun(overrides: Partial<ProjectBoardSynthesisRun> = {}): ProjectBoardSynthesisRun {
  return {
    id: "run-1",
    boardId: "board-1",
    status: "succeeded",
    stage: "board_applied",
    sourceCount: 1,
    includedSourceCount: 1,
    sourceCharCount: 1_000,
    warningCount: 0,
    events: [],
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
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
        requiredCapabilities: ["User accounts", "Transaction database", "Email notifications"],
        supportingCapabilities: [],
        optionalCapabilities: [],
        excludedCapabilities: [],
        planningDepth: {
          score: 86,
          level: "phased",
          signals: ["User accounts, database, and notifications are required."],
          guidance: "Use phased planning with dependency ordering and proofable slices.",
        },
        planningDepthHints: ["Full-stack app with auth and persistence."],
        openQuestions: [],
        evidence: ["Requirements include auth, backend, database, and notifications."],
      },
      planningDepth: {
        score: 86,
        level: "phased",
        signals: ["User accounts, database, and notifications are required."],
        guidance: "Use phased planning with dependency ordering and proofable slices.",
      },
      cardIds: [],
      cards: [],
      renderFingerprint: "fingerprint-1",
    };
    const estimate = projectBoardComplexityEstimate(
      boardSummary({
        title: "Expense Splitter board",
        summary: "One compact card exists.",
        sources: [
          boardSource({
            kind: "plan_artifact",
            title: "Expense Splitter plan",
            summary: "A compact plan artifact.",
          }),
        ],
        synthesisRuns: [synthesisRun({ planningSnapshots: [planningSnapshot] })],
      }),
    );

    expect(estimate.source).toBe("model_scope_contract");
    expect(estimate.band).toBe("large");
    expect(estimate.planningMode).toBe("detailed");
    expect(estimate.signals.some((signal) => signal.id === "model-planning-depth")).toBe(true);
  });

  it("does not count explicitly excluded services as complexity signals", () => {
    const estimate = projectBoardComplexityEstimate(
      boardSummary({
        title: "Hello World Web App - Refined Durable Plan board",
        summary:
          "Create a super simple static-only Hello World page. No JavaScript, no backend, no database, no auth, no payments, no integrations, no game, and no server required. Omit app.js.",
        sources: [
          boardSource({
            id: "source-1",
            kind: "plan_artifact",
            title: "Super Simple Static Hello World Web App",
            summary:
              "Pure vanilla HTML and inline CSS only. No buttons, no interactive state, no backend services, no auth or accounts, no payments, and no deployment integration.",
            byteSize: 12_000,
          }),
          boardSource({
            id: "source-2",
            kind: "implementation_plan",
            title: "Implementation plan",
            summary:
              "Use one index.html file. The implementation should exclude a server, exclude JavaScript, and avoid GitHub, Slack, email, webhook, or third-party integrations.",
            byteSize: 7_000,
          }),
          boardSource({
            id: "source-3",
            kind: "thread",
            title: "make a plan for a simple hello world web app",
            summary: "User asked for a very small static page only.",
            byteSize: 1_500,
          }),
        ],
      }),
    );

    expect(estimate.band).toBe("small");
    expect(estimate.signals.some((signal) => signal.id === "backend-data")).toBe(false);
    expect(estimate.signals.some((signal) => signal.id === "auth-security")).toBe(false);
    expect(estimate.signals.some((signal) => signal.id === "payments-integrations")).toBe(false);
  });
});
