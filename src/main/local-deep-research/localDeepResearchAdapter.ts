import type { WebResearchProviderAttempt } from "../webResearchBroker";
import type { LocalDeepResearchProviderSnapshot, LocalDeepResearchSetupContract } from "./localDeepResearchSetup";
import { parse as parseYaml } from "yaml";

export type LocalDeepResearchToolName = "search" | "visit";

export interface LocalDeepResearchSearchToolCall {
  id: string;
  name: "search";
  arguments: {
    query: string;
    maxResults?: number;
  };
}

export interface LocalDeepResearchVisitToolCall {
  id: string;
  name: "visit";
  arguments: {
    url: string;
    maxCharacters?: number;
  };
}

export type LocalDeepResearchToolCall = LocalDeepResearchSearchToolCall | LocalDeepResearchVisitToolCall;

export type LocalDeepResearchToolCallParseResult =
  | { status: "tool-call"; call: LocalDeepResearchToolCall; rawJson: unknown }
  | { status: "final"; text: string }
  | { status: "invalid"; error: string; rawText: string };

export interface LocalDeepResearchBrokerResult {
  text: string;
  selectedProvider?: string;
  attempts: WebResearchProviderAttempt[];
  textOutputPath?: string;
  metadata?: Record<string, unknown>;
}

export interface LocalDeepResearchBroker {
  search: (input: LocalDeepResearchSearchToolCall["arguments"]) => Promise<LocalDeepResearchBrokerResult> | LocalDeepResearchBrokerResult;
  visit: (input: LocalDeepResearchVisitToolCall["arguments"]) => Promise<LocalDeepResearchBrokerResult> | LocalDeepResearchBrokerResult;
}

export interface LocalDeepResearchToolExecution {
  schemaVersion: "ambient-local-deep-research-tool-execution-v1";
  call: LocalDeepResearchToolCall;
  result: LocalDeepResearchBrokerResult;
  observation: string;
}

const localDeepResearchSearchObservationChars = 5_000;
const localDeepResearchVisitObservationChars = 3_000;

export function buildLocalDeepResearchSystemPrompt(input: {
  setup: LocalDeepResearchSetupContract;
  providerSnapshot?: LocalDeepResearchProviderSnapshot;
  maxToolCalls?: number;
  finalSynthesisReserveTurns?: number;
}): string {
  const snapshot = input.providerSnapshot ?? input.setup.providerSnapshot;
  const finalSynthesisReserveTurns = Math.max(1, Math.floor(input.finalSynthesisReserveTurns ?? 3));
  return [
    "You are LiteResearcher running as Ambient Local Deep Research.",
    "Use only the provided tools for current public evidence. Do not invent search or scraping providers.",
    `Model profile: ${input.setup.modelInstall.selectedProfileId}; context tokens: ${input.setup.modelInstall.contextTokens}.`,
    `Search provider order: ${snapshot.searchOrder.length ? snapshot.searchOrder.join(" -> ") : "none"}.`,
    `Visit provider order: ${snapshot.fetchOrder.length ? snapshot.fetchOrder.join(" -> ") : "none"}.`,
    `Browser fallback: ${snapshot.fallbackPolicy.allowBrowserFallback ? "allowed" : "blocked"}.`,
    `Tool budget: ${Math.max(1, Math.floor(input.maxToolCalls ?? 12))} calls.`,
    `Final synthesis reserve: ${finalSynthesisReserveTurns} no-tools model turn(s) after evidence collection.`,
    "After each tool response, Ambient may include a <budget_state>{...}</budget_state> block with usedToolCalls and remainingToolCalls. Plan to answer before remainingToolCalls reaches 0; Ambient will close tools and force final synthesis when the evidence budget is exhausted.",
    "You may use <think>...</think> scratch, but every actionable response must include exactly one <tool_call>...</tool_call> or one <answer>...</answer> block.",
    "When you need web evidence, return exactly one <tool_call> JSON block and no answer.",
    'Search tool call shape: <tool_call>{"name":"search","arguments":{"query":"...","maxResults":5}}</tool_call>',
    'Visit tool call shape: <tool_call>{"name":"visit","arguments":{"url":"https://...","maxCharacters":12000}}</tool_call>',
    "When you have enough evidence, answer with <answer>...</answer> containing a concise synthesis and a Sources line containing the exact citation URLs observed in search or visit results.",
    "Do not cite a URL unless it appeared in the provided tool evidence.",
  ].join("\n");
}

