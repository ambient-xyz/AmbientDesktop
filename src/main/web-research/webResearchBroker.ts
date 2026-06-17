import { createMcpHttpClient, isMcpToolError, textFromMcpToolCallResult, type FetchLike } from "../mcp/mcpToolBridge";
import { materializeTextOutput, type MaterializedTextOutput } from "../tool-runtime/toolOutputArtifacts";
import { WEB_RESEARCH_PROVIDER_IDS } from "./webResearchProviderStack";

export const EXA_MCP_ENDPOINT = "https://mcp.exa.ai/mcp";
export const EXA_SEARCH_TOOL = "web_search_exa";
export const EXA_FETCH_TOOL = "web_fetch_exa";

const defaultExaTimeoutMs = 45_000;
const defaultExaPreviewChars = 12_000;

export interface WebResearchProviderAttempt {
  providerId: string;
  status: "succeeded" | "failed" | "skipped";
  tool?: string;
  durationMs?: number;
  reason?: string;
}

export interface ExaWebResearchCallInput {
  workspacePath: string;
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
  timeoutMs?: number;
  apiKey?: string;
}

export interface ExaWebSearchInput extends ExaWebResearchCallInput {
  query: string;
  maxResults?: number;
}

export interface ExaWebFetchInput extends ExaWebResearchCallInput {
  url: string;
  maxCharacters?: number;
}

export interface ExaWebResearchResult {
  providerId: string;
  tool: string;
  text: string;
  output: MaterializedTextOutput;
  durationMs: number;
}

export async function callExaWebSearch(input: ExaWebSearchInput): Promise<ExaWebResearchResult> {
  const startedAt = Date.now();
  const result = await callExaTool(
    EXA_SEARCH_TOOL,
    {
      query: input.query,
      ...(input.maxResults ? { numResults: Math.max(1, Math.min(20, Math.floor(input.maxResults))) } : {}),
    },
    input,
  );
  const output = await materializeTextOutput(input.workspacePath, {
    label: "exa-web-search",
    text: result,
    maxPreviewChars: defaultExaPreviewChars,
    extension: "txt",
  });
  return {
    providerId: WEB_RESEARCH_PROVIDER_IDS.exa,
    tool: EXA_SEARCH_TOOL,
    text: output.text,
    output,
    durationMs: Date.now() - startedAt,
  };
}

export async function callExaWebFetch(input: ExaWebFetchInput): Promise<ExaWebResearchResult> {
  const startedAt = Date.now();
  const result = await callExaTool(
    EXA_FETCH_TOOL,
    {
      urls: [input.url],
      ...(input.maxCharacters ? { maxCharacters: Math.max(1_000, Math.min(80_000, Math.floor(input.maxCharacters))) } : {}),
    },
    input,
  );
  const output = await materializeTextOutput(input.workspacePath, {
    label: "exa-web-fetch",
    text: result,
    maxPreviewChars: defaultExaPreviewChars,
    extension: "txt",
  });
  return {
    providerId: WEB_RESEARCH_PROVIDER_IDS.exa,
    tool: EXA_FETCH_TOOL,
    text: output.text,
    output,
    durationMs: Date.now() - startedAt,
  };
}

export function exaProviderHeaders(apiKey?: string): Record<string, string> | undefined {
  const trimmed = apiKey?.trim();
  if (!trimmed) return undefined;
  return { "x-api-key": trimmed };
}

export function isLikelyExaRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(?:429|rate.?limit|too many requests)\b/i.test(message);
}

async function callExaTool(
  toolName: typeof EXA_SEARCH_TOOL | typeof EXA_FETCH_TOOL,
  toolArguments: Record<string, unknown>,
  input: ExaWebResearchCallInput,
): Promise<string> {
  const client = createMcpHttpClient(EXA_MCP_ENDPOINT, {
    fetchImpl: input.fetchImpl ?? fetch,
    timeoutMs: Math.max(1, Math.floor(input.timeoutMs ?? defaultExaTimeoutMs)),
    allowRemote: true,
    headers: exaProviderHeaders(input.apiKey),
  });
  const result = await client.callTool(toolName, toolArguments, input.signal);
  const text = textFromMcpToolCallResult(result);
  if (isMcpToolError(result)) throw new Error(text || `Exa MCP tool ${toolName} returned an error.`);
  return text;
}
