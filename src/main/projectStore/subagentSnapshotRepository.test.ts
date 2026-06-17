import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SubagentToolScopeResolution } from "../../shared/subagentToolScope";
import { ProjectStoreSubagentSnapshotRepository } from "./subagentSnapshotRepository";

describe("ProjectStoreSubagentSnapshotRepository", () => {
  let db: Database.Database;
  let repository: ProjectStoreSubagentSnapshotRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE subagent_prompt_snapshots (
        run_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        prompt_sha256 TEXT NOT NULL,
        prompt_preview TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        PRIMARY KEY(run_id, sequence)
      );
      CREATE TABLE subagent_tool_scope_snapshots (
        run_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        scope_json TEXT NOT NULL,
        resolver_inputs_json TEXT NOT NULL,
        PRIMARY KEY(run_id, sequence)
      );
    `);
    repository = new ProjectStoreSubagentSnapshotRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("records prompt snapshots with run-local sequence, hash, preview, and ordered reads", () => {
    const longPrompt = `${"a".repeat(1300)} tail`;
    const first = repository.recordSubagentPromptSnapshot("child-run", {
      prompt: longPrompt,
      snapshot: { messages: [{ role: "system", content: "hello" }] },
      createdAt: "2026-06-16T00:01:00.000Z",
    });
    const second = repository.recordSubagentPromptSnapshot("child-run", {
      prompt: "short prompt",
      snapshot: null,
      createdAt: "2026-06-16T00:02:00.000Z",
    });
    const otherRun = repository.recordSubagentPromptSnapshot("other-run", {
      prompt: "other prompt",
      snapshot: { other: true },
      createdAt: "2026-06-16T00:03:00.000Z",
    });

    expect(first).toEqual({
      runId: "child-run",
      sequence: 1,
      createdAt: "2026-06-16T00:01:00.000Z",
      promptSha256: createHash("sha256").update(longPrompt).digest("hex"),
      promptPreview: longPrompt.slice(0, 1200),
      snapshot: { messages: [{ role: "system", content: "hello" }] },
    });
    expect(second).toMatchObject({
      runId: "child-run",
      sequence: 2,
      promptSha256: createHash("sha256").update("short prompt").digest("hex"),
      promptPreview: "short prompt",
      snapshot: undefined,
    });
    expect(otherRun.sequence).toBe(1);
    expect(repository.listSubagentPromptSnapshots("child-run")).toEqual([first, second]);
  });

  it("records tool-scope snapshots with run-local sequence and resolver inputs", () => {
    const firstScope = toolScope({ approvalMode: "interactive" });
    const secondScope = toolScope({ approvalMode: "non_interactive" });
    const first = repository.recordSubagentToolScopeSnapshot("child-run", {
      scope: firstScope,
      resolverInputs: { requestedToolIds: ["shell.exec"] },
      createdAt: "2026-06-16T00:04:00.000Z",
    });
    const second = repository.recordSubagentToolScopeSnapshot("child-run", {
      scope: secondScope,
      createdAt: "2026-06-16T00:05:00.000Z",
    });
    const otherRun = repository.recordSubagentToolScopeSnapshot("other-run", {
      scope: firstScope,
      createdAt: "2026-06-16T00:06:00.000Z",
    });

    expect(first).toEqual({
      runId: "child-run",
      sequence: 1,
      createdAt: "2026-06-16T00:04:00.000Z",
      scope: firstScope,
      resolverInputs: { requestedToolIds: ["shell.exec"] },
    });
    expect(second).toEqual({
      runId: "child-run",
      sequence: 2,
      createdAt: "2026-06-16T00:05:00.000Z",
      scope: secondScope,
      resolverInputs: undefined,
    });
    expect(otherRun.sequence).toBe(1);
    expect(repository.listSubagentToolScopeSnapshots("child-run")).toEqual([first, second]);
  });
});

function toolScope(overrides: Partial<SubagentToolScopeResolution> = {}): SubagentToolScopeResolution {
  return {
    schemaVersion: "ambient-subagent-tool-scope-v1",
    loadedCategories: ["workspace.read"],
    piVisibleCategories: ["workspace.read"],
    deniedCategories: [],
    loadedTools: [
      {
        source: "built_in",
        id: "shell.exec",
        categoryId: "workspace.read",
        piVisible: true,
        mutatesState: false,
        requiresApproval: false,
      },
    ],
    piVisibleTools: [
      {
        source: "built_in",
        id: "shell.exec",
        categoryId: "workspace.read",
        piVisible: true,
        mutatesState: false,
        requiresApproval: false,
      },
    ],
    deniedTools: [],
    approvalMode: "interactive",
    worktreeIsolated: true,
    fanoutAvailable: true,
    ...overrides,
  };
}
