import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Model } from "@mariozechner/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AMBIENT_GLM_5_2_FP8_MODEL } from "../../shared/ambientModels";
import type { ChatMessage, ThreadSummary } from "../../shared/threadTypes";
import { ambientModel } from "../ambient/ambientProviderModel";
import { createAmbientCompactionSummaryExtension } from "./agentRuntimeCompactionSummaryExtension";

const tempRoots: string[] = [];

async function makeWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ambient-compaction-provider-context-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

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
      previousSummary: undefined,
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

  it("passes GLM compaction through a descriptor that supports provider reasoning_effort", async () => {
    const handlers = new Map<string, (event: any) => Promise<any>>();
    const compactPiContext = vi.fn(async (..._args: any[]) => ({
      summary: "Pi summary",
      details: {},
    }));
    const model = ambientModel(AMBIENT_GLM_5_2_FP8_MODEL, "https://ambient.example/v1");

    createAmbientCompactionSummaryExtension({
      threadId: "thread-1",
      workspace: { path: "/workspace" },
      model,
      apiKey: "test-api-key",
      getThread: () => thread({ model: AMBIENT_GLM_5_2_FP8_MODEL, thinkingLevel: "xhigh" }),
      listMessages: () => visibleMessages(),
      getBrowserState: async () => undefined,
      getWorkspaceGitStatus: async () => undefined,
      compactPiContext,
      buildAmbientCompactionSummary: () => "Ambient workspace summary",
      collectAmbientCompactionFileLists: () => ({ readFiles: [], modifiedFiles: [] }),
    })({
      on: (eventName: string, handler: any) => {
        handlers.set(eventName, handler);
      },
    } as any);

    await handlers.get("session_before_compact")!({
      preparation: { messagesToSummarize: [], fileOps: {} },
    });

    expect(compactPiContext).toHaveBeenCalledOnce();
    const compactArgs = compactPiContext.mock.calls[0]!;
    expect(compactArgs[1]).toMatchObject({
      id: AMBIENT_GLM_5_2_FP8_MODEL,
      compat: {
        supportsReasoningEffort: true,
        supportsDeveloperRole: false,
        zaiToolStream: true,
      },
      thinkingLevelMap: {
        medium: "high",
        xhigh: "max",
      },
    });
    expect(compactArgs[1].compat).not.toHaveProperty("thinkingFormat");
    expect(compactArgs[6]).toBe("xhigh");
  });

  it("protects compaction messages before Pi summarizes them", async () => {
    const handlers = new Map<string, (event: any) => Promise<any>>();
    const workspacePath = await makeWorkspace();
    const summarizedToolOutput = `summarized tool output\n${"s".repeat(2_000)}`;
    const turnPrefixToolOutput = `turn prefix tool output\n${"p".repeat(2_000)}`;
    const preparation = {
      firstKeptEntryId: "entry-keep",
      tokensBefore: 42_000,
      messagesToSummarize: [
        {
          role: "toolResult",
          toolName: "ambient_capability_builder_list_files",
          content: [{ type: "text", text: summarizedToolOutput }],
        },
      ],
      turnPrefixMessages: [
        {
          role: "tool",
          tool_call_id: "call-2",
          content: turnPrefixToolOutput,
        },
      ],
      isSplitTurn: true,
      fileOps: {},
      settings: { reserveTokens: 100 },
    };
    const compactPiContext = vi.fn(async (..._args: any[]) => ({
      summary: "Pi summary",
      firstKeptEntryId: "entry-keep",
      tokensBefore: 42_000,
      details: { provider: "pi-test" },
    }));

    createAmbientCompactionSummaryExtension({
      threadId: "thread-1",
      workspace: { path: workspacePath },
      model: { id: "ambient-test", contextWindow: 100_000 } as Model<"openai-completions">,
      apiKey: "test-api-key",
      getThread: () => thread(),
      listMessages: () => visibleMessages(),
      getBrowserState: async () => undefined,
      compactPiContext,
      buildAmbientCompactionSummary: () => "Ambient workspace summary",
      collectAmbientCompactionFileLists: () => ({ readFiles: [], modifiedFiles: [] }),
      providerContextPreflight: {
        reserveTokens: 100,
        hardPreflightPercent: 90,
        textPreviewChars: 64,
        offloadTextChars: 100,
      },
    })({
      on: (eventName: string, handler: any) => {
        handlers.set(eventName, handler);
      },
    } as any);

    await handlers.get("session_before_compact")!({ preparation });

    expect(compactPiContext).toHaveBeenCalledOnce();
    const protectedPreparation = compactPiContext.mock.calls[0]![0] as any;
    expect(protectedPreparation).not.toBe(preparation);
    const summarizedText = protectedPreparation.messagesToSummarize[0].content[0].text;
    const turnPrefixText = protectedPreparation.turnPrefixMessages[0].content;
    expect(summarizedText).toContain("Full output saved at: .ambient/tool-outputs/");
    expect(turnPrefixText).toContain("Full output saved at: .ambient/tool-outputs/");
    expect(summarizedText).not.toContain("s".repeat(500));
    expect(turnPrefixText).not.toContain("p".repeat(500));
    expect((preparation.messagesToSummarize[0].content[0] as any).text).toBe(summarizedToolOutput);
    expect(preparation.turnPrefixMessages[0].content).toBe(turnPrefixToolOutput);

    const summarizedArtifactPath = summarizedText.match(/Full output saved at: ([^\n]+)/)?.[1];
    const turnPrefixArtifactPath = turnPrefixText.match(/Full output saved at: ([^\n]+)/)?.[1];
    await expect(readFile(join(workspacePath, summarizedArtifactPath!), "utf8")).resolves.toBe(summarizedToolOutput);
    await expect(readFile(join(workspacePath, turnPrefixArtifactPath!), "utf8")).resolves.toBe(turnPrefixToolOutput);
  });

  it("cancels compaction instead of falling back to raw Pi compaction when protected context is still too large", async () => {
    const handlers = new Map<string, (event: any) => Promise<any>>();
    const workspacePath = await makeWorkspace();
    const materializedToolOutput = `materialized before block\n${"m".repeat(2_000)}`;
    const preparation = {
      firstKeptEntryId: "entry-keep",
      tokensBefore: 42_000,
      messagesToSummarize: [
        {
          role: "toolResult",
          toolName: "huge_tool",
          content: [{ type: "text", text: materializedToolOutput }],
        },
        ...Array.from({ length: 260 }, (_item, index) => ({
          role: "user",
          content: `message ${index}\n${"u".repeat(400)}`,
        })),
      ],
      previousSummary: "Earlier compacted history that must survive.",
      turnPrefixMessages: [],
      isSplitTurn: false,
      fileOps: {},
      settings: { reserveTokens: 0 },
    };
    const compactPiContext = vi.fn(async (..._args: any[]) => ({
      summary: "Pi summary",
    }));

    createAmbientCompactionSummaryExtension({
      threadId: "thread-1",
      workspace: { path: workspacePath },
      model: { id: "ambient-test", contextWindow: 24_000 } as Model<"openai-completions">,
      apiKey: "test-api-key",
      getThread: () => thread(),
      listMessages: () => visibleMessages(),
      getBrowserState: async () => undefined,
      compactPiContext,
      buildAmbientCompactionSummary: () => "Ambient workspace summary",
      collectAmbientCompactionFileLists: () => ({ readFiles: ["README.md"], modifiedFiles: ["output.txt"] }),
      providerContextPreflight: {
        reserveTokens: 0,
        hardPreflightPercent: 100,
        textPreviewChars: 64,
        offloadTextChars: 1_000,
      },
      now: () => "2026-06-12T05:00:00.000Z",
    })({
      on: (eventName: string, handler: any) => {
        handlers.set(eventName, handler);
      },
    } as any);

    const result = await handlers.get("session_before_compact")!({ preparation });

    expect(compactPiContext).not.toHaveBeenCalled();
    expect(result).toEqual({ cancel: true });
    const artifactRoot = join(workspacePath, ".ambient", "tool-outputs");
    expect(existsSync(artifactRoot)).toBe(true);
  });

  it("returns a safe blocked compaction when compaction artifact materialization fails", async () => {
    const handlers = new Map<string, (event: any) => Promise<any>>();
    const workspaceRoot = await makeWorkspace();
    const fileWorkspacePath = join(workspaceRoot, "not-a-directory");
    await writeFile(fileWorkspacePath, "I am a file, not a workspace directory.");
    const preparation = {
      firstKeptEntryId: "entry-keep",
      tokensBefore: 42_000,
      messagesToSummarize: [
        {
          role: "toolResult",
          toolName: "huge_tool",
          content: [{ type: "text", text: "t".repeat(2_000) }],
        },
      ],
      previousSummary: "Earlier compacted history that must survive.",
      turnPrefixMessages: [],
      isSplitTurn: false,
      fileOps: {},
      settings: { reserveTokens: 0 },
    };
    const compactPiContext = vi.fn(async (..._args: any[]) => ({
      summary: "Pi summary",
    }));

    createAmbientCompactionSummaryExtension({
      threadId: "thread-1",
      workspace: { path: fileWorkspacePath },
      model: { id: "ambient-test", contextWindow: 24_000 } as Model<"openai-completions">,
      apiKey: "test-api-key",
      getThread: () => thread(),
      listMessages: () => visibleMessages(),
      getBrowserState: async () => undefined,
      compactPiContext,
      buildAmbientCompactionSummary: () => "Ambient workspace summary",
      collectAmbientCompactionFileLists: () => ({ readFiles: [], modifiedFiles: [] }),
      providerContextPreflight: {
        reserveTokens: 0,
        hardPreflightPercent: 100,
        textPreviewChars: 64,
        offloadTextChars: 100,
      },
    })({
      on: (eventName: string, handler: any) => {
        handlers.set(eventName, handler);
      },
    } as any);

    const result = await handlers.get("session_before_compact")!({ preparation });

    expect(compactPiContext).not.toHaveBeenCalled();
    expect(result).toEqual({ cancel: true });
  });

  it("blocks compaction when the previous summary would exceed the provider budget", async () => {
    const handlers = new Map<string, (event: any) => Promise<any>>();
    const workspacePath = await makeWorkspace();
    const preparation = {
      firstKeptEntryId: "entry-keep",
      tokensBefore: 42_000,
      messagesToSummarize: [{ role: "assistant", content: "short history" }],
      previousSummary: `Earlier compacted history\n${"p".repeat(120_000)}`,
      turnPrefixMessages: [],
      isSplitTurn: false,
      fileOps: {},
      settings: { reserveTokens: 0 },
    };
    const compactPiContext = vi.fn(async (..._args: any[]) => ({
      summary: "Pi summary",
    }));

    createAmbientCompactionSummaryExtension({
      threadId: "thread-1",
      workspace: { path: workspacePath },
      model: { id: "ambient-test", contextWindow: 10_000 } as Model<"openai-completions">,
      apiKey: "test-api-key",
      getThread: () => thread(),
      listMessages: () => visibleMessages(),
      getBrowserState: async () => undefined,
      compactPiContext,
      buildAmbientCompactionSummary: () => "Ambient workspace summary",
      collectAmbientCompactionFileLists: () => ({ readFiles: [], modifiedFiles: [] }),
      providerContextPreflight: {
        reserveTokens: 0,
        hardPreflightPercent: 100,
        textPreviewChars: 64,
        offloadTextChars: 1_000,
      },
    })({
      on: (eventName: string, handler: any) => {
        handlers.set(eventName, handler);
      },
    } as any);

    const result = await handlers.get("session_before_compact")!({ preparation });

    expect(compactPiContext).not.toHaveBeenCalled();
    expect(result).toEqual({ cancel: true });
  });
});

function thread(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
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
    ...overrides,
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
