import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStoreThreadGoalRepository } from "./threadGoalRepository";

describe("ProjectStoreThreadGoalRepository", () => {
  let db: Database.Database;
  let repository: ProjectStoreThreadGoalRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY
      );
      CREATE TABLE thread_goals (
        thread_id TEXT PRIMARY KEY,
        goal_id TEXT NOT NULL,
        objective TEXT NOT NULL,
        status TEXT NOT NULL,
        token_budget INTEGER,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        time_used_seconds INTEGER NOT NULL DEFAULT 0,
        continuation_turns INTEGER NOT NULL DEFAULT 0,
        no_progress_turns INTEGER NOT NULL DEFAULT 0,
        provider_infra_failures INTEGER NOT NULL DEFAULT 0,
        status_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        last_continued_at TEXT
      );
    `);
    db.prepare("INSERT INTO threads (id) VALUES (?)").run("thread-1");
    repository = new ProjectStoreThreadGoalRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("creates, updates, clears, and protects per-thread goal state", () => {
    const created = repository.createThreadGoalIfAbsent({
      threadId: "thread-1",
      objective: "Ship goal mode",
      tokenBudget: 1000,
    });

    expect(created).toMatchObject({
      threadId: "thread-1",
      objective: "Ship goal mode",
      status: "active",
      tokenBudget: 1000,
      tokensUsed: 0,
      continuationTurns: 0,
      noProgressTurns: 0,
      providerInfraFailures: 0,
    });
    expect(() => repository.createThreadGoalIfAbsent({ threadId: "thread-1", objective: "Duplicate goal" })).toThrow(
      "Thread already has a goal.",
    );

    const paused = repository.markThreadGoalStatus("thread-1", "paused", {
      expectedGoalId: created.goalId,
      statusReason: " User paused. ",
    });
    expect(paused).toMatchObject({ status: "paused", statusReason: "User paused." });
    repository.accountThreadGoalUsage({ threadId: "thread-1", goalId: created.goalId, noProgressTurnDelta: 4 });

    expect(() => {
      repository.setThreadGoal({
        threadId: "thread-1",
        expectedGoalId: "stale-goal-id",
        status: "active",
      });
    }).toThrow("Thread goal changed before this update could be applied.");

    const resumed = repository.setThreadGoal({
      threadId: "thread-1",
      expectedGoalId: created.goalId,
      status: "active",
    });
    expect(resumed.status).toBe("active");
    expect(resumed.statusReason).toBeUndefined();
    expect(resumed.noProgressTurns).toBe(0);

    const cleared = repository.clearThreadGoal("thread-1", created.goalId);
    expect(cleared?.goalId).toBe(created.goalId);
    expect(repository.getThreadGoal("thread-1")).toBeUndefined();
  });

  it("accounts usage and budget-limits active goals without losing the objective", () => {
    const created = repository.createThreadGoalIfAbsent({
      threadId: "thread-1",
      objective: "Finish within budget",
      tokenBudget: 12,
    });

    const partial = repository.accountThreadGoalUsage({
      threadId: "thread-1",
      goalId: created.goalId,
      tokensUsedDelta: 7,
      timeUsedSecondsDelta: 3,
      continuationTurnDelta: 1,
    });
    expect(partial).toMatchObject({
      status: "active",
      tokensUsed: 7,
      timeUsedSeconds: 3,
      continuationTurns: 1,
    });
    expect(partial?.lastContinuedAt).toBeDefined();

    const limited = repository.accountThreadGoalUsage({
      threadId: "thread-1",
      goalId: created.goalId,
      tokensUsedDelta: 5,
      noProgressTurnDelta: 1,
    });
    expect(limited).toMatchObject({
      objective: "Finish within budget",
      status: "budget_limited",
      tokensUsed: 12,
      noProgressTurns: 1,
      providerInfraFailures: 0,
      statusReason: "Goal token budget reached.",
    });
  });

  it("keeps provider infrastructure failures out of semantic no-progress accounting", () => {
    const created = repository.createThreadGoalIfAbsent({
      threadId: "thread-1",
      objective: "Recover provider stalls",
    });

    const updated = repository.accountThreadGoalUsage({
      threadId: "thread-1",
      goalId: created.goalId,
      noProgressTurnDelta: 1,
      providerInfraFailureDelta: 1,
    });

    expect(updated).toMatchObject({
      noProgressTurns: 0,
      providerInfraFailures: 1,
    });
  });

  it("records provider-unavailable goals as inactive but resumable", () => {
    const created = repository.createThreadGoalIfAbsent({
      threadId: "thread-1",
      objective: "Recover provider stalls",
    });
    repository.accountThreadGoalUsage({
      threadId: "thread-1",
      goalId: created.goalId,
      providerInfraFailureDelta: 2,
    });

    const stopped = repository.markThreadGoalStatus("thread-1", "provider_unavailable", {
      expectedGoalId: created.goalId,
      statusReason: "Provider availability retry limit reached after 2 provider infrastructure failures.",
    });
    expect(stopped).toMatchObject({
      status: "provider_unavailable",
      statusReason: "Provider availability retry limit reached after 2 provider infrastructure failures.",
      completedAt: undefined,
      providerInfraFailures: 2,
    });

    const resumed = repository.setThreadGoal({
      threadId: "thread-1",
      expectedGoalId: created.goalId,
      status: "active",
    });
    expect(resumed).toMatchObject({
      status: "active",
      statusReason: undefined,
      noProgressTurns: 0,
      providerInfraFailures: 0,
    });
  });

  it("keeps missing thread behavior aligned with ProjectStore", () => {
    expect(() => repository.getThreadGoal("missing-thread")).toThrow("Thread not found: missing-thread");
    expect(() => repository.setThreadGoal({ threadId: "missing-thread", objective: "Nope" })).toThrow(
      "Thread not found: missing-thread",
    );
  });
});
