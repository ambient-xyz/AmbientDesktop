import type { ProjectBoardSummary, ProjectSummary } from "../../shared/projectBoardTypes";

export function project(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
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

export function claimSummary(
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

export function boardSummary(overrides: Partial<ProjectBoardSummary> = {}): ProjectBoardSummary {
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
