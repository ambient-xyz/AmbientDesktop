import type { AgentToolResult, AgentToolUpdateCallback, ExtensionAPI, ExtensionFactory, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { validateToolArguments } from "@mariozechner/pi-ai";
import type { ToolLargeOutputPreview, ToolLargeOutputPreviewItem } from "../../shared/threadTypes";
import { materializeTextOutput, materializedTextNotice, type MaterializedTextOutput } from "./toolOutputArtifacts";

export const DEFAULT_TOOL_RESULT_TEXT_PREVIEW_CHARS = 64_000;
const MAX_TOOL_RESULT_TEXT_NOTICES = 8;
const MAX_INVALID_TOOL_ARGUMENTS_PREVIEW_CHARS = 4_096;
const MAX_INVALID_TOOL_ARGUMENT_STRING_CHARS = 512;

export interface ToolResultMaterializationOptions {
  workspacePath: string;
  maxPreviewChars?: number;
  artifactLabelPrefix?: string;
}

interface TextContentItem {
  type: string;
  text?: string;
  [key: string]: unknown;
}

interface MaterializedToolTextOutput extends MaterializedTextOutput {
  label: string;
}

export function materializeToolResultExtensionFactory(
  factory: ExtensionFactory,
  options: ToolResultMaterializationOptions,
): ExtensionFactory {
  return (pi) => {
    const materializedToolNames = new Set<string>();
    const wrappedPi = Object.create(pi) as ExtensionAPI;
    wrappedPi.registerTool = (tool) => {
      materializedToolNames.add(tool.name);
      pi.registerTool(materializeToolDefinition(tool, options));
    };
    const result = factory(wrappedPi);
    const on = (pi as any).on;
    if (typeof on === "function") {
      on.call(pi, "tool_result", (event: any) => {
        if (!materializedToolNames.has(event.toolName)) return undefined;
        return materializedToolResultIsError(event.details) ? { isError: true } : undefined;
      });
    }
    return result;
  };
}

export function materializeToolResultFinalizerExtensionFactory(
  options: ToolResultMaterializationOptions,
): ExtensionFactory {
  return (pi) => {
    const on = (pi as any).on;
    if (typeof on !== "function") return;
    on.call(pi, "tool_result", (event: any) => materializeToolResultEvent(event, options));
  };
}

export function materializeToolDefinitions<T extends ToolDefinition<any, any, any>>(
  tools: readonly T[],
  options: ToolResultMaterializationOptions,
): T[] {
  return tools.map((tool) => materializeToolDefinition(tool, options));
}

export function materializeToolDefinition<T extends ToolDefinition<any, any, any>>(
  tool: T,
  options: ToolResultMaterializationOptions,
): T {
  if (typeof tool.execute !== "function") return tool;
  const execute = tool.execute;
  const prepareArguments = tool.prepareArguments;
  return {
    ...tool,
    prepareArguments: (args) => {
      const preparedArgs = prepareArguments ? prepareArguments(args) : args;
      return capInvalidToolArgumentsForValidation(tool, preparedArgs, options);
    },
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      let updateChain = Promise.resolve();
      const wrappedOnUpdate: AgentToolUpdateCallback<any> | undefined = onUpdate
        ? (update) => {
            updateChain = updateChain.then(async () => {
              let nextUpdate = update;
              try {
                nextUpdate = await materializeToolResultTextContent(update, {
                  ...options,
                  artifactLabelPrefix: options.artifactLabelPrefix ?? tool.name,
                });
              } catch {
                nextUpdate = update;
              }
              try {
                onUpdate(nextUpdate);
              } catch {
                // Update callbacks are best-effort progress delivery; preserve the tool result path.
              }
            });
          }
        : undefined;
      let result: AgentToolResult<any>;
      try {
        result = await execute(toolCallId, params, signal, wrappedOnUpdate, ctx);
      } catch (error) {
        await updateChain.catch(() => undefined);
        return materializeToolExecutionErrorResult(tool.name, error, options);
      }
      await updateChain;
      const materializedResult = await materializeToolResultTextContent(result, {
        ...options,
        artifactLabelPrefix: options.artifactLabelPrefix ?? tool.name,
      });
      if (toolResultIsError(materializedResult)) return markMaterializedToolResultError(tool.name, materializedResult);
      return materializedResult;
    },
  };
}

function capInvalidToolArgumentsForValidation<T extends ToolDefinition<any, any, any>>(
  tool: T,
  args: unknown,
  options: ToolResultMaterializationOptions,
): unknown {
  try {
    validateToolArguments({ name: tool.name, parameters: tool.parameters } as any, {
      name: tool.name,
      arguments: args,
    } as any);
    return args;
  } catch (error) {
    const serialized = safeStringify(args);
    const maxPreviewChars = Math.max(1, Math.min(
      MAX_INVALID_TOOL_ARGUMENTS_PREVIEW_CHARS,
      Math.floor(options.maxPreviewChars ?? DEFAULT_TOOL_RESULT_TEXT_PREVIEW_CHARS),
    ));
    if (serialized.length <= maxPreviewChars) return args;
    const validationSummary = error instanceof Error
      ? error.message.split("\n\nReceived arguments:")[0]
      : `Validation failed for tool "${tool.name}".`;
    throw new Error([
      validationSummary,
      "",
      `Received arguments exceeded the validation preview budget (${serialized.length} chars).`,
      "Large invalid argument values were truncated before reporting this validation failure.",
      "",
      "Truncated argument preview:",
      safeStringify(truncateInvalidToolArgumentValues(args)).slice(0, maxPreviewChars),
    ].join("\n"));
  }
}

