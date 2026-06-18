import type { Model } from "@mariozechner/pi-ai";
import { describe, expect, it, vi } from "vitest";

import type { ChatMessage, ThreadSummary } from "../../shared/threadTypes";
import { createAmbientCompactionSummaryExtension } from "./agentRuntimeCompactionSummaryExtension";

describe("createAmbientCompactionSummaryExtension", () => {
  it("adds Ambient workspace state to Pi compaction requests and results", async () => {
    const handlers = new Map<string, (event: any) => Promise<any>>();
    const signal = new AbortController().signal;
    const preparation = {
      messagesToSummarize: [{ role: "assistant", content: "Older assistant context" }],
      fileOps: {
        read: ["/workspace/README.md"],
        written: ["/workspace/output.txt"],
      },
    };
    const compactPiContext = vi.fn(async (..._args: any[]) => ({
      summary: "Pi summary",
      details: { provider: "pi-test" },
    }));
    const buildAmbientCompactionSummary = vi.fn(() => "Ambient workspace summary");
    const collectAmbientCompactionFileLists = vi.fn(() => ({
      readFiles: ["README.md"],
      modifiedFiles: ["output.txt"],
    }));
    const browserState = { running: true, runtime: "chrome", profileMode: "isolated" };
    const gitStatus = { isGitRepository: true, branch: "main" };

    createAmbientCompactionSummaryExtension({
      threadId: "thread-1",
      workspace: { path: "/workspace" },
      model: { id: "ambient-test" } as Model<"openai-completions">,
      apiKey: "test-api-key",
      getThread: () => thread(),
      listMessages: () => visibleMessages(),
      getBrowserState: async () => browserState as any,
      getWorkspaceGitStatus: async () => gitStatus as any,
      compactPiContext,
      buildAmbientCompactionSummary,
      collectAmbientCompactionFileLists,
      now: () => "2026-06-12T05:00:00.000Z",
    })({
      on: (eventName: string, handler: any) => {
        handlers.set(eventName, handler);
      },
    } as any);

    const result = await handlers.get("session_before_compact")!({
      preparation,
      customInstructions: "Keep the deployment notes.",
      signal,
    });

    expect(buildAmbientCompactionSummary).toHaveBeenCalledWith({
      thread: thread(),
      visibleMessages: visibleMessages(),
      summarizedMessages: preparation.messagesToSummarize,
      gitStatus,
      browserState,
      fileOps: preparation.fileOps,
      reason: "manual: Keep the deployment notes.",
    });
    expect(compactPiContext).toHaveBeenCalledOnce();
    const compactArgs = compactPiContext.mock.calls[0]!;
    expect(compactArgs[0]).toBe(preparation);
    expect(compactArgs[2]).toBe("test-api-key");
    expect(compactArgs[3]).toBeUndefined();
    expect(compactArgs[4]).toContain("Keep the deployment notes.");
    expect(compactArgs[4]).toContain("Preserve the Ambient Desktop workspace state below.");
    expect(compactArgs[4]).toContain("Ambient workspace summary");
    expect(compactArgs[5]).toBe(signal);
    expect(compactArgs[6]).toBe("medium");
    expect(collectAmbientCompactionFileLists).toHaveBeenCalledWith({
      visibleMessages: visibleMessages(),
      fileOps: preparation.fileOps,
    });
    expect(result).toEqual({
      compaction: {
        summary: "Pi summary\n\n---\n\nAmbient workspace summary",
        details: {
          provider: "pi-test",
          source: "ambient-desktop",
          version: 1,
          generatedAt: "2026-06-12T05:00:00.000Z",
          readFiles: ["README.md"],
          modifiedFiles: ["output.txt"],
        },
      },
    });
  });

  it("does not register compaction work without an api key", async () => {
    const handlers = new Map<string, (event: any) => Promise<any>>();
    const compactPiContext = vi.fn((..._args: any[]) => undefined);

    createAmbientCompactionSummaryExtension({
      threadId: "thread-1",
      workspace: { path: "/workspace" },
      model: { id: "ambient-test" } as Model<"openai-completions">,
      apiKey: undefined,
      getThread: () => thread(),
      listMessages: () => visibleMessages(),
      getBrowserState: async () => undefined,
      compactPiContext: compactPiContext as any,
    })({
      on: (eventName: string, handler: any) => {
        handlers.set(eventName, handler);
      },
    } as any);

    await expect(handlers.get("session_before_compact")!({ preparation: {} })).resolves.toBeUndefined();
    expect(compactPiContext).not.toHaveBeenCalled();
  });
});

function thread(): ThreadSummary {
  return {
    id: "thread-1",
    title: "Compaction thread",
    workspacePath: "/workspace",
    createdAt: "2026-06-12T04:58:00.000Z",
    updatedAt: "2026-06-12T04:59:00.000Z",
    lastMessagePreview: "Summarize this work.",
    permissionMode: "workspace",
    collaborationMode: "agent",
    thinkingLevel: "medium",
    model: "ambient-test",
  } as ThreadSummary;
}

function visibleMessages(): ChatMessage[] {
  return [
    {
      id: "message-1",
      threadId: "thread-1",
      role: "user",
      content: "Summarize this work.",
      createdAt: "2026-06-12T04:59:00.000Z",
    } as ChatMessage,
  ];
}
