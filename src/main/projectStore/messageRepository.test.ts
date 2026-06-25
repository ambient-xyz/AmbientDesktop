import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectStoreMessageRepository } from "./messageRepository";

describe("ProjectStoreMessageRepository", () => {
  let db: Database.Database;
  let repository: ProjectStoreMessageRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        updated_at TEXT NOT NULL,
        last_message_preview TEXT NOT NULL
      );
      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        metadata_json TEXT
      );
    `);
    db.prepare("INSERT INTO threads (id, updated_at, last_message_preview) VALUES (?, ?, ?)").run(
      "thread-1",
      "2026-06-16T00:00:00.000Z",
      "",
    );
    repository = new ProjectStoreMessageRepository(db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
  });

  it("persists messages and keeps the thread preview behavior", () => {
    const user = repository.addMessage({ threadId: "thread-1", role: "user", content: "Try this request." });
    const tool = repository.addMessage({ threadId: "thread-1", role: "tool", content: "Verbose tool output." });
    repository.addMessage({ threadId: "thread-1", role: "assistant", content: "The runtime returned an error." });

    const remaining = repository.deleteMessagesAfter("thread-1", tool.id);

    expect(remaining.map((message) => message.id)).toEqual([user.id, tool.id]);
    expect(repository.listMessages("thread-1").map((message) => message.id)).toEqual([user.id, tool.id]);
    expect(threadPreview()).toBe("Try this request.");
  });

  it("preserves append and replace message semantics", () => {
    const assistant = repository.addMessage({ threadId: "thread-1", role: "assistant", content: "Hel" });

    const appended = repository.appendToMessage(assistant.id, "lo");
    const replaced = repository.replaceMessage(assistant.id, "Done", { status: "complete" });

    expect(appended.content).toBe("Hello");
    expect(replaced).toMatchObject({ content: "Done", metadata: { status: "complete" } });
    expect(threadPreview()).toBe("Done");
  });

  it("persists prompt cache metadata on add and replace", () => {
    const assistant = repository.addMessage({
      threadId: "thread-1",
      role: "assistant",
      content: "Working",
      metadata: {
        status: "streaming",
        promptCache: {
          status: "pending",
        },
      },
    });

    expect(assistant.metadata).toMatchObject({
      status: "streaming",
      promptCache: { status: "pending" },
    });

    const replaced = repository.replaceMessage(assistant.id, "Done", {
      status: "done",
      promptCache: {
        status: "hit",
        usage: {
          input: 15,
          output: 64,
          cacheRead: 29152,
          cacheWrite: 0,
          totalTokens: 29231,
        },
      },
    });

    expect(replaced.metadata).toMatchObject({
      status: "done",
      promptCache: {
        status: "hit",
        usage: {
          input: 15,
          output: 64,
          cacheRead: 29152,
          cacheWrite: 0,
          totalTokens: 29231,
        },
      },
    });
  });

  it("lists recent messages in display order without loading the whole thread", () => {
    const messages = Array.from({ length: 8 }, (_, index) =>
      repository.addMessage({ threadId: "thread-1", role: "user", content: `Message ${index}` }),
    );

    expect(repository.listRecentMessages("thread-1", 3).map((message) => message.id)).toEqual(
      messages.slice(-3).map((message) => message.id),
    );
    expect(repository.countMessages("thread-1")).toBe(8);
    expect(repository.listRecentMessages("thread-1", 0)).toEqual([]);
    expect(repository.listRecentMessages("thread-1", -10)).toEqual([]);
  });

  it("lists older message pages before a cursor in display order", () => {
    const messages = Array.from({ length: 8 }, (_, index) =>
      repository.addMessage({ threadId: "thread-1", role: "user", content: `Paged ${index}` }),
    );

    const page = repository.listMessagesBefore("thread-1", messages[5]!.id, 3);
    const initialPage = repository.listMessagesBefore("thread-1", undefined, 3);

    expect(page.messages.map((message) => message.id)).toEqual(messages.slice(2, 5).map((message) => message.id));
    expect(page.hasMoreBefore).toBe(true);
    expect(initialPage.messages.map((message) => message.id)).toEqual(messages.slice(-3).map((message) => message.id));
    expect(initialPage.hasMoreBefore).toBe(true);
    expect(repository.listMessagesBefore("thread-1", messages[0]!.id, 3)).toEqual({
      messages: [],
      hasMoreBefore: false,
    });
  });

  it("reads exact message detail by id", () => {
    const message = repository.addMessage({ threadId: "thread-1", role: "assistant", content: "Full detail", metadata: { status: "done" } });

    expect(repository.getMessage(message.id)).toEqual(message);
  });

  it("keeps assistant thinking out of thread previews", () => {
    repository.addMessage({ threadId: "thread-1", role: "user", content: "Inspect memory." });
    const thinking = repository.addMessage({
      threadId: "thread-1",
      role: "assistant",
      content: "The user asked me to inspect memory. I should call the tool.",
      metadata: { kind: "thinking", status: "thinking" },
    });

    expect(threadPreview()).toBe("Inspect memory.");

    repository.replaceMessage(thinking.id, "The user asked me to inspect memory and reply exactly: inspected.", {
      kind: "thinking",
      status: "done",
    });

    expect(threadPreview()).toBe("Inspect memory.");
  });

  it("repairs stale previews from persisted messages", () => {
    const user = repository.addMessage({ threadId: "thread-1", role: "user", content: "Use this preview." });
    repository.addMessage({ threadId: "thread-1", role: "tool", content: "Do not use this tool preview." });
    repository.addMessage({
      threadId: "thread-1",
      role: "assistant",
      content: "The user asked me to use this preview. I should not expose this.",
      metadata: { kind: "thinking", status: "done" },
    });
    db.prepare("UPDATE threads SET last_message_preview = ? WHERE id = ?").run("stale", "thread-1");

    repository.repairThreadPreviews();

    expect(user.content).toBe("Use this preview.");
    expect(threadPreview()).toBe("Use this preview.");
  });

  it("refreshes previews without listing full tool-heavy transcripts", () => {
    repository.addMessage({ threadId: "thread-1", role: "user", content: "Use this preview." });
    const listMessages = vi.spyOn(repository, "listMessages");

    for (let index = 0; index < 75; index += 1) {
      repository.addMessage({ threadId: "thread-1", role: "tool", content: `Verbose tool output ${index}.` });
    }
    const thinking = repository.addMessage({
      threadId: "thread-1",
      role: "assistant",
      content: "The user asked me to use this preview. I should inspect tools.",
      metadata: { kind: "thinking", status: "thinking" },
    });
    repository.replaceMessage(thinking.id, "Still thinking with a longer hidden transcript note.", {
      kind: "thinking",
      status: "done",
    });
    db.prepare("UPDATE threads SET last_message_preview = ? WHERE id = ?").run("stale", "thread-1");

    repository.repairThreadPreviews();

    expect(listMessages).not.toHaveBeenCalled();
    expect(threadPreview()).toBe("Use this preview.");
  });

  function threadPreview(): string {
    const row = db.prepare("SELECT last_message_preview FROM threads WHERE id = ?").get("thread-1") as
      | { last_message_preview: string }
      | undefined;
    return row?.last_message_preview ?? "";
  }
});