function truncateInvalidToolArgumentValues(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.length <= MAX_INVALID_TOOL_ARGUMENT_STRING_CHARS) return value;
    return `${value.slice(0, MAX_INVALID_TOOL_ARGUMENT_STRING_CHARS)}\n[truncated invalid tool argument string: ${MAX_INVALID_TOOL_ARGUMENT_STRING_CHARS} of ${value.length} chars]`;
  }
  if (Array.isArray(value)) return value.map(truncateInvalidToolArgumentValues);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, truncateInvalidToolArgumentValues(entry)]),
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function materializeToolExecutionErrorResult(
  toolName: string,
  error: unknown,
  options: ToolResultMaterializationOptions,
): Promise<AgentToolResult<Record<string, unknown>> & { isError: true }> {
  const errorText = error instanceof Error ? error.message : String(error);
  const materializedResult = await materializeToolResultTextContent({
    content: [{ type: "text", text: errorText }],
    details: {
      runtime: "tool-result-materializer",
      toolName,
      status: "error",
      errorName: error instanceof Error ? error.name : typeof error,
    },
    isError: true,
  }, {
    ...options,
    artifactLabelPrefix: options.artifactLabelPrefix ?? toolName,
  });
  return markMaterializedToolResultError(toolName, materializedResult) as AgentToolResult<Record<string, unknown>> & { isError: true };
}

async function materializeToolResultEvent(
  event: { toolName?: unknown; content?: unknown; details?: unknown; isError?: unknown },
  options: ToolResultMaterializationOptions,
): Promise<{ content?: unknown; details?: unknown; isError?: boolean } | undefined> {
  if (materializedToolResultIsError(event.details)) return { isError: true };
  if (materializedToolResultTextAlreadyProcessed(event.details)) return undefined;
  if (!Array.isArray(event.content)) return undefined;
  const toolName = typeof event.toolName === "string" && event.toolName.trim() ? event.toolName.trim() : "tool-result";
  const input = {
    content: event.content,
    details: event.details,
    ...(event.isError === true ? { isError: true } : {}),
  } as AgentToolResult<Record<string, unknown>>;
  const materializedResult = await materializeToolResultTextContent(input, {
    ...options,
    artifactLabelPrefix: options.artifactLabelPrefix ?? toolName,
  });
  const markedResult = toolResultIsError(materializedResult)
    ? markMaterializedToolResultError(toolName, materializedResult)
    : materializedResult;
  if (markedResult === input) return undefined;
  return {
    content: markedResult.content,
    details: markedResult.details,
    ...(materializedToolResultIsError(markedResult.details) ? { isError: true } : {}),
  };
}

function toolResultIsError(result: unknown): boolean {
  return (result as { isError?: unknown } | undefined)?.isError === true;
}

function markMaterializedToolResultError<T extends AgentToolResult<any>>(toolName: string, result: T): T {
  return {
    ...result,
    details: {
      ...resultDetailsRecord(result.details),
      toolResultMaterializer: {
        isError: true,
        toolName,
      },
    },
  };
}

function materializedToolResultIsError(details: unknown): boolean {
  const marker = resultDetailsRecord(details).toolResultMaterializer;
  return Boolean(marker && typeof marker === "object" && !Array.isArray(marker) && (marker as { isError?: unknown }).isError === true);
}

function materializedToolResultTextAlreadyProcessed(details: unknown): boolean {
  if (!details || typeof details !== "object" || Array.isArray(details)) return false;
  const record = resultDetailsRecord(details);
  if (Array.isArray(record.toolResultTextOutputs)) return true;
  return materializedToolResultTextAlreadyProcessed(record.resultDetails);
}