export function parseLocalDeepResearchToolCall(text: string): LocalDeepResearchToolCallParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { status: "invalid", error: "LiteResearcher returned an empty message.", rawText: text };
  const visibleText = stripLocalThinkingBlocks(trimmed);
  const answerText = localDeepResearchAnswerText(visibleText);
  if (answerText !== undefined) return { status: "final", text: answerText };
  const candidateText = visibleText || trimmed;
  const candidates = jsonCandidates(candidateText);
  for (const candidate of candidates) {
    const parsed = parseJson(candidate);
    if (parsed.ok) {
      const normalized = normalizeToolCall(parsed.value);
      if (normalized.status === "tool-call") return { ...normalized, rawJson: parsed.value };
      if (normalized.status === "final") return { status: "final", text: normalized.text };
      if (normalized.status === "invalid") return { status: "invalid", error: normalized.error, rawText: text };
    }
  }
  if (looksLikeToolCall(candidateText)) {
    return { status: "invalid", error: "LiteResearcher returned a malformed or unsupported tool call.", rawText: text };
  }
  return { status: "final", text: candidateText.trim() };
}

export async function executeLocalDeepResearchToolCall(
  call: LocalDeepResearchToolCall,
  broker: LocalDeepResearchBroker,
): Promise<LocalDeepResearchToolExecution> {
  const result = call.name === "search"
    ? await broker.search(call.arguments)
    : await broker.visit(call.arguments);
  return {
    schemaVersion: "ambient-local-deep-research-tool-execution-v1",
    call,
    result,
    observation: localDeepResearchToolObservation(call, result),
  };
}

export function localDeepResearchToolObservation(
  call: LocalDeepResearchToolCall,
  result: LocalDeepResearchBrokerResult,
): string {
  const provider = result.selectedProvider ? `Provider: ${result.selectedProvider}\n` : "";
  const attempts = result.attempts.length
    ? `Attempts:\n${result.attempts.map((attempt, index) => `${index + 1}. ${attempt.providerId}: ${attempt.status}${attempt.reason ? ` - ${attempt.reason}` : ""}`).join("\n")}\n`
    : "";
  const preview = localDeepResearchEvidencePreview(call, result);
  return [
    "<tool_response>",
    `Tool: ${call.name}`,
    `Tool call id: ${call.id}`,
    provider.trimEnd(),
    attempts.trimEnd(),
    "Text:",
    preview,
    "</tool_response>",
  ].filter((line) => line !== "").join("\n");
}

function localDeepResearchEvidencePreview(
  call: LocalDeepResearchToolCall,
  result: LocalDeepResearchBrokerResult,
): string {
  const text = result.text.trim();
  const maxChars = call.name === "search" ? localDeepResearchSearchObservationChars : localDeepResearchVisitObservationChars;
  if (text.length <= maxChars) return text;
  const artifactPath = result.textOutputPath ?? stringValue(objectRecord(result.metadata?.textOutput).artifactPath);
  return [
    `${text.slice(0, maxChars).trimEnd()}`,
    "",
    `[Local Deep Research observation truncated to ${maxChars} of ${text.length} chars to preserve local model context.${artifactPath ? ` Full tool output artifact: ${artifactPath}.` : ""}]`,
  ].join("\n");
}

