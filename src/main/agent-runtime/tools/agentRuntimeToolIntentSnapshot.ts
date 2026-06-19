import type { ToolIntentSnapshot } from "../../../shared/threadTypes";
import { redactSensitiveText } from "../agentRuntimeSecurityFacade";

export function buildToolIntentSnapshot(input: {
  toolCallId: string;
  toolName: string;
  rawInput: unknown;
  visibleInput: string;
  sourceUserMessageId?: string;
  turnGoal: string;
  assistantLeadIn: string;
}): ToolIntentSnapshot {
  const record = toolIntentInputRecord(input.rawInput, input.visibleInput);
  const declaredPurpose = toolIntentString(record, ["purpose"]);
  const targetSummary = toolIntentTargetSummary(input.toolName, record);
  const operationKind = toolIntentOperationKind(input.toolName, record, {
    declaredPurpose,
    assistantLeadIn: input.assistantLeadIn,
  });
  return {
    version: 1,
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    ...(input.sourceUserMessageId ? { sourceUserMessageId: input.sourceUserMessageId } : {}),
    ...(compactIntentText(input.turnGoal, 360) ? { turnGoal: compactIntentText(input.turnGoal, 360) } : {}),
    ...(declaredPurpose ? { declaredPurpose } : {}),
    ...(compactIntentText(input.assistantLeadIn, 360) ? { assistantLeadIn: compactIntentText(input.assistantLeadIn, 360) } : {}),
    operationKind,
    ...(targetSummary ? { targetSummary } : {}),
    materiality: toolIntentMateriality(operationKind, input.toolName),
    substituteAllowed: toolIntentSubstituteAllowed(operationKind, input.toolName),
    createdAt: new Date().toISOString(),
  };
}

function toolIntentInputRecord(rawInput: unknown, visibleInput: string): Record<string, unknown> {
  const rawRecord = objectRecord(rawInput);
  if (Object.keys(rawRecord).length > 0) return rawRecord;
  const trimmed = visibleInput.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return {};
  try {
    return objectRecord(JSON.parse(trimmed));
  } catch {
    return {};
  }
}

function toolIntentOperationKind(
  toolName: string,
  input: Record<string, unknown>,
  context: { declaredPurpose?: string; assistantLeadIn?: string },
): ToolIntentSnapshot["operationKind"] {
  const lower = toolName.toLowerCase();
  const purposeText = `${context.declaredPurpose ?? ""} ${context.assistantLeadIn ?? ""}`.toLowerCase();
  const hasUrl = Boolean(toolIntentString(input, ["url", "targetUrl", "target_url"]));
  const hasSearchWord = /(^|[_:-])search($|[_:-])/.test(lower);
  const hasFetchWord = /(^|[_:-])fetch($|[_:-])/.test(lower);
  if (lower === "web_research_fetch" || lower === "browser_content" || (hasUrl && hasFetchWord)) {
    return /\b(verify|confirm|validate|check|source|evidence|dig deeper|specific)\b/.test(purposeText)
      ? "verify_specific_source"
      : "fetch_known_url";
  }
  if (/\b(write|edit|apply|update|delete|create|install|register|start|stop|send)\b/.test(lower)) return "write_or_mutate";
  if (/\b(read|list|status|describe|inspect|fetch)\b/.test(lower)) return "read_context";
  if (lower === "web_research_search" || lower === "browser_search" || hasSearchWord) return "search";
  return "tool_execution";
}

function toolIntentTargetSummary(toolName: string, input: Record<string, unknown>): string | undefined {
  const url = toolIntentString(input, ["url", "targetUrl", "target_url"]);
  if (url) return compactIntentText(url, 240);
  const query = toolIntentString(input, ["query", "q"]);
  if (query) return `query: ${compactIntentText(query, 220)}`;
  const path = toolIntentString(input, ["path", "filePath", "outputPath"]);
  if (path) return `path: ${compactIntentText(path, 220)}`;
  const command = toolIntentString(input, ["command"]);
  if (command) return `command: ${compactIntentText(command, 220)}`;
  const methodId = toolIntentString(input, ["methodId"]);
  if (methodId) return `method: ${compactIntentText(methodId, 220)}`;
  const packageName = toolIntentString(input, ["packageName", "packageId"]);
  const packageCommand = toolIntentString(input, ["commandName", "command"]);
  if (packageName) return `package: ${compactIntentText([packageName, packageCommand].filter(Boolean).join(":"), 220)}`;
  return compactIntentText(toolName, 220);
}

function toolIntentMateriality(
  operationKind: ToolIntentSnapshot["operationKind"],
  toolName: string,
): ToolIntentSnapshot["materiality"] {
  if (operationKind === "verify_specific_source" || operationKind === "write_or_mutate") return "required_before_final_answer";
  if (operationKind === "fetch_known_url" && toolName === "web_research_fetch") return "required_before_final_answer";
  if (operationKind === "search" || operationKind === "fetch_known_url" || operationKind === "tool_execution") return "important";
  return "optional";
}

function toolIntentSubstituteAllowed(operationKind: ToolIntentSnapshot["operationKind"], toolName: string): boolean {
  if (operationKind === "write_or_mutate") return false;
  if (toolName === "web_research_fetch" || operationKind === "verify_specific_source") return true;
  return operationKind === "search" || operationKind === "fetch_known_url" || operationKind === "read_context";
}

function toolIntentString(input: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return compactIntentText(value, 500);
  }
  return undefined;
}

function compactIntentText(value: string | undefined, maxChars: number): string | undefined {
  const cleaned = redactSensitiveText(value?.replace(/\s+/g, " ").trim() ?? "");
  if (!cleaned) return undefined;
  return cleaned.length <= maxChars ? cleaned : `${cleaned.slice(0, Math.max(0, maxChars - 3))}...`;
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
