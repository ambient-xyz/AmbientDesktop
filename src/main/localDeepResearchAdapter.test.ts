import { describe, expect, it, vi } from "vitest";
import {
  buildLocalDeepResearchSystemPrompt,
  executeLocalDeepResearchToolCall,
  parseLocalDeepResearchToolCall,
} from "./localDeepResearchAdapter";
import { buildLocalDeepResearchSetupContract } from "./localDeepResearchSetup";

const gib = 1024 ** 3;
const now = () => new Date("2026-05-28T12:00:00.000Z");

describe("Local Deep Research adapter", () => {
  it("builds a LiteResearcher system prompt from setup and provider snapshot", () => {
    const setup = buildLocalDeepResearchSetupContract({
      now,
      machineFacts: { platform: "darwin", arch: "arm64", memoryBytes: 32 * gib, memoryPressure: "normal" },
    });

    const prompt = buildLocalDeepResearchSystemPrompt({ setup, maxToolCalls: 6 });

    expect(prompt).toContain("Ambient Local Deep Research");
    expect(prompt).toContain("Search provider order: exa-mcp-default -> ambient-browser");
    expect(prompt).toContain("Visit provider order: scrapling-mcp-default -> exa-mcp-default -> ambient-browser");
    expect(prompt).toContain('"name":"search"');
    expect(prompt).toContain("<tool_call>");
    expect(prompt).toContain("<answer>...</answer>");
    expect(prompt).toContain("Tool budget: 6 calls.");
    expect(prompt).toContain("Sources line containing the exact citation URLs");
  });

  it("parses raw search JSON tool calls", () => {
    const parsed = parseLocalDeepResearchToolCall('{"name":"search","arguments":{"query":"local LLM research agents","maxResults":50}}');

    expect(parsed).toMatchObject({
      status: "tool-call",
      call: {
        name: "search",
        arguments: {
          query: "local LLM research agents",
          maxResults: 20,
        },
      },
    });
  });

  it("parses OpenAI-style function tool calls with string arguments", () => {
    const parsed = parseLocalDeepResearchToolCall(JSON.stringify({
      tool_calls: [{
        id: "call_1",
        function: {
          name: "visit",
          arguments: JSON.stringify({ url: "https://example.com/report", maxCharacters: 250_000 }),
        },
      }],
    }));

    expect(parsed).toMatchObject({
      status: "tool-call",
      call: {
        id: "call_1",
        name: "visit",
        arguments: {
          url: "https://example.com/report",
          maxCharacters: 80_000,
        },
      },
    });
  });

  it("parses fenced and tagged visit tool calls", () => {
    const parsed = parseLocalDeepResearchToolCall([
      "<tool_call>",
      "```json",
      '{"tool":"fetch","input":{"url":"https://example.com/a?b=1"}}',
      "```",
      "</tool_call>",
    ].join("\n"));

    expect(parsed).toMatchObject({
      status: "tool-call",
      call: {
        name: "visit",
        arguments: { url: "https://example.com/a?b=1" },
      },
    });
  });

  it("parses the first balanced JSON tool call when the local model appends scratch text", () => {
    const parsed = parseLocalDeepResearchToolCall([
      '{"name": "search", "arguments": {"query": "latest Node.js LTS release", "maxResults": 5}}',
      "</think>",
      "",
      '{"results":[{"title":"fabricated scratch text"}]}',
      "Now search again.",
      '{"name": "search", "arguments": {"query": "latest stable Python 3 release", "maxResults": 5}}',
    ].join("\n"));

    expect(parsed).toMatchObject({
      status: "tool-call",
      call: {
        name: "search",
        arguments: {
          query: "latest Node.js LTS release",
          maxResults: 5,
        },
      },
    });
  });

  it("ignores complete local thinking blocks before parsing tool calls", () => {
    const parsed = parseLocalDeepResearchToolCall([
      "<think>",
      "I should search first, but this scratch text is not a tool call.",
      "</think>",
      "",
      '{"name":"search","arguments":{"query":"LLM author style imitation","maxResults":5}}',
    ].join("\n"));

    expect(parsed).toMatchObject({
      status: "tool-call",
      call: {
        name: "search",
        arguments: {
          query: "LLM author style imitation",
          maxResults: 5,
        },
      },
    });
  });

  it("normalizes search query arrays emitted by GGUF chat templates", () => {
    const parsed = parseLocalDeepResearchToolCall(JSON.stringify({
      name: "search",
      arguments: {
        query: ["latest Node.js LTS release", "latest stable Python 3 release"],
        maxResults: 5,
      },
    }));

    expect(parsed).toMatchObject({
      status: "tool-call",
      call: {
        name: "search",
        arguments: {
          query: "latest Node.js LTS release latest stable Python 3 release",
          maxResults: 5,
        },
      },
    });
  });

  it("parses XML-ish tool call tags with JSON attributes", () => {
    const parsed = parseLocalDeepResearchToolCall('<tool_call name="visit" arguments={"url": "https://nodejs.org/en/about/releases.html", "maxCharacters": 12000}}>\n</tool_call>');

    expect(parsed).toMatchObject({
      status: "tool-call",
      call: {
        name: "visit",
        arguments: {
          url: "https://nodejs.org/en/about/releases.html",
          maxCharacters: 12000,
        },
      },
    });
  });

  it("repairs local-model object-literal and alias tool call shapes", () => {
    const search = parseLocalDeepResearchToolCall("{name: web_search, parameters: {search_query: 'latest Python stable release', max_results: '8'}}");
    expect(search).toMatchObject({
      status: "tool-call",
      call: {
        name: "search",
        arguments: {
          query: "latest Python stable release",
          maxResults: 8,
        },
      },
    });

    const visit = parseLocalDeepResearchToolCall("<tool_call name=fetch_url url=https://www.python.org/downloads/ max_characters=12000>");
    expect(visit).toMatchObject({
      status: "tool-call",
      call: {
        name: "visit",
        arguments: {
          url: "https://www.python.org/downloads/",
          maxCharacters: 12000,
        },
      },
    });
  });

  it("treats local final-answer wrappers as final text", () => {
    const parsed = parseLocalDeepResearchToolCall(JSON.stringify({
      name: "final_answer",
      arguments: {
        answer: "Node.js and Python differ in release cadence.\n\nSources: https://nodejs.org/en/about/previous-releases",
      },
    }));

    expect(parsed).toEqual({
      status: "final",
      text: "Node.js and Python differ in release cadence.\n\nSources: https://nodejs.org/en/about/previous-releases",
    });
  });

  it("extracts upstream answer blocks without exposing scratch thinking", () => {
    expect(parseLocalDeepResearchToolCall([
      "<think>",
      "I should now synthesize.",
      "</think>",
      "<answer>",
      "Use several clean samples, ask for style traits, then draft against those traits.",
      "",
      "Sources: https://example.com/style",
      "</answer>",
    ].join("\n"))).toEqual({
      status: "final",
      text: "Use several clean samples, ask for style traits, then draft against those traits.\n\nSources: https://example.com/style",
    });

    expect(parseLocalDeepResearchToolCall("<answer>Partial final answer")).toEqual({
      status: "final",
      text: "Partial final answer",
    });

    expect(parseLocalDeepResearchToolCall([
      "<think>",
      "A scratch example might look like <answer>...</answer>, but that is not the final.",
      "</think>",
      "",
      "<answer>Actual final answer.\n\nSources: https://example.com/style</answer>",
    ].join("\n"))).toEqual({
      status: "final",
      text: "Actual final answer.\n\nSources: https://example.com/style",
    });
  });

  it("returns final text when no tool call is present", () => {
    expect(parseLocalDeepResearchToolCall("The evidence supports option A.")).toEqual({
      status: "final",
      text: "The evidence supports option A.",
    });

    expect(parseLocalDeepResearchToolCall('The next step is not another "search"; the evidence is sufficient.')).toEqual({
      status: "final",
      text: 'The next step is not another "search"; the evidence is sufficient.',
    });

    expect(parseLocalDeepResearchToolCall("<think>\nDrafting the answer.\n</think>\n\nFinal synthesis.\n\nSources: https://example.com")).toEqual({
      status: "final",
      text: "Final synthesis.\n\nSources: https://example.com",
    });
  });

  it("rejects malformed or unsafe tool calls", () => {
    expect(parseLocalDeepResearchToolCall('{"name":"search","arguments":{}}')).toMatchObject({
      status: "invalid",
      error: "search requires a non-empty query string.",
    });
    expect(parseLocalDeepResearchToolCall('{"name":"visit","arguments":{"url":"file:///etc/passwd"}}')).toMatchObject({
      status: "invalid",
      error: "visit url must be an http or https URL.",
    });
    expect(parseLocalDeepResearchToolCall("<tool_call>{not-json}</tool_call>")).toMatchObject({
      status: "invalid",
    });
  });

  it("executes parsed calls through the injected Ambient broker boundary", async () => {
    const broker = {
      search: vi.fn(async () => ({
        text: "1. Result title - https://example.com",
        selectedProvider: "ambient-brave-search",
        attempts: [{ providerId: "ambient-brave-search", status: "succeeded" as const, tool: "ambient_cli:brave:search" }],
      })),
      visit: vi.fn(),
    };
    const parsed = parseLocalDeepResearchToolCall('{"name":"search","arguments":{"query":"Ambient Desktop"}}');
    if (parsed.status !== "tool-call") throw new Error("Expected tool call.");

    const execution = await executeLocalDeepResearchToolCall(parsed.call, broker);

    expect(broker.search).toHaveBeenCalledWith({ query: "Ambient Desktop" });
    expect(execution).toMatchObject({
      schemaVersion: "ambient-local-deep-research-tool-execution-v1",
      result: {
        selectedProvider: "ambient-brave-search",
      },
    });
    expect(execution.observation).toContain("<tool_response>");
    expect(execution.observation).toContain("Tool: search");
    expect(execution.observation).toContain("Provider: ambient-brave-search");
    expect(execution.observation).toContain("1. Result title");
  });

  it("keeps full broker output in the execution result while capping model-facing observations", async () => {
    const longText = "A".repeat(5_400);
    const broker = {
      search: vi.fn(async () => ({
        text: longText,
        selectedProvider: "exa-mcp-default",
        attempts: [{ providerId: "exa-mcp-default", status: "succeeded" as const, tool: "web_search_exa" }],
        textOutputPath: ".ambient/local-deep-research/tool-output/full-search.txt",
      })),
      visit: vi.fn(),
    };
    const parsed = parseLocalDeepResearchToolCall('{"name":"search","arguments":{"query":"long evidence"}}');
    if (parsed.status !== "tool-call") throw new Error("Expected tool call.");

    const execution = await executeLocalDeepResearchToolCall(parsed.call, broker);

    expect(execution.result.text).toHaveLength(5_400);
    expect(execution.observation).toContain("Local Deep Research observation truncated to 5000 of 5400 chars");
    expect(execution.observation).toContain(".ambient/local-deep-research/tool-output/full-search.txt");
    expect(execution.observation).not.toContain("A".repeat(5_200));
  });
});
