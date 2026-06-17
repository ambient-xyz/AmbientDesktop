import { describe, expect, it, vi } from "vitest";
import {
  buildLocalDeepResearchLlamaChatRequest,
  callLocalDeepResearchLlamaChat,
  createLocalDeepResearchLlamaChatClient,
  normalizeLocalDeepResearchLlamaEndpointUrl,
} from "./localDeepResearchLlamaClient";
import { buildLocalDeepResearchSetupContract } from "./localDeepResearchSetup";
import type { LocalDeepResearchChatCompletionInput, LocalDeepResearchChatMessage } from "./localDeepResearchRunner";
import { localDeepResearchToolBudgetState, resolveLocalDeepResearchRunBudget } from "../../shared/localDeepResearchBudget";

const gib = 1024 ** 3;

describe("Local Deep Research llama.cpp client", () => {
  it("normalizes local endpoint origins and rejects remote or request-path endpoints", () => {
    expect(normalizeLocalDeepResearchLlamaEndpointUrl("http://127.0.0.1:8080/")).toBe("http://127.0.0.1:8080");
    expect(normalizeLocalDeepResearchLlamaEndpointUrl("http://localhost:8080")).toBe("http://localhost:8080");
    expect(normalizeLocalDeepResearchLlamaEndpointUrl("http://[::1]:8080")).toBe("http://[::1]:8080");

    expect(() => normalizeLocalDeepResearchLlamaEndpointUrl("https://example.com")).toThrow("local-only");
    expect(() => normalizeLocalDeepResearchLlamaEndpointUrl("file:///tmp/llama")).toThrow("http:// or https://");
    expect(() => normalizeLocalDeepResearchLlamaEndpointUrl("http://127.0.0.1:8080/v1/chat/completions")).toThrow("endpoint origin");
  });

  it("builds llama.cpp compatible chat requests with tool observations converted to user messages", () => {
    const setup = readySetup();
    const messages: LocalDeepResearchChatMessage[] = [
      { role: "system", content: "system prompt" },
      { role: "user", content: "question" },
      { role: "assistant", content: '{"name":"search","arguments":{"query":"ambient"}}' },
      { role: "tool", name: "search", toolCallId: "call-1", content: "<tool_response>evidence</tool_response>" },
    ];

    const request = buildLocalDeepResearchLlamaChatRequest(
      { messages, setup, toolCallCount: 1, toolBudget: localDeepResearchToolBudgetState(resolveLocalDeepResearchRunBudget(undefined), 1) },
      { modelId: "custom-model", temperature: 0.7, maxTokens: 4096 },
    );

    expect(request).toEqual({
      model: "custom-model",
      temperature: 0.7,
      max_tokens: 4096,
      stream: false,
      chat_template_kwargs: { enable_thinking: false },
      reasoning_format: "none",
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "question" },
        { role: "assistant", content: '{"name":"search","arguments":{"query":"ambient"}}' },
        { role: "user", content: "Tool observation from search (call-1):\n<tool_response>evidence</tool_response>" },
      ],
    });
  });

  it("posts to /v1/chat/completions and parses the assistant response", async () => {
    const calls: Array<{ url: string; body: any }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return jsonResponse({ choices: [{ message: { content: "  final answer  " } }] });
    });
    const setup = readySetup();
    const chat = createLocalDeepResearchLlamaChatClient({
      endpointUrl: "http://127.0.0.1:43123/",
      fetchImpl: fetchImpl as typeof fetch,
      modelId: "literesearcher-local",
    });

    const result = await chat.complete(chatInput(setup));

    expect(result.content).toBe("final answer");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: "http://127.0.0.1:43123/v1/chat/completions",
      body: {
        model: "literesearcher-local",
        stream: false,
        chat_template_kwargs: { enable_thinking: false },
        reasoning_format: "none",
        messages: [
          expect.objectContaining({ role: "system" }),
          expect.objectContaining({ role: "user", content: "What changed?" }),
        ],
      },
    });
  });

  it("falls back to the selected setup profile as model id", () => {
    const setup = readySetup();
    const request = buildLocalDeepResearchLlamaChatRequest(chatInput(setup));

    expect(request.model).toBe("literesearcher-4b-q4-k-m");
    expect(request.max_tokens).toBe(4096);
  });

  it("surfaces HTTP and malformed response failures with bounded detail", async () => {
    const setup = readySetup();

    await expect(callLocalDeepResearchLlamaChat({
      endpointUrl: "http://127.0.0.1:43123",
      fetchImpl: async () => new Response("upstream unavailable ".repeat(40), { status: 503 }),
    }, chatInput(setup))).rejects.toThrow("Local Deep Research llama-server chat failed (503): upstream unavailable");

    await expect(callLocalDeepResearchLlamaChat({
      endpointUrl: "http://127.0.0.1:43123",
      fetchImpl: async () => jsonResponse({ choices: [{ message: { content: "" } }] }),
    }, chatInput(setup))).rejects.toThrow("empty assistant message");

    await expect(callLocalDeepResearchLlamaChat({
      endpointUrl: "http://127.0.0.1:43123",
      fetchImpl: async () => jsonResponse({ choices: [{ message: { content: "", reasoning_content: "thinking only" } }] }),
    }, chatInput(setup))).rejects.toThrow("request disables llama.cpp thinking");
  });

  it("enforces a bounded llama-server request timeout", async () => {
    const setup = readySetup();
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });

    await expect(callLocalDeepResearchLlamaChat({
      endpointUrl: "http://127.0.0.1:43123",
      fetchImpl: fetchImpl as typeof fetch,
      requestTimeoutMs: 1,
    }, chatInput(setup))).rejects.toThrow("did not respond within 1ms");
  });
});

function readySetup() {
  return buildLocalDeepResearchSetupContract({
    modelInstallState: "installed",
    runtimeInstalled: true,
    machineFacts: { platform: "darwin", arch: "arm64", memoryBytes: 32 * gib, memoryPressure: "normal" },
    now: () => new Date("2026-05-28T12:00:00.000Z"),
  });
}

function chatInput(setup: ReturnType<typeof readySetup>): LocalDeepResearchChatCompletionInput {
  return {
    setup,
    toolCallCount: 0,
    toolBudget: localDeepResearchToolBudgetState(resolveLocalDeepResearchRunBudget(undefined), 0),
    messages: [
      { role: "system", content: "system prompt" },
      { role: "user", content: "What changed?" },
    ],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
