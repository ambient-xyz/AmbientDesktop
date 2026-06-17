import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { createVisibleChatExportSnapshot, type ChatExportDataSource, type VisibleChatExportSnapshot } from "./chatExport";
import { createChatPdfExport, createElectronPrintToPdfRenderer, renderChatPdfExportHtml } from "./chatPdfExport";
import type { ChatMessage, ThreadSummary, WorkspaceState } from "../shared/types";

describe("chat PDF export", () => {
  it("renders a redacted parent transcript with compact child summaries only", () => {
    const snapshot = sampleVisibleSnapshot({
      messages: [
        sampleMessage({
          id: "visible-user",
          role: "user",
          content: "Please debug with Bearer abcdefghijklmnopqrstuv",
        }),
        sampleMessage({
          id: "visible-assistant",
          role: "assistant",
          content: "Parent answer is ready.",
        }),
      ],
      rawMessages: [
        sampleMessage({
          id: "hidden-thinking",
          role: "assistant",
          content: "hidden model thought",
          metadata: { kind: "thinking" },
        }),
      ],
      childThreadBundles: [
        {
          dir: "child-threads/01-review-child-run-1",
          run: {
            id: "child-run-1",
            parentThreadId: "thread-1",
            parentRunId: "parent-run-1",
            parentMessageId: "message-1",
            childThreadId: "child-thread-1",
            roleId: "reviewer",
            canonicalTaskPath: "Review child",
            status: "completed",
            dependencyMode: "required_all",
            failurePolicy: "block_parent",
            createdAt: "2026-06-17T00:00:00.000Z",
            updatedAt: "2026-06-17T00:00:00.000Z",
            modelRuntimeSnapshot: { profile: { modelId: "ambient-test-model" } },
            roleProfileSnapshotSource: "default",
            resultArtifact: { status: "complete", summary: "Found no issues." },
          } as any,
          thread: sampleThread({ id: "child-thread-1", title: "Review child", kind: "subagent_child" }),
          rawMessages: [
            sampleMessage({
              id: "child-raw",
              threadId: "child-thread-1",
              role: "assistant",
              content: "child transcript body should not be embedded",
            }),
          ],
          messages: [
            sampleMessage({
              id: "child-visible",
              threadId: "child-thread-1",
              role: "assistant",
              content: "child visible body should not be embedded",
            }),
          ],
          artifacts: [],
          runEvents: [],
          mailboxEvents: [],
          toolScopeSnapshots: [],
          waitBarriers: [],
          piSession: { originalPiSessionFileExists: false },
        },
      ],
    });

    const html = renderChatPdfExportHtml(snapshot, { appName: "Ambient", appVersion: "0.1.0" });

    expect(html).toContain("Parent answer is ready.");
    expect(html).toContain("Bearer [REDACTED]");
    expect(html).not.toContain("abcdefghijklmnopqrstuv");
    expect(html).not.toContain("hidden model thought");
    expect(html).toContain("Review child");
    expect(html).toContain("completed");
    expect(html).not.toContain("child transcript body should not be embedded");
    expect(html).not.toContain("child visible body should not be embedded");
  });

  it("creates a PDF payload with a title-based filename through the injected renderer", async () => {
    const renderHtmlToPdf = vi.fn(async (html: string) => Buffer.from(`pdf:${html.includes("Debug Chat")}`));
    const store = sampleDataSource();

    const payload = await createChatPdfExport(store, "thread-1", {
      appName: "Ambient",
      appVersion: "0.1.0",
      now: new Date("2026-06-17T01:02:03.004Z"),
      renderHtmlToPdf,
    });

    expect(payload.fileName).toBe("ambient-chat-export-debug-chat-2026-06-17T01-02-03-004Z.pdf");
    expect(payload.createdAt).toBe("2026-06-17T01:02:03.004Z");
    expect(payload.source).toBe("visible-chat-pdf");
    expect(payload.fallbackReason).toBeUndefined();
    expect(payload.pdf.toString()).toBe("pdf:true");
    expect(renderHtmlToPdf).toHaveBeenCalledOnce();
  });

  it("does not use secret-bearing thread titles in PDF filenames or document metadata", async () => {
    let renderedHtml = "";
    const renderHtmlToPdf = vi.fn(async (html: string) => {
      renderedHtml = html;
      return Buffer.from("pdf");
    });
    const store = sampleDataSource({
      thread: sampleThread({
        id: "thread-secret",
        title: "Fix Bearer abcdefghijklmnopqrstuv",
      }),
    });

    const payload = await createChatPdfExport(store, "thread-secret", {
      appName: "Ambient",
      appVersion: "0.1.0",
      now: new Date("2026-06-17T01:02:03.004Z"),
      renderHtmlToPdf,
    });

    expect(payload.fileName).toBe("ambient-chat-export-thread-secret-2026-06-17T01-02-03-004Z.pdf");
    expect(renderedHtml).toContain("<title>Fix Bearer [REDACTED]</title>");
    expect(renderedHtml).not.toContain("abcdefghijklmnopqrstuv");
  });

  it("uses a lightweight visible snapshot that skips raw Pi session content for PDFs", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ambient-chat-pdf-snapshot-"));
    try {
      const workspace = sampleWorkspace(workspaceRoot);
      const sessionDir = join(workspace.sessionPath, "thread-1");
      await mkdir(sessionDir, { recursive: true });
      const sessionFile = join(sessionDir, "session.jsonl");
      await writeFile(sessionFile, "raw pi session body", "utf8");
      const thread = sampleThread({ id: "thread-1", title: "Debug Chat", piSessionFile: sessionFile });
      const store = sampleDataSource({ workspace, thread });

      await expect(createVisibleChatExportSnapshot(store, thread.id, {
        appName: "Ambient",
        appVersion: "0.1.0",
        includePiSessionContent: true,
      })).resolves.toMatchObject({
        piSession: { content: "raw pi session body" },
        source: "pi-session",
      });

      await expect(createVisibleChatExportSnapshot(store, thread.id, {
        appName: "Ambient",
        appVersion: "0.1.0",
        includePiSessionContent: false,
      })).resolves.toMatchObject({
        piSession: {},
        source: "visible-chat-fallback",
      });
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("loads generated PDF HTML through a temporary file URL", async () => {
    let loadedUrl = "";
    class FakeWindow {
      webContents = {
        printToPDF: vi.fn(async () => Buffer.from("pdf")),
      };

      async loadURL(url: string): Promise<void> {
        loadedUrl = url;
        expect(await access(fileURLToPath(url)).then(() => true)).toBe(true);
      }

      isDestroyed(): boolean {
        return false;
      }

      close(): void {
        return undefined;
      }
    }

    const pdf = await createElectronPrintToPdfRenderer(FakeWindow as any)("<html><body>large transcript</body></html>");

    expect(pdf.toString()).toBe("pdf");
    expect(loadedUrl.startsWith("file://")).toBe(true);
    expect(loadedUrl.startsWith("data:")).toBe(false);
    await expect(access(fileURLToPath(loadedUrl))).rejects.toThrow();
  });
});

function sampleDataSource({
  workspace = sampleWorkspace(),
  thread = sampleThread({ id: "thread-1", title: "Debug Chat" }),
  messages = [sampleMessage({ id: "message-1", threadId: thread.id, content: "Visible parent message" })],
}: {
  workspace?: WorkspaceState;
  thread?: ThreadSummary;
  messages?: ChatMessage[];
} = {}): ChatExportDataSource {
  return {
    getWorkspace: () => workspace,
    getThread: () => thread,
    listMessages: () => messages,
  };
}

function sampleVisibleSnapshot(overrides: Partial<VisibleChatExportSnapshot> = {}): VisibleChatExportSnapshot {
  const rawMessages = overrides.rawMessages ?? [];
  const messages = overrides.messages ?? [];
  return {
    createdAt: "2026-06-17T00:00:00.000Z",
    workspace: sampleWorkspace(),
    thread: sampleThread({ id: "thread-1", title: "Debug Chat" }),
    rawMessages: [...rawMessages, ...messages],
    messages,
    artifacts: [],
    piSession: {},
    childThreadBundles: [],
    parentMailboxEvents: [],
    callableWorkflowTasks: [],
    source: "pi-session",
    ...overrides,
  };
}

function sampleWorkspace(root = "/tmp/workspace"): WorkspaceState {
  return {
    path: root,
    name: "workspace",
    statePath: `${root}/.ambient/state.json`,
    sessionPath: `${root}/.ambient/sessions`,
  };
}

function sampleThread(input: Partial<ThreadSummary> & Pick<ThreadSummary, "id" | "title">): ThreadSummary {
  const { id, title, ...rest } = input;
  return {
    id,
    title,
    workspacePath: "/tmp/workspace",
    kind: rest.kind ?? "chat",
    createdAt: "2026-06-17T00:00:00.000Z",
    updatedAt: "2026-06-17T00:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "ambient-test-model",
    thinkingLevel: "medium",
    ...rest,
  };
}

function sampleMessage(input: Partial<ChatMessage> & Pick<ChatMessage, "id">): ChatMessage {
  return {
    id: input.id,
    threadId: input.threadId ?? "thread-1",
    role: input.role ?? "user",
    content: input.content ?? "",
    createdAt: "2026-06-17T00:00:00.000Z",
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}