export async function materializeToolResultTextContent<T extends AgentToolResult<any>>(
  result: T,
  options: ToolResultMaterializationOptions,
): Promise<T> {
  if (!result || typeof result !== "object" || !Array.isArray(result.content)) return result;
  if (materializedToolResultTextAlreadyProcessed(result.details)) return result;
  const maxPreviewChars = Math.max(1, Math.floor(options.maxPreviewChars ?? DEFAULT_TOOL_RESULT_TEXT_PREVIEW_CHARS));
  const materializedOutputs: MaterializedToolTextOutput[] = [];
  const content: TextContentItem[] = [];
  let changed = false;
  let remainingPreviewChars = maxPreviewChars;
  let visibleNoticeCount = 0;
  let omittedNoticeCount = 0;
  let omittedNoticeChars = 0;

  for (const [index, item] of result.content.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      content.push(item as unknown as TextContentItem);
      continue;
    }
    const contentItem = item as TextContentItem;
    if (contentItem.type !== "text" || typeof contentItem.text !== "string") {
      content.push(contentItem);
      continue;
    }
    const label = materializedToolTextLabel(options.artifactLabelPrefix ?? "tool-result", index, result.content.length);
    const output = await materializeTextOutput(options.workspacePath, {
      label,
      text: contentItem.text,
      maxPreviewChars: remainingPreviewChars,
      extension: "txt",
    });
    remainingPreviewChars = Math.max(0, remainingPreviewChars - output.previewChars);
    const trackedOutput = { ...output, label };
    if (output.truncated || output.redacted || output.artifactPath || output.previewChars < output.totalChars) {
      materializedOutputs.push(trackedOutput);
    }
    if (output.truncated) {
      const notice = visibleNoticeCount < MAX_TOOL_RESULT_TEXT_NOTICES
        ? materializedTextNotice(label, output)
        : undefined;
      if (notice) {
        visibleNoticeCount += 1;
      } else {
        omittedNoticeCount += 1;
        omittedNoticeChars += Math.max(0, output.totalChars - output.previewChars);
      }
      content.push({
        ...contentItem,
        text: [output.text, notice].filter(Boolean).join("\n\n"),
      });
      changed = true;
    } else if (output.redacted && output.text !== contentItem.text) {
      content.push({ ...contentItem, text: output.text });
      changed = true;
    } else {
      content.push(contentItem);
    }
  }
  if (omittedNoticeCount > 0) {
    content.push({
      type: "text",
      text: [
        `[truncated] ${omittedNoticeCount} additional tool text ${omittedNoticeCount === 1 ? "output was" : "outputs were"} materialized after the preview notice limit.`,
        `${omittedNoticeChars} chars were omitted from Pi-visible content.`,
        "Full output artifact paths are recorded in tool result details.",
      ].join("\n"),
    });
    changed = true;
  }

  const largeOutputItems = materializedOutputs.flatMap(materializedToolTextPreviewItem);
  const redactedOutputs = materializedOutputs.filter((output) => output.redacted);
  if (!changed && !largeOutputItems.length && !redactedOutputs.length) return result;

  const details = resultDetailsRecord(result.details);
  const nextDetails: Record<string, unknown> = {
    ...details,
    ...(redactedOutputs.length || largeOutputItems.length ? { toolResultTextOutputs: materializedOutputs } : {}),
    ...(!details.textOutput && materializedOutputs.length === 1 ? { textOutput: materializedOutputs[0] } : {}),
  };
  const largeOutputPreview = mergeToolLargeOutputPreview(details.largeOutputPreview, largeOutputItems);
  if (largeOutputPreview) nextDetails.largeOutputPreview = largeOutputPreview;

  return {
    ...result,
    content: content as T["content"],
    details: nextDetails,
  };
}

function materializedToolTextLabel(prefix: string, index: number, count: number): string {
  return count > 1 ? `${prefix}-text-${index + 1}` : `${prefix}-text`;
}

function materializedToolTextPreviewItem(output: MaterializedToolTextOutput): ToolLargeOutputPreviewItem[] {
  if (!output.truncated && !output.artifactPath && output.previewChars >= output.totalChars) return [];
  return [{
    label: output.label,
    chars: output.totalChars,
    previewChars: output.previewChars,
    truncated: output.truncated || output.previewChars < output.totalChars,
    artifactKind: "tool-output",
    ...(output.artifactPath ? { artifactPath: output.artifactPath, suggestedTools: ["file_read", "long_context_process"] } : {}),
    ...(output.artifactBytes === undefined ? {} : { artifactBytes: output.artifactBytes }),
  }];
}

function resultDetailsRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

function mergeToolLargeOutputPreview(existing: unknown, items: ToolLargeOutputPreviewItem[]): ToolLargeOutputPreview | undefined {
  const existingPreview = largeOutputPreviewRecord(existing);
  if (!items.length) return existingPreview;
  const mergedItems = [...(existingPreview?.items ?? []), ...items];
  const artifactCount = mergedItems.filter((item) => item.artifactPath).length;
  return {
    kind: "large-output",
    summary: [
      `${mergedItems.length} materialized tool text ${mergedItems.length === 1 ? "output" : "outputs"}`,
      artifactCount ? `${artifactCount} ${artifactCount === 1 ? "artifact" : "artifacts"}` : undefined,
    ].filter(Boolean).join(" · "),
    items: mergedItems,
  };
}

function largeOutputPreviewRecord(value: unknown): ToolLargeOutputPreview | undefined {
  const record = resultDetailsRecord(value);
  if (record.kind !== "large-output" || !Array.isArray(record.items)) return undefined;
  const summary = typeof record.summary === "string" && record.summary.trim() ? record.summary : "materialized tool output";
  const items = record.items.filter((item): item is ToolLargeOutputPreviewItem =>
    Boolean(item && typeof item === "object" && !Array.isArray(item)),
  );
  return items.length ? { kind: "large-output", summary, items } : undefined;
}
