import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectBoardCard } from "../../shared/projectBoardTypes";
import type { ChatMessage, ThreadSummary } from "../../shared/threadTypes";
import type { OrchestrationRun } from "../../shared/workflowTypes";
import { applyProjectStoreBootstrapSchema } from "./projectStoreSchema";
import {
  ProjectStoreProjectBoardSessionCopyRepository,
  type ProjectBoardSessionCopyEventInput,
  type ProjectBoardSessionCopyMessageInput,
} from "./projectBoardSessionCopyRepository";

const NOW = "2026-06-16T00:00:00.000Z";

describe("ProjectStoreProjectBoardSessionCopyRepository", () => {
  let db: Database.Database;
  let card: ProjectBoardCard;
  let run: OrchestrationRun;
  let threads: Map<string, ThreadSummary>;
  let messages: ProjectBoardSessionCopyMessageInput[];
  let events: ProjectBoardSessionCopyEventInput[];
  let repository: ProjectStoreProjectBoardSessionCopyRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    insertBoard(db, "board-1");
    card = projectCard({ orchestrationTaskId: "task-1" });
    run = orchestrationRun({ id: "run-1", taskId: "task-1", status: "completed", threadId: "source-thread" });
    threads = new Map([["source-thread", threadSummary("source-thread", "Source Pi session", "/workspace/project")]]);
    messages = [];
    events = [];
    repository = new ProjectStoreProjectBoardSessionCopyRepository(db, {
      getProjectBoardCard: (cardId) => {
        if (cardId !== card.id) throw new Error(`Unexpected card lookup: ${cardId}`);
        return card;
      },
      getOrchestrationRun: (runId) => {
        if (runId !== run.id) throw new Error(`Unexpected run lookup: ${runId}`);
        return run;
      },
      getWorkspacePath: () => "/workspace/project",
      getThread: (threadId) => {
        const thread = threads.get(threadId);
        if (!thread) throw new Error(`Thread not found: ${threadId}`);
        return thread;
      },
      forkThread: (threadId, workspacePath) => {
        const source = threads.get(threadId);
        if (!source) throw new Error(`Thread not found: ${threadId}`);
        const fork = threadSummary("copied-thread", source.title, workspacePath);
        threads.set(fork.id, fork);
        return fork;
      },
      updateThreadTitle: (threadId, title) => {
        const current = threads.get(threadId);
        if (!current) throw new Error(`Thread not found: ${threadId}`);
        const updated = { ...current, title };
        threads.set(threadId, updated);
        return updated;
      },
      addMessage: (message) => {
        messages.push(message);
        return chatMessage(`message-${messages.length}`, message);
      },
      appendProjectBoardEvent: (event) => {
        events.push(event);
      },
    });
  });

  afterEach(() => {
    db.close();
  });

  it("copies a terminal Pi session into a local project thread and records handoff context", () => {
    const copied = repository.copyProjectBoardSessionToThread({ cardId: card.id, runId: run.id });

    expect(copied).toMatchObject({
      id: "copied-thread",
      title: "Session copy: Copy stopped session",
      workspacePath: "/workspace/project",
    });
    expect(messages).toEqual([
      expect.objectContaining({
        threadId: "copied-thread",
        role: "system",
        content: expect.stringContaining("Copied from project-board card"),
        metadata: expect.objectContaining({
          kind: "project_board_session_copy",
          cardId: card.id,
          boardId: card.boardId,
          runId: run.id,
          taskId: run.taskId,
          sourceThreadId: "source-thread",
        }),
      }),
    ]);
    expect(events).toEqual([
      expect.objectContaining({
        boardId: "board-1",
        kind: "card_run_handoff_created",
        title: "Pi session copied to local thread",
        entityId: run.id,
        metadata: expect.objectContaining({
          cardId: card.id,
          runId: run.id,
          sourceThreadId: "source-thread",
          copiedThreadId: "copied-thread",
        }),
      }),
    ]);
    expect(boardUpdatedAt(db, "board-1")).not.toBe(NOW);
  });

  it("rejects active runs without forking, messaging, or eventing", () => {
    run = orchestrationRun({ id: "run-active", taskId: "task-1", status: "running", threadId: "source-thread" });

    expect(() => repository.copyProjectBoardSessionToThread({ cardId: card.id, runId: run.id })).toThrow(
      "Copy Session to Thread is available only after",
    );
    expect(threads.has("copied-thread")).toBe(false);
    expect(messages).toEqual([]);
    expect(events).toEqual([]);
    expect(boardUpdatedAt(db, "board-1")).toBe(NOW);
  });
});

function insertBoard(db: Database.Database, id: string): void {
  db.prepare(
    `INSERT INTO project_boards
      (id, project_path, status, title, summary, created_at, updated_at)
     VALUES (?, '/workspace/project', 'active', 'Project board', '', ?, ?)`,
  ).run(id, NOW, NOW);
}

function boardUpdatedAt(db: Database.Database, boardId: string): string | undefined {
  return (db.prepare("SELECT updated_at FROM project_boards WHERE id = ?").get(boardId) as { updated_at?: string } | undefined)
    ?.updated_at;
}

function projectCard(input: { orchestrationTaskId?: string }): ProjectBoardCard {
  return {
    id: "card-1",
    boardId: "board-1",
    title: "Copy stopped session",
    description: "Make the completed Pi transcript available as a local thread.",
    status: "review",
    candidateStatus: "ready_to_create",
    labels: [],
    blockedBy: [],
    acceptanceCriteria: [],
    testPlan: { unit: [], integration: [], visual: [], manual: [] },
    sourceKind: "manual",
    sourceId: "manual:card-1",
    orchestrationTaskId: input.orchestrationTaskId,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function orchestrationRun(input: { id: string; taskId: string; status: string; threadId?: string }): OrchestrationRun {
  return {
    id: input.id,
    taskId: input.taskId,
    attemptNumber: 1,
    status: input.status,
    workspacePath: "/workspace/project/.ambient-codex/orchestration/workspaces/task-1",
    threadId: input.threadId,
    startedAt: NOW,
    finishedAt: input.status === "running" ? undefined : NOW,
  };
}

function threadSummary(id: string, title: string, workspacePath: string): ThreadSummary {
  return {
    id,
    title,
    workspacePath,
    createdAt: NOW,
    updatedAt: NOW,
    lastMessagePreview: "",
    permissionMode: "full-access",
    collaborationMode: "agent",
    model: "moonshotai/kimi-k2.7-code",
    thinkingLevel: "medium",
  };
}

function chatMessage(id: string, input: ProjectBoardSessionCopyMessageInput): ChatMessage {
  return {
    id,
    threadId: input.threadId,
    role: input.role,
    content: input.content,
    createdAt: NOW,
    metadata: input.metadata,
  };
}
