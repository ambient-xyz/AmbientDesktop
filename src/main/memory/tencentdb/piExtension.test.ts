import { describe, expect, it, vi } from "vitest";

import {
  createTencentDbMemoryPiExtension,
  TENCENT_CONVERSATION_SEARCH_TOOL_NAME,
  TENCENT_MEMORY_DELETE_TOOL_NAME,
  TENCENT_MEMORY_INSPECT_TOOL_NAME,
  TENCENT_MEMORY_SEARCH_TOOL_NAME,
  TENCENT_MEMORY_UPDATE_TOOL_NAME,
  type AmbientTencentDbMemoryRuntime,
} from ".";

describe("TencentDB memory Pi extension", () => {
  it("injects bounded recall context and captures the completed turn on agent_end", async () => {
    const runtime = fakeRuntime();
    const { handlers } = registerExtension(runtime);

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "remember that the workspace color is teal",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const contextResult = await handlers.context[0]({
      type: "context",
      messages: [
        { role: "user", content: "remember that the workspace color is teal", timestamp: 1 },
      ],
    } as any, {} as any);

    expect(runtime.recall).toHaveBeenCalledWith("remember that the workspace color is teal");
    expect(runtime.recordContextInjection).toHaveBeenCalledWith(expect.objectContaining({
      originalUserChars: "remember that the workspace color is teal".length,
      recallContextChars: expect.any(Number),
      offloadContextChars: 0,
      totalInjectedChars: expect.any(Number),
    }));
    const injectedContent = (contextResult as any)?.messages?.[0].content;
    expect(injectedContent).toContain("<ambient_memory_context>");
    expect(injectedContent).toContain("workspace color is teal");

    await handlers.agent_end[0]({
      type: "agent_end",
      messages: [
        { role: "user", content: "remember that the workspace color is teal", timestamp: 1 },
        {
          role: "assistant",
          content: [{ type: "text", text: "I will remember that." }],
          timestamp: 2,
        },
      ],
    } as any, {} as any);

    expect(runtime.capture).toHaveBeenCalledWith(expect.objectContaining({
      userText: "remember that the workspace color is teal",
      assistantText: "I will remember that.",
      originalUserMessageCount: 0,
      startedAt: 0,
    }));
  });

  it("uses the user message timestamp floor for capture cursors", async () => {
    const runtime = fakeRuntime();
    const { handlers } = registerExtension(runtime, {
      now: () => 1_765_584_999_999,
    });

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "remember the deployment pin",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    await handlers.context[0]({
      type: "context",
      messages: [
        { role: "user", content: "remember the deployment pin", timestamp: 1_765_584_000_000 },
      ],
    } as any, {} as any);

    await handlers.agent_end[0]({
      type: "agent_end",
      messages: [
        { role: "user", content: "remember the deployment pin", timestamp: 1_765_584_000_000 },
        { role: "assistant", content: "Stored.", timestamp: 1_765_584_000_500 },
      ],
    } as any, {} as any);

    expect(runtime.capture).toHaveBeenCalledWith(expect.objectContaining({
      userText: "remember the deployment pin",
      startedAt: 1_765_583_999_999,
      originalUserMessageCount: 0,
    }));
  });

  it("registers Tencent-compatible search tools and disposes runtime on session shutdown", async () => {
    const runtime = fakeRuntime();
    const { handlers, registeredTools } = registerExtension(runtime);

    const memorySearch = registeredTools.find((tool) => tool.name === TENCENT_MEMORY_SEARCH_TOOL_NAME);
    const conversationSearch = registeredTools.find((tool) => tool.name === TENCENT_CONVERSATION_SEARCH_TOOL_NAME);
    const memoryInspect = registeredTools.find((tool) => tool.name === TENCENT_MEMORY_INSPECT_TOOL_NAME);
    const memoryUpdate = registeredTools.find((tool) => tool.name === TENCENT_MEMORY_UPDATE_TOOL_NAME);
    const memoryDelete = registeredTools.find((tool) => tool.name === TENCENT_MEMORY_DELETE_TOOL_NAME);

    expect(memorySearch?.promptSnippet).toContain("tdai_memory_search");
    expect(conversationSearch?.promptSnippet).toContain("tdai_conversation_search");
    expect(memoryInspect?.promptSnippet).toContain("ambient_memory_inspect");
    expect(memoryUpdate?.promptSnippet).toContain("ambient_memory_update");
    expect(memoryDelete?.promptSnippet).toContain("ambient_memory_delete");

    const memoryResult = await memorySearch.execute("tool-1", { query: "teal", limit: 2 }, undefined, undefined, {} as any);
    expect(memoryResult.content[0].text).toBe("memory hit");
    expect(memoryResult.details).toEqual({ total: 1, strategy: "fake" });

    const conversationResult = await conversationSearch.execute("tool-2", { query: "teal" }, undefined, undefined, {} as any);
    expect(conversationResult.content[0].text).toBe("conversation hit");
    expect(conversationResult.details).toEqual({ total: 1 });

    const inspectResult = await memoryInspect.execute("tool-3", { layer: "l1", scope: "workspace", query: "teal" }, undefined, undefined, {} as any);
    expect(inspectResult.content[0].text).toContain("| ID | Layer | Kind | Updated | Preview |");
    expect(inspectResult.content[0].text).toContain("mem_1");
    expect(inspectResult.details).toMatchObject({ total: 1, truncated: false });
    expect(runtime.inspectMemories).toHaveBeenCalledWith(expect.objectContaining({
      layer: "l1",
      scope: "workspace",
      query: "teal",
    }));

    const unconfirmedUpdate = await memoryUpdate.execute("tool-4", {
      layer: "l1",
      id: "mem_1",
      content: "The workspace color is cyan.",
      confirmed: false,
    }, undefined, undefined, {} as any);
    expect(unconfirmedUpdate.details).toEqual({ unavailable: true });
    expect(runtime.updateMemory).not.toHaveBeenCalled();

    const updateResult = await memoryUpdate.execute("tool-5", {
      layer: "l1",
      id: "mem_1",
      content: "The workspace color is cyan.",
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(updateResult.content[0].text).toContain("Updated TencentDB memory mem_1");
    expect(runtime.updateMemory).toHaveBeenCalledWith(expect.objectContaining({
      layer: "l1",
      id: "mem_1",
      content: "The workspace color is cyan.",
    }));

    const unconfirmedDelete = await memoryDelete.execute("tool-6", {
      layer: "l1",
      ids: ["mem_1"],
      confirmed: false,
    }, undefined, undefined, {} as any);
    expect(unconfirmedDelete.details).toEqual({ unavailable: true });
    expect(runtime.deleteMemory).not.toHaveBeenCalled();

    const deleteResult = await memoryDelete.execute("tool-7", {
      layer: "l1",
      ids: ["mem_1"],
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(deleteResult.content[0].text).toContain("Deleted 1 TencentDB l1 memory.");
    expect(runtime.deleteMemory).toHaveBeenCalledWith({ layer: "l1", ids: ["mem_1"] });

    await handlers.session_shutdown[0]({ type: "session_shutdown", reason: "dispose" } as any, {} as any);
    expect(runtime.dispose).toHaveBeenCalledTimes(1);
  });

  it("injects short-term offload MMD from artifact-backed tool metadata without raw output", async () => {
    const runtime = fakeRuntime();
    (runtime.recall as any).mockResolvedValueOnce(undefined);
    const { handlers } = registerExtension(runtime, {
      shortTermOffload: {
        enabled: true,
        getMessages: () => [{
          id: "tool-browser",
          threadId: "thread-1",
          role: "tool",
          content: "raw browser output secret must not appear",
          createdAt: "2026-06-13T00:00:00.000Z",
          metadata: {
            status: "done",
            toolName: "browser_content",
            toolResultDetails: {
              largeOutputPreview: {
                kind: "large-output",
                summary: "page text summary",
                items: [{
                  label: "page text",
                  chars: 24_500,
                  previewChars: 12_000,
                  truncated: true,
                  artifactPath: ".ambient/tool-outputs/page.txt",
                  artifactBytes: 25_000,
                }],
              },
            },
          },
        }],
      },
    });

    const contextResult = await handlers.context[0]({
      type: "context",
      messages: [
        { role: "user", content: "Use the recent browser result", timestamp: 1 },
      ],
    } as any, {} as any);

    const injectedContent = (contextResult as any)?.messages?.[0].content;
    expect(injectedContent).toContain("<ambient_memory_short_term_offload>");
    expect(injectedContent).toContain("```mermaid");
    expect(injectedContent).toContain(".ambient/tool-outputs/page.txt");
    expect(injectedContent).not.toContain("raw browser output secret");
    expect(runtime.recordContextInjection).toHaveBeenCalledWith(expect.objectContaining({
      recallContextChars: 0,
      offloadContextChars: expect.any(Number),
      totalInjectedChars: expect.any(Number),
    }));
  });
});

function registerExtension(
  runtime: AmbientTencentDbMemoryRuntime,
  options: Partial<Parameters<typeof createTencentDbMemoryPiExtension>[0]> = {},
) {
  const handlers: Record<string, Array<(event: unknown, ctx: unknown) => unknown>> = {};
  const registeredTools: any[] = [];
  const extension = createTencentDbMemoryPiExtension({ ...options, runtime, now: () => 1_765_584_000_000 });
  extension({
    on: (event: string, handler: (event: unknown, ctx: unknown) => unknown) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(handler);
    },
    registerTool: (tool: any) => registeredTools.push(tool),
  } as any);
  return { handlers, registeredTools };
}

function fakeRuntime(): AmbientTencentDbMemoryRuntime {
  return {
    recall: vi.fn(async () => ({
      text: [
        "<ambient_memory_context>",
        "Source: TencentDB Agent Memory (experimental)",
        "The workspace color is teal.",
        "</ambient_memory_context>",
      ].join("\n"),
      recall: { prependContext: "The workspace color is teal." },
      truncated: false,
    })),
    capture: vi.fn(async () => ({
      l0RecordedCount: 2,
      schedulerNotified: false,
      l0VectorsWritten: 0,
      filteredMessages: [],
    })),
    searchMemories: vi.fn(async () => ({ text: "memory hit", total: 1, strategy: "fake" })),
    searchConversations: vi.fn(async () => ({ text: "conversation hit", total: 1 })),
    inspectMemories: vi.fn(async () => ({
      rows: [{
        id: "mem_1",
        layer: "l1",
        content: "The workspace color is teal.",
        preview: "The workspace color is teal.",
        type: "persona",
        priority: 80,
        sessionKey: "ambient-thread:test",
        updatedAt: "2026-06-13T00:00:00.000Z",
        source: "tencentdb",
      }],
      total: 1,
      truncated: false,
    })),
    updateMemory: vi.fn(async () => ({
      id: "mem_1",
      layer: "l1",
      content: "The workspace color is cyan.",
      preview: "The workspace color is cyan.",
      type: "persona",
      priority: 80,
      updatedAt: "2026-06-13T00:01:00.000Z",
      source: "tencentdb",
    })),
    deleteMemory: vi.fn(async () => ({ deleted: ["mem_1"], failed: [] })),
    recordContextInjection: vi.fn(),
    dispose: vi.fn(async () => undefined),
    activeToolNames: [
      TENCENT_MEMORY_SEARCH_TOOL_NAME,
      TENCENT_CONVERSATION_SEARCH_TOOL_NAME,
      TENCENT_MEMORY_INSPECT_TOOL_NAME,
      TENCENT_MEMORY_UPDATE_TOOL_NAME,
      TENCENT_MEMORY_DELETE_TOOL_NAME,
    ],
    sessionKey: "ambient-thread:test",
    snapshot: vi.fn(),
  } as unknown as AmbientTencentDbMemoryRuntime;
}