function normalizeToolCall(value: unknown): { status: "tool-call"; call: LocalDeepResearchToolCall } | { status: "final"; text: string } | { status: "invalid"; error: string } | { status: "none" } {
  if (Array.isArray(value) && value.length) return normalizeToolCall(value[0]);
  const record = objectRecord(value);
  const toolCalls = Array.isArray(record.tool_calls) ? record.tool_calls : undefined;
  if (toolCalls?.length) return normalizeToolCall(toolCalls[0]);
  const functionRecord = objectRecord(record.function);
  const rawName = stringValue(record.name)
    ?? stringValue(record.tool)
    ?? stringValue(record.action)
    ?? stringValue(record.tool_name)
    ?? stringValue(record.toolName)
    ?? stringValue(functionRecord.name);
  const args = argumentsRecord(record.arguments ?? record.args ?? record.input ?? record.parameters ?? record.kwargs ?? functionRecord.arguments ?? record);
  const finalText = finalAnswerText(record, args);
  if (isFinalToolName(rawName)) {
    return finalText ? { status: "final", text: finalText } : { status: "invalid", error: "final answer tool call requires non-empty answer text." };
  }
  const name = toolName(rawName);
  if (!name) {
    if (finalText) return { status: "final", text: finalText };
    return { status: "none" };
  }
  if (name === "search") {
    const query = searchQueryValue(args.query)
      ?? searchQueryValue(args.q)
      ?? searchQueryValue(args.search_query)
      ?? searchQueryValue(args.searchQuery)
      ?? searchQueryValue(args.queries)
      ?? searchQueryValue(args.keywords)
      ?? searchQueryValue(args.term);
    if (!query) return { status: "invalid", error: "search requires a non-empty query string." };
    return {
      status: "tool-call",
      call: {
        id: stringValue(record.id) ?? stableToolCallId("search", query),
        name,
        arguments: {
          query,
          ...boundedIntegerField(args.maxResults ?? args.max_results ?? args.limit ?? args.count ?? args.numResults ?? args.num_results, "maxResults", 1, 20),
        },
      },
    };
  }
  const url = stringValue(args.url)
    ?? stringValue(args.href)
    ?? stringValue(args.link)
    ?? stringValue(args.uri)
    ?? stringValue(args.target)
    ?? stringValue(args.page_url)
    ?? stringValue(args.pageUrl)
    ?? firstStringValue(args.urls);
  if (!url) return { status: "invalid", error: "visit requires a non-empty url string." };
  const normalizedUrl = normalizeVisitUrl(url);
  if (!normalizedUrl) return { status: "invalid", error: "visit url must be an http or https URL." };
  return {
    status: "tool-call",
    call: {
      id: stringValue(record.id) ?? stableToolCallId("visit", normalizedUrl),
      name,
      arguments: {
        url: normalizedUrl,
        ...boundedIntegerField(args.maxCharacters ?? args.max_characters ?? args.maxChars ?? args.max_chars ?? args.limit ?? args.max_length, "maxCharacters", 1_000, 80_000),
      },
    },
  };
}

function jsonCandidates(text: string): string[] {
  const candidates: string[] = [];
  const toolBlocks = [...text.matchAll(/<tool_call>([\s\S]*?)<\/tool_call>/gi)].map((match) => match[1]?.trim()).filter(Boolean) as string[];
  candidates.push(...toolBlocks);
  candidates.push(...taggedAttributeToolCallCandidates(text));
  const fencedBlocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((match) => match[1]?.trim()).filter(Boolean) as string[];
  candidates.push(...fencedBlocks);
  candidates.push(...balancedJsonObjectCandidates(text));
  candidates.push(text);
  const firstObject = text.indexOf("{");
  const lastObject = text.lastIndexOf("}");
  if (firstObject >= 0 && lastObject > firstObject) candidates.push(text.slice(firstObject, lastObject + 1));
  return [...new Set(candidates)];
}

