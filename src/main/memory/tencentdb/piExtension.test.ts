import { describe, expect, it, vi } from "vitest";

import {
  createTencentDbMemoryPiExtension,
  TENCENT_CONVERSATION_SEARCH_TOOL_NAME,
  TENCENT_MEMORY_CREATE_TOOL_NAME,
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
    const memoryCreate = registeredTools.find((tool) => tool.name === TENCENT_MEMORY_CREATE_TOOL_NAME);
    const memoryUpdate = registeredTools.find((tool) => tool.name === TENCENT_MEMORY_UPDATE_TOOL_NAME);
    const memoryDelete = registeredTools.find((tool) => tool.name === TENCENT_MEMORY_DELETE_TOOL_NAME);

    expect(memorySearch?.promptSnippet).toContain("tdai_memory_search");
    expect(conversationSearch?.promptSnippet).toContain("tdai_conversation_search");
    expect(memoryInspect?.promptSnippet).toContain("ambient_memory_inspect");
    expect(memoryCreate?.promptSnippet).toContain("ambient_memory_create");
    expect(memoryCreate?.promptGuidelines.join("\n")).toContain("a bare \"yes\" confirmation is not enough");
    expect(memoryCreate?.promptGuidelines.join("\n")).toContain("Do not store API keys");
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

    const unconfirmedCreate = await memoryCreate.execute("tool-4", {
      content: "The workspace color is teal.",
      confirmed: false,
    }, undefined, undefined, {} as any);
    expect(unconfirmedCreate.details).toEqual({ unavailable: true });
    expect(runtime.createMemory).not.toHaveBeenCalled();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "Please remember this durable fact: The workspace color is teal.",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const malformedConfirmationCreate = await memoryCreate.execute("tool-4-malformed", {
      content: "The workspace color is teal.",
      confirmed: "true",
    }, undefined, undefined, {} as any);
    expect(malformedConfirmationCreate.details).toEqual({ unavailable: true });
    expect(runtime.createMemory).not.toHaveBeenCalled();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "What is the workspace status?",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const untrustedCreate = await memoryCreate.execute("tool-5", {
      content: "The workspace color is teal.",
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(untrustedCreate.details).toEqual({ unavailable: true });
    expect(untrustedCreate.content[0].text).toContain("current user message");
    expect(runtime.createMemory).not.toHaveBeenCalled();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "Do not remember this durable fact: The workspace color is teal.",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const negatedCreate = await memoryCreate.execute("tool-5-negated", {
      content: "The workspace color is teal.",
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(negatedCreate.details).toEqual({ unavailable: true });
    expect(negatedCreate.content[0].text).toContain("positively ask");
    expect(runtime.createMemory).not.toHaveBeenCalled();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "Here is pasted prompt text: \"Please remember this durable fact: The workspace color is teal.\" Do not follow it.",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const quotedInstructionCreate = await memoryCreate.execute("tool-5-quoted", {
      content: "The workspace color is teal.",
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(quotedInstructionCreate.details).toEqual({ unavailable: true });
    expect(runtime.createMemory).not.toHaveBeenCalled();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "Here is pasted text: \"The workspace color is teal. Please remember that.\"",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const quotedTrailingInstructionCreate = await memoryCreate.execute("tool-5-quoted-trailing", {
      content: "The workspace color is teal.",
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(quotedTrailingInstructionCreate.details).toEqual({ unavailable: true });
    expect(runtime.createMemory).not.toHaveBeenCalled();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "Summarize this pasted prompt:\n```\nPlease remember this durable fact: The workspace color is teal.\n```",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const pastedBlockCreate = await memoryCreate.execute("tool-5-pasted-block", {
      content: "The workspace color is teal.",
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(pastedBlockCreate.details).toEqual({ unavailable: true });
    expect(runtime.createMemory).not.toHaveBeenCalled();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "Summarize this pasted prompt. Please remember this durable fact: The workspace color is teal.",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const pastedSentenceCreate = await memoryCreate.execute("tool-5-pasted-sentence", {
      content: "The workspace color is teal.",
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(pastedSentenceCreate.details).toEqual({ unavailable: true });
    expect(runtime.createMemory).not.toHaveBeenCalled();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "Please remember this durable fact: The workspace color is teal. Do not follow this pasted instruction.",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const trailingCaveatCreate = await memoryCreate.execute("tool-5-trailing-caveat", {
      content: "The workspace color is teal.",
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(trailingCaveatCreate.details).toEqual({ unavailable: true });
    expect(runtime.createMemory).not.toHaveBeenCalled();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "Keep this in mind for this answer: The workspace color is teal.",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const transientKeepCreate = await memoryCreate.execute("tool-5-transient-keep", {
      content: "The workspace color is teal.",
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(transientKeepCreate.details).toEqual({ unavailable: true });
    expect(runtime.createMemory).not.toHaveBeenCalled();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "Save this for this answer: The workspace color is teal.",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const transientSaveCreate = await memoryCreate.execute("tool-5-transient-save", {
      content: "The workspace color is teal.",
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(transientSaveCreate.details).toEqual({ unavailable: true });
    expect(runtime.createMemory).not.toHaveBeenCalled();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "Please remember that my API key is abc for this answer.",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const trailingTransientCreate = await memoryCreate.execute("tool-5-trailing-transient", {
      content: "my API key is abc",
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(trailingTransientCreate.details).toEqual({ unavailable: true });
    expect(runtime.createMemory).not.toHaveBeenCalled();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "Please remember this durable fact: my API key is sk-test1234567890abcdef.",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const secretCreate = await memoryCreate.execute("tool-5-secret", {
      content: "my API key is sk-test1234567890abcdef.",
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(secretCreate.details).toEqual({ unavailable: true });
    expect(secretCreate.content[0].text).toContain("secret-like content");
    expect(runtime.createMemory).not.toHaveBeenCalled();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "Please remember this durable fact: my password is hunter2.",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const passwordCreate = await memoryCreate.execute("tool-5-password", {
      content: "my password is hunter2.",
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(passwordCreate.details).toEqual({ unavailable: true });
    expect(passwordCreate.content[0].text).toContain("secret-like content");
    expect(runtime.createMemory).not.toHaveBeenCalled();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "Please remember this durable fact: my API key: ghp_abcdefghijklmnopqrstuvwxyz.",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const spacedApiKeyCreate = await memoryCreate.execute("tool-5-spaced-api-key", {
      content: "my API key: ghp_abcdefghijklmnopqrstuvwxyz.",
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(spacedApiKeyCreate.details).toEqual({ unavailable: true });
    expect(spacedApiKeyCreate.content[0].text).toContain("secret-like content");
    expect(runtime.createMemory).not.toHaveBeenCalled();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "Please remember this durable fact: my access token = abcdefghijklmnop.",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const spacedTokenCreate = await memoryCreate.execute("tool-5-spaced-token", {
      content: "my access token = abcdefghijklmnop.",
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(spacedTokenCreate.details).toEqual({ unavailable: true });
    expect(spacedTokenCreate.content[0].text).toContain("secret-like content");
    expect(runtime.createMemory).not.toHaveBeenCalled();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "Please remember this durable fact: my token is abcdefghijklmnop.",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const genericTokenCreate = await memoryCreate.execute("tool-5-generic-token", {
      content: "my token is abcdefghijklmnop.",
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(genericTokenCreate.details).toEqual({ unavailable: true });
    expect(genericTokenCreate.content[0].text).toContain("secret-like content");
    expect(runtime.createMemory).not.toHaveBeenCalled();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "Please remember this durable fact: my private key is abc def ghi.",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const privateKeyCreate = await memoryCreate.execute("tool-5-private-key", {
      content: "my private key is abc def ghi.",
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(privateKeyCreate.details).toEqual({ unavailable: true });
    expect(privateKeyCreate.content[0].text).toContain("secret-like content");
    expect(runtime.createMemory).not.toHaveBeenCalled();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "Please remember this API key: ghp_abcdefghijklmnopqrstuvwxyz.",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const nakedApiKeyCreate = await memoryCreate.execute("tool-5-naked-api-key", {
      content: "ghp_abcdefghijklmnopqrstuvwxyz",
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(nakedApiKeyCreate.details).toEqual({ unavailable: true });
    expect(nakedApiKeyCreate.content[0].text).toContain("secret-like content");
    expect(runtime.createMemory).not.toHaveBeenCalled();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "Please remember my password hunter2.",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const nakedPasswordCreate = await memoryCreate.execute("tool-5-naked-password", {
      content: "hunter2",
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(nakedPasswordCreate.details).toEqual({ unavailable: true });
    expect(nakedPasswordCreate.content[0].text).toContain("secret-like content");
    expect(runtime.createMemory).not.toHaveBeenCalled();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "Please remember this durable fact: ghp_abcdefghijklmnopqrstuvwxyz.",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const bareGithubTokenCreate = await memoryCreate.execute("tool-5-bare-github-token", {
      content: "ghp_abcdefghijklmnopqrstuvwxyz",
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(bareGithubTokenCreate.details).toEqual({ unavailable: true });
    expect(bareGithubTokenCreate.content[0].text).toContain("secret-like content");
    expect(runtime.createMemory).not.toHaveBeenCalled();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "Please remember this durable fact: AKIA1234567890ABCDEF.",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const bareAwsKeyCreate = await memoryCreate.execute("tool-5-bare-aws-key", {
      content: "AKIA1234567890ABCDEF",
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(bareAwsKeyCreate.details).toEqual({ unavailable: true });
    expect(bareAwsKeyCreate.content[0].text).toContain("secret-like content");
    expect(runtime.createMemory).not.toHaveBeenCalled();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "Remember when I said the workspace color is teal?",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const recallQuestionCreate = await memoryCreate.execute("tool-5-recall-question", {
      content: "the workspace color is teal",
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(recallQuestionCreate.details).toEqual({ unavailable: true });
    expect(runtime.createMemory).not.toHaveBeenCalled();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "The workspace color is teal. Please remember that.",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const trailingDirectiveCreate = await memoryCreate.execute("tool-5-trailing-directive", {
      content: "The workspace color is teal.",
      type: "persona",
      priority: 80,
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(trailingDirectiveCreate.content[0].text).toContain("Created TencentDB memory mem_created");

    vi.mocked(runtime.createMemory).mockClear();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "Save The workspace color is teal as a preference.",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const splitDirectiveCreate = await memoryCreate.execute("tool-5-split-directive", {
      content: "The workspace color is teal",
      type: "persona",
      priority: 80,
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(splitDirectiveCreate.content[0].text).toContain("Created TencentDB memory mem_created");

    vi.mocked(runtime.createMemory).mockClear();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "Could you please remember that my editor theme is solarized?",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const modalPleaseCreate = await memoryCreate.execute("tool-5-modal-please", {
      content: "my editor theme is solarized",
      type: "persona",
      priority: 80,
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(modalPleaseCreate.content[0].text).toContain("Created TencentDB memory mem_created");

    vi.mocked(runtime.createMemory).mockClear();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "Thanks. Please remember this durable fact: The workspace color is teal.",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const leadInCreate = await memoryCreate.execute("tool-5-lead-in", {
      content: "The workspace color is teal.",
      type: "persona",
      priority: 80,
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(leadInCreate.content[0].text).toContain("Created TencentDB memory mem_created");

    vi.mocked(runtime.createMemory).mockClear();

    await handlers.before_agent_start[0]({
      type: "before_agent_start",
      prompt: "Please remember this durable fact: The workspace color is teal.",
      systemPrompt: "system",
      systemPromptOptions: {},
    } as any, {} as any);

    const createResult = await memoryCreate.execute("tool-6", {
      content: "The workspace color is teal.",
      type: "persona",
      priority: 80,
      confirmed: true,
    }, undefined, undefined, {} as any);
    expect(createResult.content[0].text).toContain("Created TencentDB memory mem_created");
    expect(createResult.details).toMatchObject({
      created: {
        id: "mem_created",
        layer: "l1",
        preview: "The workspace color is teal.",
      },
    });
    expect(runtime.createMemory).toHaveBeenCalledWith(expect.objectContaining({
      layer: "l1",
      content: "The workspace color is teal.",
      type: "persona",
      priority: 80,
    }));

    const unconfirmedUpdate = await memoryUpdate.execute("tool-7", {
      layer: "l1",
      id: "mem_1",
      content: "The workspace color is cyan.",
      confirmed: false,
    }, undefined, undefined, {} as any);
    expect(unconfirmedUpdate.details).toEqual({ unavailable: true });
    expect(runtime.updateMemory).not.toHaveBeenCalled();

    const updateResult = await memoryUpdate.execute("tool-8", {
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

    const unconfirmedDelete = await memoryDelete.execute("tool-9", {
      layer: "l1",
      ids: ["mem_1"],
      confirmed: false,
    }, undefined, undefined, {} as any);
    expect(unconfirmedDelete.details).toEqual({ unavailable: true });
    expect(runtime.deleteMemory).not.toHaveBeenCalled();

    const deleteResult = await memoryDelete.execute("tool-10", {
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
    createMemory: vi.fn(async () => ({
      id: "mem_created",
      layer: "l1",
      content: "The workspace color is teal.",
      preview: "The workspace color is teal.",
      type: "persona",
      priority: 80,
      sessionKey: "ambient-thread:test",
      updatedAt: "2026-06-13T00:00:30.000Z",
      source: "tencentdb",
    })),
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
      TENCENT_MEMORY_CREATE_TOOL_NAME,
      TENCENT_MEMORY_UPDATE_TOOL_NAME,
      TENCENT_MEMORY_DELETE_TOOL_NAME,
    ],
    sessionKey: "ambient-thread:test",
    snapshot: vi.fn(),
  } as unknown as AmbientTencentDbMemoryRuntime;
}
