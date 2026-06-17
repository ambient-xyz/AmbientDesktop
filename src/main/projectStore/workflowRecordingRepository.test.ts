import Database from "better-sqlite3";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyProjectStoreBootstrapSchema } from "./projectStoreSchema";
import { ProjectStoreMessageRepository } from "./messageRepository";
import { ProjectStoreThreadRepository, type CreateProjectStoreThreadDefaults } from "./threadRepository";
import { ProjectStoreWorkflowRecordingRepository } from "./workflowRecordingRepository";

describe("ProjectStoreWorkflowRecordingRepository", () => {
  let db: Database.Database;
  let workspacePath = "";
  let messages: ProjectStoreMessageRepository;
  let threads: ProjectStoreThreadRepository;
  let repository: ProjectStoreWorkflowRecordingRepository;

  const defaults: CreateProjectStoreThreadDefaults = {
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "moonshotai/kimi-k2.7-code",
    thinkingLevel: "xhigh",
    memoryDefaultThreadEnabled: true,
  };

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-recording-repository-"));
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    messages = new ProjectStoreMessageRepository(db);
    threads = new ProjectStoreThreadRepository(db, workspacePath);
    repository = new ProjectStoreWorkflowRecordingRepository(db, {
      workspacePath: () => workspacePath,
      createThread: (title, threadWorkspacePath) => threads.createThread(title, threadWorkspacePath, {}, defaults),
      getThread: (threadId) => threads.getThread(threadId),
      listMessages: (threadId) => messages.listMessages(threadId),
    });
  });

  afterEach(async () => {
    db.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("owns recording state, library index discovery, and playbook lifecycle writes", async () => {
    const thread = repository.createWorkflowRecordingThread({
      goal: "Find a reusable date night workflow.",
      workspacePath,
    });

    messages.addMessage({ threadId: thread.id, role: "user", content: "Find Scottsdale theatre options." });
    messages.addMessage({
      threadId: thread.id,
      role: "tool",
      content: "browser_search completed\nFound source-backed theatre listings.",
      metadata: { toolName: "browser_search", toolCallId: "tool-1", status: "done" },
    });
    messages.addMessage({
      threadId: thread.id,
      role: "assistant",
      content: "Use browser search results, compare venues, then summarize options.",
      metadata: { status: "done" },
    });

    const stopped = repository.stopWorkflowRecording(thread.id);
    expect(stopped).toMatchObject({
      status: "stopped",
      capture: {
        messageCount: 3,
        successfulToolResultCount: 1,
      },
    });

    const firstConfirmed = repository.confirmWorkflowRecordingReview(thread.id);
    const saved = firstConfirmed.review!.savedPlaybook!;
    expect(saved.indexPath).toContain(join(workspacePath, ".ambient", "workflows", "index.json"));
    expect(repository.libraryIndexPaths()).toContain(saved.indexPath);
    expect(JSON.parse(await readFile(saved.indexPath, "utf8")).workflows[0]).toMatchObject({
      id: saved.id,
      version: 1,
      enabled: true,
      threadId: thread.id,
    });

    messages.addMessage({
      threadId: thread.id,
      role: "assistant",
      content: [
        "## Intent",
        "Find and rank reusable Scottsdale theatre date night options.",
        "",
        "## Inputs",
        "- City and event preference.",
        "",
        "## Successful tool examples",
        "- `browser_search`: use source-backed theatre search results.",
        "",
        "## Do Not",
        "- `browser_open`: avoid blocked venue pages.",
        "",
        "## Validation",
        "- Final answer cites useful source notes.",
        "",
        "## Output shape",
        "- Ranked shortlist with source notes.",
      ].join("\n"),
      metadata: { status: "done" },
    });
    expect(repository.applyWorkflowRecordingSummary(thread.id).review?.draft).toMatchObject({
      source: "pi_summary",
      intent: "Find and rank reusable Scottsdale theatre date night options.",
    });

    repository.updateWorkflowRecordingReviewDraft(thread.id, {
      intent: "Find and rank reusable Scottsdale theatre date night options.",
      inputs: ["City", "Date window"],
      successfulExamples: [{ toolName: "browser_search", inputPreview: "Scottsdale theatre", resultPreview: "Reusable theatre listings." }],
      doNot: [{ toolName: "browser_open", status: "failed", reason: "Avoid blocked venue pages." }],
      validation: ["Final answer cites useful source notes."],
      outputShape: ["Ranked shortlist with source notes."],
    });
    expect(repository.confirmWorkflowRecordingReview(thread.id).review?.savedPlaybook).toMatchObject({
      id: saved.id,
      version: 2,
    });

    const edited = repository.updateWorkflowRecordingPlaybook(saved.id, {
      baseVersion: 2,
      draft: {
        intent: "Find refined Scottsdale theatre date night options.",
        inputs: ["City", "Date window", "Date-night fit"],
        successfulExamples: [{ toolName: "browser_search", inputPreview: "Scottsdale theatre date night", resultPreview: "Reusable venue result pages." }],
        doNot: [{ toolName: "browser_open", status: "failed", reason: "Avoid blocked venue pages." }],
        validation: ["Final answer ranks source-backed theatre options."],
        outputShape: ["Ranked theatre shortlist with source notes."],
      },
    });
    expect(edited).toMatchObject({
      id: saved.id,
      version: 3,
      playbook: { intent: "Find refined Scottsdale theatre date night options." },
    });

    const restored = repository.restoreWorkflowRecordingVersion(saved.id, 1);
    expect(restored).toMatchObject({
      id: saved.id,
      version: 4,
      versions: [
        expect.objectContaining({ version: 4, restoredFromVersion: 1 }),
        expect.objectContaining({ version: 3 }),
        expect.objectContaining({ version: 2 }),
        expect.objectContaining({ version: 1 }),
      ],
    });

    expect(repository.setWorkflowRecordingEnabled(saved.id, false)).toMatchObject({ id: saved.id, enabled: false });
    expect(threads.getThread(thread.id).workflowRecording?.review?.savedPlaybook).toMatchObject({
      id: saved.id,
      enabled: false,
    });
    expect(repository.listWorkflowRecordingLibrary({ query: "Scottsdale" })).toEqual([]);
    expect(repository.listWorkflowRecordingLibrary({ query: "Scottsdale", includeDisabled: true })[0]).toMatchObject({
      id: saved.id,
      enabled: false,
    });

    repository.setWorkflowRecordingEnabled(saved.id, true);
    const archived = repository.archiveWorkflowRecording(saved.id, { baseVersion: 4, reason: "Superseded." });
    expect(archived).toMatchObject({ id: saved.id, archivedReason: "Superseded." });
    expect(repository.listWorkflowRecordingLibrary({ query: "Scottsdale" })).toEqual([]);
    const unarchived = repository.unarchiveWorkflowRecording(saved.id, { baseVersion: 4 });
    expect(unarchived.id).toBe(saved.id);
    expect(unarchived.archivedAt).toBeUndefined();
  });
});