function taggedAttributeToolCallCandidates(text: string): string[] {
  return [...text.matchAll(/<tool_call\b([^>]*)>/gi)].flatMap((match) => {
    const attributes = match[1] ?? "";
    const name = attributes.match(/\bname\s*=\s*["']?([a-z_.-]+)["']?/i)?.[1]
      ?? attributes.match(/\btool\s*=\s*["']?([a-z_.-]+)["']?/i)?.[1];
    const argsJson = balancedJsonObjectCandidates(attributes)[0];
    if (!name) return [];
    if (argsJson) return [`{"name":${JSON.stringify(name)},"arguments":${argsJson}}`];
    const args: Record<string, string | number> = {};
    for (const key of ["query", "q", "url", "href", "maxResults", "max_results", "maxCharacters", "max_characters"]) {
      const value = attributes.match(new RegExp(`\\b${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
      const raw = value?.[1] ?? value?.[2] ?? value?.[3];
      if (!raw) continue;
      const numeric = Number(raw);
      args[key] = Number.isFinite(numeric) && /^\d+$/.test(raw) ? numeric : raw;
    }
    return [JSON.stringify({ name, arguments: args })];
  });
}

function balancedJsonObjectCandidates(text: string): string[] {
  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char !== "}" || depth === 0) continue;
    depth -= 1;
    if (depth === 0 && start >= 0) {
      candidates.push(text.slice(start, index + 1));
      start = -1;
    }
  }
  return candidates;
}

function parseJson(value: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    try {
      const parsed = parseYaml(value);
      return parsed === undefined ? { ok: false } : { ok: true, value: parsed };
    } catch {
      return { ok: false };
    }
  }
}

function argumentsRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    const parsed = parseJson(value);
    return parsed.ok ? objectRecord(parsed.value) : {};
  }
  return objectRecord(value);
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstStringValue(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const item of value) {
    const text = stringValue(item);
    if (text) return text;
  }
  return undefined;
}

function searchQueryValue(value: unknown): string | undefined {
  const direct = stringValue(value);
  if (direct) return direct;
  if (!Array.isArray(value)) return undefined;
  const parts = value.map((item) => stringValue(item)).filter((item): item is string => Boolean(item));
  return parts.length ? parts.join(" ") : undefined;
}

function toolName(value: string | undefined): LocalDeepResearchToolName | undefined {
  const normalized = value?.trim().toLowerCase().replace(/[\s.-]+/g, "_");
  if (!normalized) return undefined;
  if ([
    "search",
    "web_search",
    "search_web",
    "internet_search",
    "web_research_search",
    "browser_search",
  ].includes(normalized)) return "search";
  if ([
    "visit",
    "fetch",
    "browse",
    "open",
    "open_url",
    "visit_url",
    "fetch_url",
    "read_url",
    "web_fetch",
    "web_research_fetch",
    "browser_fetch",
    "scrape",
    "scrape_url",
    "crawl",
  ].includes(normalized)) return "visit";
  return undefined;
}

function isFinalToolName(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase().replace(/[\s.-]+/g, "_");
  return Boolean(normalized && [
    "final",
    "answer",
    "final_answer",
    "final_response",
    "respond",
    "finish",
  ].includes(normalized));
}

function finalAnswerText(record: Record<string, unknown>, args: Record<string, unknown>): string | undefined {
  return stringValue(args.answer)
    ?? stringValue(args.final)
    ?? stringValue(args.finalAnswer)
    ?? stringValue(args.final_answer)
    ?? stringValue(args.response)
    ?? stringValue(args.text)
    ?? stringValue(args.content)
    ?? stringValue(record.answer)
    ?? stringValue(record.final)
    ?? stringValue(record.finalAnswer)
    ?? stringValue(record.final_answer)
    ?? stringValue(record.response)
    ?? stringValue(record.text)
    ?? stringValue(record.content);
}

function boundedIntegerField(
  value: unknown,
  key: "maxResults" | "maxCharacters",
  minimum: number,
  maximum: number,
): Partial<Record<typeof key, number>> {
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() ? Number(value.trim()) : undefined;
  if (typeof numeric !== "number" || !Number.isFinite(numeric)) return {};
  return { [key]: Math.max(minimum, Math.min(maximum, Math.floor(numeric))) } as Partial<Record<typeof key, number>>;
}

function normalizeVisitUrl(value: string): string | undefined {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function stableToolCallId(name: LocalDeepResearchToolName, value: string): string {
  let hash = 0;
  for (const char of `${name}:${value}`) hash = (Math.imul(31, hash) + char.charCodeAt(0)) | 0;
  return `ldr-${name}-${Math.abs(hash).toString(36)}`;
}

function stripLocalThinkingBlocks(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function localDeepResearchAnswerText(text: string): string | undefined {
  const complete = text.match(/<answer\b[^>]*>([\s\S]*?)<\/answer>/i);
  if (complete) return stripLocalThinkingBlocks(complete[1] ?? "").trim();
  const open = text.match(/<answer\b[^>]*>/i);
  if (!open || open.index === undefined) return undefined;
  return stripLocalThinkingBlocks(text.slice(open.index + open[0].length)).replace(/<\/answer>/gi, "").trim();
}

function looksLikeToolCall(text: string): boolean {
  return /<tool_call|tool_calls|[{,]\s*["']?(?:name|tool|action|tool_name|function)["']?\s*:|(?:^|\n)\s*(?:search|visit|fetch)\s*\(/i.test(text);
}
