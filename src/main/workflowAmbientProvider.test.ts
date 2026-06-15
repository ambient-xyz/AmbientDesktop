import { describe, expect, it, vi } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../shared/ambientModels";
import { AmbientWorkflowRunProvider } from "./workflowAmbientProvider";
import type { WorkflowPiTextCallInput } from "./workflowPiTransport";

describe("AmbientWorkflowRunProvider", () => {
  it("calls Ambient chat completions and parses JSON output", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"summary":"ok"}' } }] }),
    }));
    const fetchImpl = fetchMock as unknown as typeof fetch;
    const provider = new AmbientWorkflowRunProvider({
      model: "ambient/large",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.test/v1",
      fetchImpl,
    });

    await expect(provider.call({ task: "summarize", input: { text: "hello" }, attempt: 1 })).resolves.toEqual({ summary: "ok" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://ambient.test/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer ambient-test-key" }),
      }),
    );
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody).toMatchObject({ model: AMBIENT_DEFAULT_MODEL, response_format: { type: "json_object" } });
    expect(requestBody.messages[0].content).toContain("outputContract or expectedOutput");
    expect(requestBody.messages[1].content).toContain("--- Workflow runtime Ambient call cache checkpoint: mutable suffix begins ---");
  });

  it("uses Pi transport by default with workflow thread session affinity", async () => {
    const textCallInputs: WorkflowPiTextCallInput[] = [];
    const constructorProgress: unknown[] = [];
    const callProgress: unknown[] = [];
    const textCall = vi.fn(async (input: WorkflowPiTextCallInput) => {
      textCallInputs.push(input);
      input.onProgress?.({
        stage: "streaming",
        outputChars: 16,
        thinkingChars: 2,
        elapsedMs: 500,
        idleElapsedMs: 0,
        idleTimeoutMs: 12_000,
      });
      return '{"summary":"ok"}';
    });
    const provider = new AmbientWorkflowRunProvider({
      model: "ambient/large",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.test/v1",
      textCall,
      workflowThreadId: "workflow-thread-1",
      idleTimeoutMs: 12_000,
      absoluteTimeoutMs: 120_000,
      onProgress: (progress) => constructorProgress.push(progress),
    });

    await expect(provider.call({ task: "summarize", input: { text: "hello" }, attempt: 1, onProgress: (progress) => callProgress.push(progress) })).resolves.toEqual({
      summary: "ok",
    });
    expect(textCall).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "ambient-test-key",
        baseUrl: "https://ambient.test/v1",
        model: "ambient/large",
        sessionId: "workflow-thread-1",
        reasoning: "low",
        responseFormat: { type: "json_object" },
        idleTimeoutMs: 12_000,
        absoluteTimeoutMs: 120_000,
      }),
    );
    expect(textCallInputs[0]?.systemPrompt).toContain("outputContract or expectedOutput");
    expect(textCallInputs[0]?.prompt).toContain("Task: summarize");
    expect(textCallInputs[0]?.prompt).toContain("--- Workflow runtime Ambient call cache checkpoint: mutable suffix begins ---");
    expect(constructorProgress).toEqual([expect.objectContaining({ stage: "streaming", outputChars: 16 })]);
    expect(callProgress).toEqual([expect.objectContaining({ stage: "streaming", outputChars: 16 })]);
  });

  it("prefers checkpoint workflow thread id over constructor session id", async () => {
    const textCallInputs: WorkflowPiTextCallInput[] = [];
    const textCall = vi.fn(async (input: WorkflowPiTextCallInput) => {
      textCallInputs.push(input);
      return '{"summary":"ok"}';
    });
    const provider = new AmbientWorkflowRunProvider({
      model: "ambient/large",
      apiKey: "ambient-test-key",
      textCall,
      workflowThreadId: "constructor-thread",
    });

    await provider.call({
      task: "summarize",
      input: {},
      attempt: 1,
      cacheCheckpoint: {
        id: "checkpoint-1",
        stage: "runtime_call",
        workflowThreadId: "checkpoint-thread",
        stablePrefixHash: "stable",
        stablePrefixChars: 10,
        stablePrefixEstimatedTokens: 3,
        mutableSuffixHash: "mutable",
        mutableSuffixChars: 10,
        mutableSuffixEstimatedTokens: 3,
        requestHash: "request",
        requestEstimatedTokens: 6,
        boundaryLabel: "Workflow runtime Ambient call cache checkpoint",
        createdAt: new Date().toISOString(),
      },
    });

    expect(textCallInputs[0]?.sessionId).toBe("checkpoint-thread");
  });

  it("can enforce elapsed absolute timeout through Pi transport when explicitly configured", async () => {
    const textCallInputs: WorkflowPiTextCallInput[] = [];
    const textCall = vi.fn(async (input: WorkflowPiTextCallInput) => {
      textCallInputs.push(input);
      return '{"summary":"ok"}';
    });
    const provider = new AmbientWorkflowRunProvider({
      model: "ambient/large",
      apiKey: "ambient-test-key",
      textCall,
      idleTimeoutMs: 12_000,
      absoluteTimeoutMs: 45_000,
      enforceAbsoluteTimeout: true,
    });

    await expect(provider.call({ task: "summarize", input: {}, attempt: 1 })).resolves.toEqual({ summary: "ok" });
    expect(textCallInputs[0]).toMatchObject({
      idleTimeoutMs: 12_000,
      absoluteTimeoutMs: 45_000,
      enforceAbsoluteTimeout: true,
    });
  });

  it("reports provider failures with response detail", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => "model unavailable",
    })) as unknown as typeof fetch;
    const provider = new AmbientWorkflowRunProvider({
      model: AMBIENT_DEFAULT_MODEL,
      apiKey: "ambient-test-key",
      fetchImpl,
    });

    await expect(provider.call({ task: "summarize", input: {}, attempt: 1 })).rejects.toThrow("model unavailable");
  });
});
