import { describe, expect, it, vi } from "vitest";
import { runLocalDeepResearch, type LocalDeepResearchChatClient } from "./localDeepResearchRunner";
import { buildLocalDeepResearchSetupContract } from "./localDeepResearchSetup";
import type { LocalDeepResearchBroker } from "./localDeepResearchAdapter";

const gib = 1024 ** 3;
const fixedNow = () => new Date("2026-05-28T12:00:00.000Z");

describe("Local Deep Research runner", () => {
  it("blocks before model/runtime/provider setup is ready", async () => {
    const setup = buildLocalDeepResearchSetupContract({
      now: fixedNow,
      machineFacts: { platform: "darwin", arch: "arm64", memoryBytes: 32 * gib, memoryPressure: "normal" },
    });

    const result = await runLocalDeepResearch({
      question: "What changed?",
      setup,
      chat: chatSequence(["unused"]),
      broker: brokerFixture(),
    });

    expect(result).toMatchObject({
      schemaVersion: "ambient-local-deep-research-run-v1",
      status: "blocked",
      setupStatus: "needs-install",
      modelProfileId: "literesearcher-4b-q4-k-m",
    });
    expect(result.error).toContain("setup is not ready");
  });

  it("returns a final answer when the model does not request tools", async () => {
    const setup = readySetup();

    const result = await runLocalDeepResearch({
      question: "Summarize the known facts.",
      setup,
      chat: chatSequence(["Final synthesis without live evidence is allowed when no citations are claimed."]),
      broker: brokerFixture(),
    });

    expect(result).toMatchObject({
      status: "completed",
      finalText: "Final synthesis without live evidence is allowed when no citations are claimed.",
      toolExecutions: [],
      citationValidation: {
        status: "skipped",
      },
    });
    expect(result.messages.map((message) => message.role)).toEqual(["system", "user", "assistant"]);
  });

  it("runs search and visit calls through the broker before final synthesis", async () => {
    const setup = readySetup();
    const broker = brokerFixture();

    const result = await runLocalDeepResearch({
      question: "Compare current local research agent options.",
      setup,
      chat: chatSequence([
        '<tool_call>{"name":"search","arguments":{"query":"local deep research agent LiteResearcher","maxResults":3}}</tool_call>',
        '<tool_call>{"name":"visit","arguments":{"url":"https://example.com/literesearcher"}}</tool_call>',
        "<answer>LiteResearcher is the selected local candidate.\n\nSources: https://example.com/literesearcher</answer>",
      ]),
      broker,
      maxToolCalls: 4,
    });

    expect(result.status).toBe("completed");
    expect(broker.search).toHaveBeenCalledWith({ query: "local deep research agent LiteResearcher", maxResults: 3 });
    expect(broker.visit).toHaveBeenCalledWith({ url: "https://example.com/literesearcher" });
    expect(result.toolExecutions).toHaveLength(2);
    expect(result.messages.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(result.messages[3]?.content).toContain("<tool_response>");
    expect(result.messages[3]?.content).toContain("Tool: search");
    expect(result.messages[5]?.content).toContain("<tool_response>");
    expect(result.messages[5]?.content).toContain("Tool: visit");
    expect(result.citationValidation).toMatchObject({
      status: "passed",
      citationUrls: ["https://example.com/literesearcher"],
      unobservedCitationUrls: [],
      hasSourcesLine: true,
    });
  });

  it("rejects final citations that were not observed in successful tool evidence", async () => {
    const setup = readySetup();

    const result = await runLocalDeepResearch({
      question: "Find sources.",
      setup,
      chat: chatSequence([
        '{"name":"search","arguments":{"query":"local deep research agent LiteResearcher","maxResults":3}}',
        "Unsupported final answer.\n\nSources: https://example.com/not-observed",
      ]),
      broker: brokerFixture(),
      maxToolCalls: 4,
      maxTurns: 2,
    });

    expect(result).toMatchObject({
      status: "citation-validation-failed",
      error: expect.stringContaining("not observed"),
      citationValidation: {
        status: "failed",
        unobservedCitationUrls: ["https://example.com/not-observed"],
      },
    });
  });

  it("deterministically adds a Sources line when a final answer cites gathered evidence inline", async () => {
    const setup = readySetup();

    const result = await runLocalDeepResearch({
      question: "Find sources.",
      setup,
      chat: chatSequence([
        '{"name":"visit","arguments":{"url":"https://example.com/literesearcher"}}',
        "LiteResearcher is cited inline at https://example.com/literesearcher.",
      ]),
      broker: brokerFixture(),
      maxToolCalls: 4,
      maxTurns: 2,
    });

    expect(result).toMatchObject({
      status: "completed",
      finalText: "LiteResearcher is cited inline at https://example.com/literesearcher.\n\nSources: https://example.com/literesearcher",
      citationValidation: {
        status: "passed",
        hasSourcesLine: true,
      },
    });
  });

  it("deterministically adds observed citation URLs when the final answer omits sources", async () => {
    const setup = readySetup();

    const result = await runLocalDeepResearch({
      question: "Find sources.",
      setup,
      chat: chatSequence([
        '<tool_call>{"name":"visit","arguments":{"url":"https://example.com/literesearcher"}}</tool_call>',
        "LiteResearcher is the selected local candidate.",
        "<answer>LiteResearcher is the selected local candidate.\n\nSources: https://example.com/literesearcher</answer>",
      ]),
      broker: brokerFixture(),
      maxToolCalls: 4,
      maxTurns: 4,
    });

    expect(result).toMatchObject({
      status: "completed",
      finalText: "LiteResearcher is the selected local candidate.\n\nSources: https://example.com/literesearcher",
      citationValidation: {
        status: "passed",
      },
    });
    expect(result.messages.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(result.finalAnswerDrafts).toEqual([
      expect.objectContaining({
        text: "LiteResearcher is the selected local candidate.",
        citationValidation: expect.objectContaining({ status: "failed" }),
      }),
    ]);
  });

  it("recovers when LiteResearcher attempts another tool call after final-answer repair", async () => {
    const setup = readySetup();
    const broker = brokerFixture();

    const result = await runLocalDeepResearch({
      question: "Find sources.",
      setup,
      chat: chatSequence([
        '<tool_call>{"name":"visit","arguments":{"url":"https://example.com/literesearcher"}}</tool_call>',
        "<think>\nI should answer now.",
        '<tool_call>{"name":"visit","arguments":{"url":"https://example.com/extra"}}</tool_call>',
        '<tool_call>{"name":"visit","arguments":{"url":"https://example.com/extra"}}</tool_call>',
        "Recovered final synthesis.\n\nSources: https://example.com/literesearcher",
      ]),
      broker,
      maxToolCalls: 4,
      maxTurns: 5,
    });

    expect(result).toMatchObject({
      status: "completed",
      finalText: "Recovered final synthesis.\n\nSources: https://example.com/literesearcher",
      citationValidation: { status: "passed" },
    });
    expect(broker.visit).toHaveBeenCalledTimes(1);
    expect(result.toolExecutions).toHaveLength(1);
    expect(result.messages.some((message) => message.content.includes("no-tools final synthesis pass"))).toBe(true);
  });

  it("completes a missing Sources line with observed URLs after the model fails citation repair", async () => {
    const setup = readySetup();

    const result = await runLocalDeepResearch({
      question: "Find sources.",
      setup,
      chat: chatSequence([
        '<tool_call>{"name":"visit","arguments":{"url":"https://example.com/literesearcher"}}</tool_call>',
        "LiteResearcher is the selected local candidate.",
        "<answer>LiteResearcher is the selected local candidate.</answer>",
      ]),
      broker: brokerFixture(),
      maxToolCalls: 4,
      maxTurns: 4,
    });

    expect(result).toMatchObject({
      status: "completed",
      finalText: "LiteResearcher is the selected local candidate.\n\nSources: https://example.com/literesearcher",
      citationValidation: {
        status: "passed",
      },
    });
  });

  it("stops on invalid tool calls with trace context preserved", async () => {
    const setup = readySetup();

    const result = await runLocalDeepResearch({
      question: "Find sources.",
      setup,
      chat: chatSequence(['{"name":"visit","arguments":{"url":"file:///private"}}']),
      broker: brokerFixture(),
    });

    expect(result).toMatchObject({
      status: "invalid-tool-call",
      error: "visit url must be an http or https URL.",
    });
    expect(result.messages.map((message) => message.role)).toEqual(["system", "user", "assistant"]);
  });

  it("enforces the tool budget before executing another broker call", async () => {
    const setup = readySetup();
    const broker = brokerFixture();

    const result = await runLocalDeepResearch({
      question: "Find sources.",
      setup,
      chat: chatSequence([
        '{"name":"search","arguments":{"query":"one"}}',
        '{"name":"search","arguments":{"query":"two"}}',
      ]),
      broker,
      maxToolCalls: 1,
    });

    expect(result.status).toBe("tool-budget-exceeded");
    expect(result.toolExecutions).toHaveLength(1);
    expect(broker.search).toHaveBeenCalledTimes(1);
  });

  it("asks once for a clean final answer when LiteResearcher returns scratch thinking as final output", async () => {
    const setup = readySetup();

    const result = await runLocalDeepResearch({
      question: "Find sources.",
      setup,
      chat: chatSequence([
        '<tool_call>{"name":"search","arguments":{"query":"local deep research agent LiteResearcher","maxResults":3}}</tool_call>',
        "<think>\nWe have one relevant source and should answer now.",
        "<answer>LiteResearcher evidence was gathered successfully.\n\nSources: https://example.com/literesearcher</answer>",
      ]),
      broker: brokerFixture(),
      maxToolCalls: 4,
      maxTurns: 4,
    });

    expect(result).toMatchObject({
      status: "completed",
      finalText: "LiteResearcher evidence was gathered successfully.\n\nSources: https://example.com/literesearcher",
      citationValidation: {
        status: "passed",
      },
    });
    expect(result.finalText).not.toContain("<think>");
    expect(result.messages.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(result.messages[5]?.content).toContain("no-tools final synthesis pass");
    expect(result.messages[5]?.content).toContain("https://example.com/literesearcher");
  });

  it("does not expose scratch thinking when no evidence-backed final synthesis is available", async () => {
    const setup = readySetup();

    const result = await runLocalDeepResearch({
      question: "Find sources.",
      setup,
      chat: chatSequence([
        "<think>\nWe have one relevant source and should answer now.",
      ]),
      broker: brokerFixture(),
      maxToolCalls: 4,
      maxTurns: 1,
    });

    expect(result).toMatchObject({
      status: "invalid-final-answer",
      error: "LiteResearcher returned scratch reasoning instead of a user-facing final answer.",
    });
    expect(result.finalText).toBeUndefined();
  });

  it("can defer final synthesis and return an evidence packet", async () => {
    const setup = readySetup();

    const result = await runLocalDeepResearch({
      question: "Find sources.",
      setup,
      chat: chatSequence([
        '<tool_call>{"name":"visit","arguments":{"url":"https://example.com/literesearcher"}}</tool_call>',
        "<answer>LiteResearcher is the selected local candidate.\n\nSources: https://example.com/literesearcher</answer>",
      ]),
      broker: brokerFixture(),
      maxToolCalls: 4,
      finalSynthesis: { mode: "evidence_only" },
    });

    expect(result).toMatchObject({
      status: "synthesis-deferred",
      finalSynthesis: { mode: "evidence_only" },
      citationValidation: { status: "passed" },
    });
    expect(result.finalText).toContain("# Local Deep Research Evidence Packet");
    expect(result.finalText).toContain("https://example.com/literesearcher");
    expect(result.finalText).toContain("LiteResearcher is the selected local candidate.");
  });
});

function readySetup() {
  return buildLocalDeepResearchSetupContract({
    now: fixedNow,
    modelInstallState: "installed",
    runtimeInstalled: true,
    machineFacts: { platform: "darwin", arch: "arm64", memoryBytes: 32 * gib, memoryPressure: "normal" },
  });
}

function chatSequence(contents: string[]): LocalDeepResearchChatClient {
  const queue = [...contents];
  return {
    complete: vi.fn(async () => ({ content: queue.shift() ?? "No more messages." })),
  };
}

function brokerFixture(): LocalDeepResearchBroker {
  return {
    search: vi.fn(async (input) => ({
      text: `Search result for ${input.query}: https://example.com/literesearcher`,
      selectedProvider: "exa-mcp-default",
      attempts: [{ providerId: "exa-mcp-default", status: "succeeded" as const, tool: "web_search_exa" }],
    })),
    visit: vi.fn(async (input) => ({
      text: `Fetched ${input.url}: source details`,
      selectedProvider: "scrapling-mcp-default",
      attempts: [{ providerId: "scrapling-mcp-default", status: "succeeded" as const, tool: "scrapling" }],
    })),
  };
}
