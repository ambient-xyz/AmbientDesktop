import { describe, expect, it, vi } from "vitest";

import type { ProjectSummary } from "../../shared/projectBoardTypes";
import type { ChatMessage, ThreadSummary } from "../../shared/threadTypes";
import {
  compareSidebarThreads,
  orderSidebarSubagentThreads,
  organizeSidebarProjects,
  sidebarThreadAgeLabel,
  threadHasUnreadWork,
  threadIndicator,
  userPromptHistory,
} from "./AppSidebar";

describe("sidebar helpers", () => {
  it("collects user prompt history newest first while skipping blank prompts", () => {
    expect(
      userPromptHistory([
        message({ role: "assistant", content: "Hello" }),
        message({ id: "u1", role: "user", content: "First" }),
        message({ id: "u2", role: "user", content: "   " }),
        message({ id: "u3", role: "user", content: "Second" }),
        message({
          id: "hidden",
          role: "user",
          content: "Continue working toward the active Ambient Desktop thread goal.",
          metadata: {
            runtime: "ambient-internal",
            kind: "hidden-user-message",
            hiddenFromTranscript: true,
            hiddenUserMessage: true,
          },
        }),
      ]),
    ).toEqual(["Second", "First"]);
  });

  it("keeps active and relevant sidebar projects while preserving sort rules", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T00:00:00.000Z"));

    const active = project({
      id: "active",
      path: "/active",
      updatedAt: "2026-05-01T00:00:00.000Z",
      threads: [
        thread({
          id: "active-thread",
          lastMessagePreview: "",
          updatedAt: "2026-05-01T00:00:00.000Z",
        }),
      ],
    });
    const pinned = project({
      id: "pinned",
      path: "/pinned",
      pinned: true,
      updatedAt: "2026-06-03T00:00:00.000Z",
      threads: [thread({ id: "pinned-thread", lastMessagePreview: "Needs follow-up" })],
    });
    const stale = project({
      id: "stale",
      path: "/stale",
      updatedAt: "2026-05-01T00:00:00.000Z",
      threads: [thread({ id: "stale-thread", lastMessagePreview: "", updatedAt: "2026-05-01T00:00:00.000Z" })],
    });

    const organized = organizeSidebarProjects(
      [pinned, stale, active],
      { organize: "project", sort: "updated", show: "relevant" },
      "active-thread",
      "/active",
    );

    expect(organized.map((project) => project.id)).toEqual(["active", "pinned"]);
    expect(organized[0]?.threads.map((thread) => thread.id)).toEqual(["active-thread"]);

    vi.useRealTimers();
  });

  it("compares sidebar threads by pin, chat presence, selected date field, and original order", () => {
    const settings = { organize: "chats-first", sort: "updated", show: "all" } as const;
    const pinned = thread({ id: "pinned", pinned: true });
    const chat = thread({ id: "chat", lastMessagePreview: "Hello", updatedAt: "2026-06-03T00:00:00.000Z" });
    const blank = thread({ id: "blank", lastMessagePreview: "", updatedAt: "2026-06-04T00:00:00.000Z" });
    const tiedA = thread({ id: "tied-a", updatedAt: "2026-06-03T00:00:00.000Z" });
    const tiedB = thread({ id: "tied-b", updatedAt: "2026-06-03T00:00:00.000Z" });

    expect(compareSidebarThreads(pinned, chat, 1, 0, settings)).toBeLessThan(0);
    expect(compareSidebarThreads(chat, blank, 0, 1, settings)).toBeLessThan(0);
    expect(compareSidebarThreads(tiedA, tiedB, 0, 1, settings)).toBeLessThan(0);
  });

  it("keeps sub-agent child threads directly under their parent thread", () => {
    const parent = thread({ id: "parent", updatedAt: "2026-06-04T00:00:00.000Z" });
    const other = thread({ id: "other", updatedAt: "2026-06-05T00:00:00.000Z" });
    const childTwo = thread({
      id: "child-2",
      kind: "subagent_child",
      parentThreadId: "parent",
      childOrder: 2,
      updatedAt: "2026-06-06T00:00:00.000Z",
    });
    const childOne = thread({
      id: "child-1",
      kind: "subagent_child",
      parentThreadId: "parent",
      childOrder: 1,
      updatedAt: "2026-06-07T00:00:00.000Z",
    });

    expect(orderSidebarSubagentThreads([other, childTwo, parent, childOne]).map((item) => item.id)).toEqual([
      "other",
      "parent",
      "child-1",
      "child-2",
    ]);
  });

  it("filters sub-agent child threads from the normal sidebar while the feature is hidden", () => {
    const parent = thread({ id: "parent", updatedAt: "2026-06-04T00:00:00.000Z" });
    const child = thread({
      id: "child",
      kind: "subagent_child",
      parentThreadId: "parent",
      childOrder: 1,
      updatedAt: "2026-06-05T00:00:00.000Z",
      lastMessagePreview: "Child result",
    });
    const sourceProject = project({
      path: "/project",
      threads: [child, parent],
    });

    expect(organizeSidebarProjects(
      [sourceProject],
      { organize: "project", sort: "updated", show: "all" },
      "child",
      "/project",
    )[0]?.threads.map((item) => item.id)).toEqual(["parent", "child"]);

    expect(organizeSidebarProjects(
      [sourceProject],
      { organize: "project", sort: "updated", show: "all" },
      "child",
      "/project",
      { includeSubagentChildren: false },
    )[0]?.threads.map((item) => item.id)).toEqual(["parent"]);
  });

  it("models unread work, thread indicators, and age labels", () => {
    const unread = thread({
      updatedAt: "2026-06-04T00:00:00.000Z",
      lastReadAt: "2026-06-03T00:00:00.000Z",
      lastMessagePreview: "New result",
    });

    expect(threadHasUnreadWork(unread)).toBe(true);
    expect(threadIndicator(unread)).toEqual({ kind: "awaiting", label: "New work" });
    expect(threadIndicator(unread, "streaming")).toEqual({ kind: "running", label: "Running" });
    expect(threadIndicator({ ...unread, lastMessagePreview: "Upstream request failed" })).toEqual({ kind: "error", label: "Error" });
    expect(threadIndicator(unread, undefined, true)).toEqual({ kind: "idle", label: "Idle" });
    expect(threadHasUnreadWork({ ...unread, lastMessagePreview: "Run stopped" })).toBe(false);

    const scheduled = thread({
      scheduledCheckIn: {
        scheduleId: "schedule-1",
        nextRunAt: "2026-06-04T13:00:00.000Z",
        targetKind: "workflow_playbook",
        targetLabel: "Daily summary",
      },
    });
    expect(threadIndicator(scheduled)).toMatchObject({
      kind: "scheduled",
      label: expect.stringContaining("Scheduled check-in for Daily summary at"),
    });
    expect(threadIndicator(scheduled, "streaming")).toEqual({ kind: "running", label: "Running" });
    expect(threadIndicator(scheduled, undefined, true)).toEqual({ kind: "idle", label: "Idle" });
    expect(threadIndicator({ ...scheduled, ...unread })).toEqual({ kind: "awaiting", label: "New work" });

    const now = Date.parse("2026-06-04T12:00:00.000Z");
    expect(sidebarThreadAgeLabel("2026-06-04T11:30:00.000Z", now)).toBeUndefined();
    expect(sidebarThreadAgeLabel("2026-06-04T10:00:00.000Z", now)).toBe("2h");
    expect(sidebarThreadAgeLabel("2026-06-01T12:00:00.000Z", now)).toBe("3d");
    expect(sidebarThreadAgeLabel("2026-05-14T12:00:00.000Z", now)).toBe("3w");
    expect(sidebarThreadAgeLabel("not-a-date", now)).toBeUndefined();
  });
});

function message(input: Partial<ChatMessage>): ChatMessage {
  return {
    id: "message-id",
    threadId: "thread-id",
    role: "user",
    content: "",
    createdAt: "2026-06-04T00:00:00.000Z",
    ...input,
  };
}

function project(input: Partial<ProjectSummary>): ProjectSummary {
  return {
    id: "project-id",
    path: "/project",
    name: "Project",
    statePath: "/project/.ambient",
    sessionPath: "/project/.ambient/session",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    threads: [],
    ...input,
  };
}

function thread(input: Partial<ThreadSummary>): ThreadSummary {
  return {
    id: "thread-id",
    title: "Thread",
    workspacePath: "/project",
    kind: "chat",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "ambient",
    thinkingLevel: "medium",
    ...input,
  };
}
