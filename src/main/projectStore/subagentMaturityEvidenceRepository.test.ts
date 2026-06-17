import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStoreSubagentMaturityEvidenceRepository } from "./subagentMaturityEvidenceRepository";

describe("ProjectStoreSubagentMaturityEvidenceRepository", () => {
  let db: Database.Database;
  let repository: ProjectStoreSubagentMaturityEvidenceRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE subagent_maturity_evidence (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        evidence_key TEXT,
        status TEXT NOT NULL,
        run_id TEXT,
        parent_run_id TEXT,
        artifact_path TEXT,
        reviewer TEXT,
        notes TEXT,
        details_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    repository = new ProjectStoreSubagentMaturityEvidenceRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("records maturity evidence with normalized fields and derived run evidence keys", () => {
    const evidence = repository.recordSubagentMaturityEvidence({
      kind: "live_dogfood_run",
      status: "passed",
      run: { id: "child-run", parentRunId: "parent-run" },
      artifactPath: "  test-results/live.json  ",
      reviewer: "  release-owner  ",
      notes: "  Live child completed.  ",
      details: { attempts: 1 },
      createdAt: "2026-06-16T03:00:00.000Z",
    });

    expect(evidence).toEqual({
      schemaVersion: "ambient-subagent-maturity-evidence-v1",
      id: expect.any(String),
      kind: "live_dogfood_run",
      status: "passed",
      evidenceKey: "live_dogfood_run:child-run",
      runId: "child-run",
      parentRunId: "parent-run",
      artifactPath: "test-results/live.json",
      reviewer: "release-owner",
      notes: "Live child completed.",
      details: { attempts: 1 },
      createdAt: "2026-06-16T03:00:00.000Z",
      updatedAt: "2026-06-16T03:00:00.000Z",
    });
    expect(repository.getSubagentMaturityEvidence(evidence.id)).toEqual(evidence);
  });

  it("updates existing evidence with the same kind and evidence key", () => {
    const first = repository.recordSubagentMaturityEvidence({
      kind: "security_review",
      status: "failed",
      evidenceKey: "security:2026-06-16",
      reviewer: "security",
      notes: "Initial review failed.",
      createdAt: "2026-06-16T03:01:00.000Z",
    });

    const updated = repository.recordSubagentMaturityEvidence({
      kind: "security_review",
      status: "passed",
      evidenceKey: "security:2026-06-16",
      reviewer: "security",
      notes: "Follow-up accepted.",
      details: { p0: 0, p1: 0 },
      createdAt: "2026-06-16T03:02:00.000Z",
    });

    expect(updated).toMatchObject({
      id: first.id,
      status: "passed",
      notes: "Follow-up accepted.",
      details: { p0: 0, p1: 0 },
      createdAt: "2026-06-16T03:01:00.000Z",
      updatedAt: "2026-06-16T03:02:00.000Z",
    });
    expect(repository.listSubagentMaturityEvidence("security_review")).toEqual([updated]);
  });

  it("lists evidence by kind and all evidence in stable creation order", () => {
    const live = repository.recordSubagentMaturityEvidence({
      kind: "live_pi_smoke",
      status: "passed",
      evidenceKey: "live-smoke",
      createdAt: "2026-06-16T03:03:00.000Z",
    });
    const restart = repository.recordSubagentMaturityEvidence({
      kind: "restart_recovery",
      status: "passed",
      evidenceKey: "restart",
      createdAt: "2026-06-16T03:04:00.000Z",
    });

    expect(repository.listSubagentMaturityEvidence("live_pi_smoke")).toEqual([live]);
    expect(repository.listSubagentMaturityEvidence()).toEqual([live, restart]);
  });

  it("allows records without evidence keys and preserves explicit parent run ids", () => {
    const first = repository.recordSubagentMaturityEvidence({
      kind: "permission_bug_audit",
      status: "passed",
      parentRunId: "  parent-run  ",
      createdAt: "2026-06-16T03:05:00.000Z",
    });
    const second = repository.recordSubagentMaturityEvidence({
      kind: "permission_bug_audit",
      status: "passed",
      parentRunId: "parent-run",
      createdAt: "2026-06-16T03:06:00.000Z",
    });

    expect(first).toMatchObject({
      evidenceKey: undefined,
      parentRunId: "parent-run",
    });
    expect(repository.listSubagentMaturityEvidence("permission_bug_audit")).toEqual([first, second]);
  });

  it("preserves missing-row and invalid enum errors", () => {
    expect(() => repository.getSubagentMaturityEvidence("missing"))
      .toThrow("Sub-agent maturity evidence not found: missing");
    expect(() => repository.recordSubagentMaturityEvidence({
      kind: "unknown_kind" as Parameters<typeof repository.recordSubagentMaturityEvidence>[0]["kind"],
      status: "passed",
    })).toThrow("Unsupported sub-agent maturity evidence kind");
    expect(() => repository.recordSubagentMaturityEvidence({
      kind: "live_pi_smoke",
      status: "unknown_status" as Parameters<typeof repository.recordSubagentMaturityEvidence>[0]["status"],
    })).toThrow("Unsupported sub-agent maturity evidence status");
  });
});
