import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorkflowRevisionSummary } from "../../shared/workflowTypes";
import { ProjectStoreWorkflowDiscoveryQuestionRepository } from "./workflowDiscoveryQuestionRepository";

describe("ProjectStoreWorkflowDiscoveryQuestionRepository", () => {
  let db: Database.Database;
  let revisions: Map<string, WorkflowRevisionSummary>;
  let repository: ProjectStoreWorkflowDiscoveryQuestionRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE workflow_agent_threads (
        id TEXT PRIMARY KEY,
        phase TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE workflow_discovery_questions (
        id TEXT PRIMARY KEY,
        workflow_thread_id TEXT NOT NULL,
        revision_id TEXT,
        question_order INTEGER NOT NULL,
        category TEXT NOT NULL,
        context TEXT NOT NULL,
        question TEXT NOT NULL,
        choices_json TEXT NOT NULL,
        allow_freeform INTEGER NOT NULL,
        answer_json TEXT,
        graph_impact TEXT,
        provider TEXT,
        provider_model TEXT,
        policy_context_summary TEXT,
        capability_search_json TEXT,
        capability_descriptions_json TEXT,
        blocked_reasons_json TEXT,
        access_requests_json TEXT,
        activity_events_json TEXT,
        cache_checkpoint_json TEXT,
        graph_patch_json TEXT,
        created_at TEXT NOT NULL,
        answered_at TEXT
      );
    `);
    db.prepare("INSERT INTO workflow_agent_threads (id, phase, updated_at) VALUES (?, ?, ?)")
      .run("workflow-thread-1", "planned", "2026-06-17T00:00:00.000Z");
    db.prepare("INSERT INTO workflow_agent_threads (id, phase, updated_at) VALUES (?, ?, ?)")
      .run("workflow-thread-2", "planned", "2026-06-17T00:00:00.000Z");
    revisions = new Map([
      ["revision-1", workflowRevision({ id: "revision-1", workflowThreadId: "workflow-thread-1" })],
      ["revision-other", workflowRevision({ id: "revision-other", workflowThreadId: "workflow-thread-2" })],
    ]);
    repository = new ProjectStoreWorkflowDiscoveryQuestionRepository(db, {
      getWorkflowRevision: (revisionId) => required(revisions.get(revisionId), `revision ${revisionId}`),
    });
  });

  afterEach(() => {
    db.close();
  });

  it("creates rich questions, advances order, and updates the thread phase", () => {
    const question = repository.createWorkflowDiscoveryQuestion({
      workflowThreadId: "workflow-thread-1",
      revisionId: "revision-1",
      category: "scope",
      context: "Request: summarize weekly notes.",
      question: "What should trigger this workflow?",
      choices: [{ id: "manual", label: "Manual", description: "Run on demand.", recommended: true }],
      allowFreeform: true,
      graphImpact: "Defines the trigger node.",
      provider: "ambient",
      providerModel: "kimi",
      policyContextSummary: "Safe metadata only.",
      capabilitySearch: {
        query: "weekly notes",
        policy: "metadata only",
        totalCandidateCount: 1,
        omittedCandidateCount: 0,
        results: [
          {
            id: "files",
            kind: "base_directory",
            label: "Files",
            description: "Workspace files",
            status: "requires_grant",
            recommendation: "available",
            reason: "Request mentions notes.",
            matchedTerms: ["notes"],
          },
        ],
      },
      capabilityDescriptions: [
        {
          id: "files",
          kind: "base_directory",
          label: "Files",
          description: "Workspace files",
          status: "requires_grant",
          recommendation: "available",
          policy: "metadata only",
          mutationClass: "read_only",
          inputShapeSummary: "file metadata",
          outputShapeSummary: "bounded previews",
          availabilitySummary: "one candidate",
          examples: ["Inspect notes."],
          warnings: ["No content in search."],
        },
      ],
      blockedReasons: ["needs file access"],
      accessRequests: [
        {
          id: "access-notes",
          capability: "file_content",
          actionKind: "file_content_read",
          targetKind: "path",
          targetLabel: "notes.md",
          targetHash: "hash-notes",
          reason: "Read weekly notes.",
          auditDetail: "notes.md",
          risk: "outside-workspace",
          reusableScopes: ["workflow_thread"],
          recommendedResponse: "always_workflow",
          status: "pending",
        },
      ],
      activityEvents: [
        {
          id: "activity-1",
          kind: "capability_search",
          status: "completed",
          label: "Searched capabilities",
          detail: "Searched workflow discovery capabilities.",
          createdAt: "2026-06-17T00:00:00.000Z",
        },
      ],
      cacheCheckpoint: {
        id: "checkpoint-1",
        stage: "discovery",
        workflowThreadId: "workflow-thread-1",
        stablePrefixHash: "stable",
        stablePrefixChars: 10,
        stablePrefixEstimatedTokens: 3,
        mutableSuffixHash: "mutable",
        mutableSuffixChars: 12,
        mutableSuffixEstimatedTokens: 4,
        requestHash: "request",
        requestEstimatedTokens: 7,
        boundaryLabel: "Discovery",
        createdAt: "2026-06-17T00:00:00.000Z",
      },
      graphPatch: {
        summary: "Manual trigger to markdown output.",
        upsertNodes: [{ id: "markdown-output", type: "output", label: "Markdown output" }],
        upsertEdges: [{ id: "scope-to-output", source: "scope", target: "markdown-output", type: "data_flow" }],
      },
    });
    expect(threadRow("workflow-thread-1")).toMatchObject({ phase: "revision", updated_at: question.createdAt });
    const second = repository.createWorkflowDiscoveryQuestion({
      workflowThreadId: "workflow-thread-1",
      category: "schedule",
      context: "Follow-up context",
      question: "How often?",
      choices: [],
      allowFreeform: true,
    });

    expect(question).toMatchObject({
      id: expect.any(String),
      workflowThreadId: "workflow-thread-1",
      revisionId: "revision-1",
      category: "scope",
      choices: [expect.objectContaining({ id: "manual", recommended: true })],
      allowFreeform: true,
      graphImpact: "Defines the trigger node.",
      provider: "ambient",
      providerModel: "kimi",
      policyContextSummary: "Safe metadata only.",
      capabilitySearch: expect.objectContaining({ query: "weekly notes" }),
      capabilityDescriptions: [expect.objectContaining({ id: "files", mutationClass: "read_only" })],
      blockedReasons: ["needs file access"],
      accessRequests: [expect.objectContaining({ id: "access-notes", status: "pending" })],
      activityEvents: [expect.objectContaining({ id: "activity-1", kind: "capability_search" })],
      cacheCheckpoint: expect.objectContaining({ id: "checkpoint-1", workflowThreadId: "workflow-thread-1" }),
      graphPatch: expect.objectContaining({ summary: "Manual trigger to markdown output." }),
      answeredAt: undefined,
    });
    expect(repository.listWorkflowDiscoveryQuestions("workflow-thread-1").map((item) => item.id)).toEqual([question.id, second.id]);
    expect(threadRow("workflow-thread-1")).toMatchObject({ phase: "discovery", updated_at: second.createdAt });
  });

  it("lists by thread or revision and preserves question order with creation tie-breaks", () => {
    insertQuestion({ id: "question-2", revisionId: "revision-1", order: 2, createdAt: "2026-06-17T00:02:00.000Z" });
    insertQuestion({ id: "question-1", revisionId: "revision-1", order: 1, createdAt: "2026-06-17T00:02:00.000Z" });
    insertQuestion({ id: "question-3", revisionId: "revision-other", order: 1, createdAt: "2026-06-17T00:01:00.000Z", workflowThreadId: "workflow-thread-2" });
    insertQuestion({ id: "question-0", order: 1, createdAt: "2026-06-17T00:01:00.000Z" });

    expect(repository.listWorkflowDiscoveryQuestions("workflow-thread-1").map((question) => question.id)).toEqual([
      "question-0",
      "question-1",
      "question-2",
    ]);
    expect(repository.listWorkflowDiscoveryQuestions("workflow-thread-1", { revisionId: "revision-1" }).map((question) => question.id)).toEqual([
      "question-1",
      "question-2",
    ]);
  });

  it("preserves thread and revision validation errors", () => {
    expect(() => repository.listWorkflowDiscoveryQuestions("missing-thread")).toThrow("Workflow Agent thread not found: missing-thread");
    expect(() =>
      repository.createWorkflowDiscoveryQuestion({
        workflowThreadId: "workflow-thread-1",
        revisionId: "revision-other",
        category: "scope",
        context: "Context",
        question: "Question?",
        choices: [],
        allowFreeform: false,
      }),
    ).toThrow("Workflow revision revision-other does not belong to workflow thread workflow-thread-1.");
  });

  it("answers, clears, and validates discovery answers", () => {
    const question = repository.createWorkflowDiscoveryQuestion({
      workflowThreadId: "workflow-thread-1",
      category: "scope",
      context: "Context",
      question: "Pick one.",
      choices: [{ id: "manual", label: "Manual", description: "Run manually." }],
      allowFreeform: true,
    });
    const answered = repository.answerWorkflowDiscoveryQuestion({
      questionId: question.id,
      choiceId: " manual ",
      freeform: " Later on Mondays. ",
    });

    expect(answered.answer).toMatchObject({
      choiceId: "manual",
      freeform: "Later on Mondays.",
      answeredAt: expect.any(String),
    });
    expect(answered.answeredAt).toEqual(expect.any(String));
    expect(threadRow("workflow-thread-1").updated_at).toBe(answered.answeredAt);
    expect(repository.clearWorkflowDiscoveryQuestionAnswer(question.id)).toMatchObject({
      id: question.id,
      answer: undefined,
      answeredAt: undefined,
    });
    expect(() => repository.answerWorkflowDiscoveryQuestion({ questionId: question.id, choiceId: "missing" })).toThrow(
      "Workflow discovery choice not found: missing",
    );
    expect(() => repository.answerWorkflowDiscoveryQuestion({ questionId: question.id, freeform: "   " })).toThrow(
      "Workflow discovery answer requires a choice or freeform text.",
    );
    expect(() => repository.getWorkflowDiscoveryQuestion("missing-question")).toThrow("Workflow discovery question not found: missing-question");
  });

  it("rejects freeform answers when freeform is disabled", () => {
    const question = repository.createWorkflowDiscoveryQuestion({
      workflowThreadId: "workflow-thread-1",
      category: "scope",
      context: "Context",
      question: "Pick one.",
      choices: [{ id: "manual", label: "Manual", description: "Run manually." }],
      allowFreeform: false,
    });

    expect(() => repository.answerWorkflowDiscoveryQuestion({ questionId: question.id, freeform: "Custom" })).toThrow(
      "This workflow discovery question does not allow freeform answers.",
    );
  });

  it("updates access requests with thread touch and activity events without thread touch", () => {
    const question = repository.createWorkflowDiscoveryQuestion({
      workflowThreadId: "workflow-thread-1",
      category: "scope",
      context: "Context",
      question: "Need access?",
      choices: [],
      allowFreeform: true,
      accessRequests: [
        {
          id: "access-1",
          capability: "file_content",
          actionKind: "file_content_read",
          targetKind: "path",
          targetLabel: "a.md",
          targetHash: "hash-a",
          reason: "Need it.",
          auditDetail: "a.md",
          risk: "outside-workspace",
          reusableScopes: [],
          recommendedResponse: "allow_once",
          status: "pending",
        },
      ],
      activityEvents: [
        {
          id: "event-1",
          kind: "capability_search",
          status: "pending",
          label: "Capability search",
          detail: "Pending.",
          createdAt: "2026-06-17T00:00:00.000Z",
        },
      ],
    });
    db.prepare("UPDATE workflow_agent_threads SET updated_at = ? WHERE id = ?").run("2026-06-17T00:00:00.000Z", "workflow-thread-1");
    const createdThreadUpdatedAt = threadRow("workflow-thread-1").updated_at;

    const withAccess = repository.updateWorkflowDiscoveryAccessRequests({
      questionId: question.id,
      accessRequests: [{ ...question.accessRequests![0], status: "allowed", response: "always_workflow", grantId: "grant-1" }],
    });

    expect(withAccess.accessRequests?.[0]).toMatchObject({ status: "allowed", response: "always_workflow", grantId: "grant-1" });
    expect(threadRow("workflow-thread-1").updated_at).toEqual(expect.any(String));

    const touchedThreadUpdatedAt = threadRow("workflow-thread-1").updated_at;
    const withActivity = repository.updateWorkflowDiscoveryActivityEvents({
      questionId: question.id,
      activityEvents: [
        {
          id: "event-1",
          kind: "capability_search",
          status: "completed",
          label: "Capability search",
          detail: "Done.",
          createdAt: "2026-06-17T00:00:00.000Z",
        },
      ],
    });

    expect(withActivity.activityEvents?.[0]).toMatchObject({ status: "completed", detail: "Done." });
    expect(threadRow("workflow-thread-1").updated_at).toBe(touchedThreadUpdatedAt);
    expect(touchedThreadUpdatedAt).not.toBe(createdThreadUpdatedAt);
    expect(repository.updateWorkflowDiscoveryAccessRequests({ questionId: question.id }).accessRequests).toBeUndefined();
    expect(repository.updateWorkflowDiscoveryActivityEvents({ questionId: question.id }).activityEvents).toBeUndefined();
  });

  function insertQuestion(input: {
    id: string;
    workflowThreadId?: string;
    revisionId?: string;
    order: number;
    createdAt: string;
  }): void {
    db.prepare(
      `INSERT INTO workflow_discovery_questions
        (id, workflow_thread_id, revision_id, question_order, category, context, question, choices_json, allow_freeform, answer_json, graph_impact, provider, provider_model, policy_context_summary, capability_search_json, capability_descriptions_json, blocked_reasons_json, access_requests_json, activity_events_json, cache_checkpoint_json, graph_patch_json, created_at, answered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.id,
      input.workflowThreadId ?? "workflow-thread-1",
      input.revisionId ?? null,
      input.order,
      "scope",
      "Context",
      "Question?",
      "[]",
      1,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      input.createdAt,
      null,
    );
  }

  function threadRow(threadId: string): { phase: string; updated_at: string } {
    return required(db.prepare("SELECT phase, updated_at FROM workflow_agent_threads WHERE id = ?").get(threadId) as { phase: string; updated_at: string } | undefined, threadId);
  }
});

function workflowRevision(input: { id: string; workflowThreadId: string }): WorkflowRevisionSummary {
  return {
    id: input.id,
    workflowThreadId: input.workflowThreadId,
    requestedChange: "Change workflow",
    status: "draft",
    createdAt: "2026-06-17T00:00:00.000Z",
    updatedAt: "2026-06-17T00:00:00.000Z",
  };
}

function required<T>(value: T | undefined, label: string): T {
  if (!value) throw new Error(`Missing ${label}`);
  return value;
}
