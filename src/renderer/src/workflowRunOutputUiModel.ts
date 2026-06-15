import type { WorkflowModelCallRecord, WorkflowRunDetail, WorkflowRunEvent } from "../../shared/types";

export type WorkflowRunOutputKind = "report" | "checkpoint" | "event" | "model";
export type WorkflowRunOutputFormat = "path" | "markdown" | "html" | "text" | "json" | "image";

export interface WorkflowRunOutputCard {
  id: string;
  kind: WorkflowRunOutputKind;
  label: string;
  detail: string;
  format: WorkflowRunOutputFormat;
  preview?: string;
  artifactPath?: string;
  metadata: string[];
}

const OUTPUT_EVENT_PATTERN = /output|report|artifact|file|write|saved|created/i;
const OUTPUT_KEY_PATTERN = /output|report|artifact|file|path|html|markdown|content|summary|result/i;
const PATH_KEY_PATTERN = /(?:^|_)(path|file|reportPath|artifactPath|htmlPath|markdownPath|outputPath|screenshotPath)$/i;
const SCREENSHOT_KEY_PATTERN = /screenshot|screen_shot|screen-shot|browserPreview|browserEvidence|sourceEvidence|source_evidence/i;
const SCREENSHOT_PATH_KEY_PATTERN = /screenshot.*(?:path|artifact)|(?:path|artifact).*screenshot|screenshotArtifactPath/i;
const SUMMARY_KEYS = [
  "summary",
  "outputSummary",
  "resultSummary",
  "report",
  "markdown",
  "html",
  "text",
  "content",
  "result",
  "output",
  "value",
  "items",
];
const MAX_OUTPUT_CARDS = 18;
const MAX_SCREENSHOT_OUTPUT_CARDS = 6;
const MAX_PREVIEW_CHARS = 1600;
const MAX_STRUCTURED_FIELDS = 8;
const MAX_STRUCTURED_ITEMS = 5;

export function workflowRunOutputCards(detail?: WorkflowRunDetail): WorkflowRunOutputCard[] {
  if (!detail) return [];
  const cards: WorkflowRunOutputCard[] = [];
  if (detail.run.reportPath) {
    cards.push({
      id: "report",
      kind: "report",
      label: "Run report",
      detail: "Workflow audit/report artifact",
      format: outputFormatForPath(detail.run.reportPath),
      artifactPath: detail.run.reportPath,
      preview: detail.run.reportPath,
      metadata: ["report artifact"],
    });
  }

  for (const checkpoint of detail.checkpoints.filter((item) => OUTPUT_KEY_PATTERN.test(item.key)).slice(0, 8)) {
    const preview = outputPreviewFromValue(checkpoint.valuePreview, checkpoint.key);
    cards.push({
      id: `checkpoint:${checkpoint.key}:${checkpoint.updatedAt ?? ""}`,
      kind: "checkpoint",
      label: `Checkpoint ${checkpoint.key}`,
      detail: checkpoint.updatedAt ? `Updated ${formatTimestamp(checkpoint.updatedAt)}` : "Retained checkpoint output",
      ...preview,
      metadata: ["checkpoint", ...preview.metadata],
    });
  }

  for (const checkpoint of detail.checkpoints.filter((item) => SCREENSHOT_KEY_PATTERN.test(item.key)).slice(-4)) {
    cards.push(
      ...screenshotArtifactCardsFromValue(
        checkpoint.valuePreview,
        `checkpoint:${checkpoint.key}`,
        "checkpoint",
        `Checkpoint ${checkpoint.key}`,
      ),
    );
  }

  for (const event of detail.events) {
    cards.push(...screenshotArtifactCardsFromValue(event.data, `event-screenshot:${event.id}`, "event", humanizeEventLabel(event)));
  }

  for (const modelCall of outputModelCalls(detail.modelCalls).slice(-4)) {
    const preview = outputPreviewFromValue(modelCall.output, modelCall.task);
    cards.push({
      id: `model:${modelCall.id}`,
      kind: "model",
      label: `Model output: ${modelCall.task}`,
      detail: modelCall.completedAt ? `Completed ${formatTimestamp(modelCall.completedAt)}` : "Retained model output",
      ...preview,
      metadata: [`${modelCall.status} model call`, ...preview.metadata],
    });
    cards.push(
      ...screenshotArtifactCardsFromValue(
        modelCall.output,
        `model:${modelCall.id}`,
        "model",
        `Model output: ${modelCall.task}`,
      ),
    );
  }

  for (const event of outputEvents(detail.events).slice(-12)) {
    const preview = outputPreviewFromValue(event.data, event.message ?? event.type);
    cards.push({
      id: `event:${event.id}`,
      kind: "event",
      label: humanizeEventLabel(event),
      detail: event.message ?? `Event ${event.seq}${event.graphNodeId ? ` · node ${event.graphNodeId}` : ""}`,
      ...preview,
      metadata: [event.graphNodeId ? `node ${event.graphNodeId}` : undefined, event.itemKey ? `item ${event.itemKey}` : undefined, ...preview.metadata].filter(
        (value): value is string => Boolean(value),
      ),
    });
    cards.push(...screenshotArtifactCardsFromValue(event.data, `event:${event.id}`, "event", humanizeEventLabel(event)));
  }

  return dedupeCards(cards).slice(0, MAX_OUTPUT_CARDS);
}

interface ScreenshotArtifactCandidate {
  artifactPath: string;
  label: string;
  detail: string;
  metadata: string[];
}

function screenshotArtifactCardsFromValue(
  value: unknown,
  idPrefix: string,
  kind: WorkflowRunOutputKind,
  sourceLabel: string,
): WorkflowRunOutputCard[] {
  const candidates = screenshotArtifactCandidates(value).slice(0, MAX_SCREENSHOT_OUTPUT_CARDS);
  return candidates.map((candidate, index) => ({
    id: `${idPrefix}:screenshot:${index}:${candidate.artifactPath}`,
    kind,
    label: candidate.label,
    detail: candidate.detail || `${sourceLabel} screenshot artifact`,
    format: "image",
    artifactPath: candidate.artifactPath,
    preview: candidate.artifactPath,
    metadata: uniqueStrings(["screenshot", sourceLabel, ...candidate.metadata]),
  }));
}

function screenshotArtifactCandidates(value: unknown): ScreenshotArtifactCandidate[] {
  const parsed = typeof value === "string" ? parseJsonIfPossible(value) : value;
  const candidates: ScreenshotArtifactCandidate[] = [];
  collectScreenshotArtifactCandidates(parsed, [], candidates);
  return candidates;
}

function collectScreenshotArtifactCandidates(value: unknown, path: string[], candidates: ScreenshotArtifactCandidate[]) {
  if (candidates.length >= MAX_SCREENSHOT_OUTPUT_CARDS) return;
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectScreenshotArtifactCandidates(item, [...path, String(index)], candidates));
    return;
  }

  const record = value as Record<string, unknown>;
  const screenshotPath = screenshotPathFromRecord(record, path);
  if (screenshotPath && !candidates.some((candidate) => candidate.artifactPath === screenshotPath)) {
    candidates.push({
      artifactPath: screenshotPath,
      label: screenshotLabelFromRecord(record, path),
      detail: screenshotDetailFromRecord(record, path),
      metadata: screenshotMetadataFromRecord(record, path),
    });
  }

  for (const [key, childValue] of Object.entries(record)) {
    if (childValue && typeof childValue === "object") collectScreenshotArtifactCandidates(childValue, [...path, key], candidates);
    if (candidates.length >= MAX_SCREENSHOT_OUTPUT_CARDS) return;
  }
}

function screenshotPathFromRecord(record: Record<string, unknown>, path: string[]): string | undefined {
  for (const [key, value] of Object.entries(record)) {
    if (SCREENSHOT_PATH_KEY_PATTERN.test(key) && typeof value === "string" && outputFormatForPath(value) === "image") return value.trim();
  }

  const contextLooksLikeScreenshot = path.some((segment) => SCREENSHOT_KEY_PATTERN.test(segment));
  if (!contextLooksLikeScreenshot) return undefined;

  for (const key of ["artifactPath", "path", "file", "screenshotPath"]) {
    const value = record[key];
    if (typeof value === "string" && outputFormatForPath(value) === "image") return value.trim();
  }

  return undefined;
}

function screenshotLabelFromRecord(record: Record<string, unknown>, path: string[]): string {
  const normalizedPath = path.join(".");
  if (
    /browserIntervention|browser_intervention|userAction|user_action|challenge|captcha/i.test(normalizedPath) ||
    (typeof record.kind === "string" && /captcha|bot-check|login|mfa|consent|user-action/i.test(record.kind))
  ) {
    return "Browser challenge screenshot";
  }
  if (/sourceEvidence|source_evidence/i.test(normalizedPath)) return "Source evidence screenshot";
  if (
    /browser|intervention|challenge|captcha/i.test(normalizedPath) ||
    Object.keys(record).some((key) => /browser|screenshot|screen_shot|screen-shot/i.test(key))
  ) {
    return "Browser screenshot";
  }
  return "Screenshot artifact";
}

function screenshotDetailFromRecord(record: Record<string, unknown>, path: string[]): string {
  const url = typeof record.url === "string" && record.url.trim() ? record.url.trim() : undefined;
  const title =
    typeof record.title === "string" && record.title.trim()
      ? record.title.trim()
      : typeof record.sourceTitle === "string" && record.sourceTitle.trim()
        ? record.sourceTitle.trim()
        : undefined;
  const pathLabel = path.filter((segment) => !/^\d+$/.test(segment)).slice(-2).join(" / ");
  return [title, url, pathLabel ? `from ${pathLabel}` : "Retained browser evidence"].filter(Boolean).join(" · ");
}

function screenshotMetadataFromRecord(record: Record<string, unknown>, path: string[]): string[] {
  const metadata: string[] = [];
  const width = numberRecordValue(record, "width") ?? numberRecordValue(record, "screenshotWidth");
  const height = numberRecordValue(record, "height") ?? numberRecordValue(record, "screenshotHeight");
  const bytes = numberRecordValue(record, "bytes") ?? numberRecordValue(record, "screenshotBytes");
  if (width && height) metadata.push(`${width}x${height}`);
  if (bytes) metadata.push(formatCardBytes(bytes));
  if (path.some((segment) => /browserIntervention|browser_intervention|userAction|user_action|challenge|captcha/i.test(segment))) {
    metadata.push("browser challenge");
  }
  if (path.some((segment) => /sourceEvidence|source_evidence/i.test(segment))) metadata.push("source evidence");
  return metadata;
}

function outputEvents(events: WorkflowRunEvent[]): WorkflowRunEvent[] {
  return events.filter(
    (event) =>
      !isRuntimeTelemetryEvent(event) &&
      (OUTPUT_EVENT_PATTERN.test(`${event.type} ${event.message ?? ""}`) ||
        Object.keys(event.data ?? {}).some((key) => OUTPUT_KEY_PATTERN.test(key))),
  );
}

function isRuntimeTelemetryEvent(event: WorkflowRunEvent): boolean {
  if (/^(ambient\.call|step|tool|desktop-tool)\./.test(event.type)) return true;
  if (/^workflow\.(version|mode|run-limits|start|status_update|succeeded|failed|input\.)$/.test(event.type)) return true;
  if (event.type === "checkpoint.write") return true;
  return false;
}

function outputModelCalls(modelCalls: WorkflowModelCallRecord[]): WorkflowModelCallRecord[] {
  return modelCalls.filter((call) => call.output !== undefined && OUTPUT_KEY_PATTERN.test(`${call.task} ${jsonKeySummary(call.output)}`));
}

function outputPreviewFromValue(value: unknown, labelHint = "Output"): Omit<WorkflowRunOutputCard, "id" | "kind" | "label" | "detail"> {
  const normalized = typeof value === "string" ? parseJsonIfPossible(value) : value;
  const preview = previewFromParsedValue(normalized, labelHint);
  if (preview) return preview;
  return {
    format: typeof value === "string" ? "text" : "json",
    preview: truncatePreview(typeof value === "string" ? value : stringifyPretty(value)),
    metadata: typeof value === "string" ? ["text preview"] : ["structured data"],
  };
}

function previewFromParsedValue(value: unknown, labelHint: string): Omit<WorkflowRunOutputCard, "id" | "kind" | "label" | "detail"> | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (looksLikePath(trimmed)) {
      return { format: outputFormatForPath(trimmed), artifactPath: trimmed, preview: trimmed, metadata: ["path"] };
    }
    if (looksLikeHtml(trimmed)) return { format: "html", preview: truncatePreview(trimmed), metadata: ["html preview"] };
    if (looksLikeMarkdown(trimmed, labelHint)) return { format: "markdown", preview: truncatePreview(trimmed), metadata: ["markdown preview"] };
    return { format: "text", preview: truncatePreview(trimmed), metadata: ["text preview"] };
  }

  if (Array.isArray(value)) {
    return {
      format: "text",
      preview: truncatePreview(arrayPreview(value)),
      metadata: [`${value.length} item${value.length === 1 ? "" : "s"}`],
    };
  }

  if (!value || typeof value !== "object") {
    return {
      format: "text",
      preview: value === undefined ? undefined : String(value),
      metadata: ["scalar"],
    };
  }

  const record = value as Record<string, unknown>;
  const path = pathFromRecord(record);
  const artifactFormat = path ? outputFormatForPath(path) : undefined;
  const artifactPreferred = path && artifactFormat ? preferredArtifactValueFromRecord(record, artifactFormat) : undefined;
  const preferred = artifactPreferred ?? preferredValueFromRecord(record);
  const metadata = metadataFromRecord(record);
  if (path && preferred) {
    const nested = previewFromParsedValue(preferred.value, preferred.key);
    return {
      format: displayFormatForArtifactPreview(artifactFormat, nested?.format),
      artifactPath: path,
      preview: nested?.preview ?? path,
      metadata: uniqueStrings([`artifact ${preferred.key}`, ...metadata, ...(nested?.metadata ?? [])]),
    };
  }
  if (path) {
    return { format: outputFormatForPath(path), artifactPath: path, preview: path, metadata: uniqueStrings(["path", ...metadata]) };
  }
  if (preferred) {
    const nested = previewFromParsedValue(preferred.value, preferred.key);
    if (nested) return { ...nested, metadata: uniqueStrings([preferred.key, ...metadata, ...nested.metadata]) };
  }

  const structuredPreview = structuredRecordPreview(record);
  if (structuredPreview) {
    return {
      format: "text",
      preview: truncatePreview(structuredPreview),
      metadata: uniqueStrings(["structured summary", ...metadata]),
    };
  }

  return {
    format: "json",
    preview: truncatePreview(stringifyPretty(record)),
    metadata: uniqueStrings(["structured data", ...metadata]),
  };
}

function displayFormatForArtifactPreview(
  artifactFormat: WorkflowRunOutputFormat | undefined,
  nestedFormat: WorkflowRunOutputFormat | undefined,
): WorkflowRunOutputFormat {
  if (!artifactFormat || artifactFormat === "path") return nestedFormat ?? artifactFormat ?? "path";
  if (!nestedFormat || nestedFormat === "path") return artifactFormat;
  if (artifactFormat === "html" && nestedFormat !== "html") return nestedFormat;
  if (artifactFormat === "markdown" && nestedFormat !== "markdown") return nestedFormat;
  return artifactFormat;
}

function preferredValueFromRecord(record: Record<string, unknown>): { key: string; value: unknown } | undefined {
  for (const key of SUMMARY_KEYS) {
    if (record[key] !== undefined) return { key, value: record[key] };
  }
  const entry = Object.entries(record).find(([key, value]) => OUTPUT_KEY_PATTERN.test(key) && value !== undefined);
  return entry ? { key: entry[0], value: entry[1] } : undefined;
}

function preferredArtifactValueFromRecord(
  record: Record<string, unknown>,
  artifactFormat: WorkflowRunOutputFormat,
): { key: string; value: unknown } | undefined {
  const keys =
    artifactFormat === "html"
      ? ["html", "preview", "summary", "markdown", "text", "content"]
      : artifactFormat === "markdown"
        ? ["markdown", "preview", "summary", "text", "content"]
        : artifactFormat === "json"
          ? ["json", "preview", "summary", "result", "output"]
          : ["preview", "summary", "text", "content", "description"];
  for (const key of keys) {
    if (record[key] !== undefined) return { key, value: record[key] };
  }
  return undefined;
}

function pathFromRecord(record: Record<string, unknown>): string | undefined {
  for (const [key, value] of Object.entries(record)) {
    if (PATH_KEY_PATTERN.test(key) && typeof value === "string" && value.trim()) return value.trim();
  }
  for (const value of Object.values(record)) {
    if (typeof value === "string" && looksLikePath(value)) return value.trim();
  }
  return undefined;
}

function metadataFromRecord(record: Record<string, unknown>): string[] {
  const metadata: string[] = [];
  const keys = Object.keys(record);
  if (keys.length) metadata.push(`${keys.length} field${keys.length === 1 ? "" : "s"}`);
  for (const [key, value] of Object.entries(record).slice(0, 4)) {
    if (Array.isArray(value)) metadata.push(`${key}: ${value.length}`);
    else if (value && typeof value === "object") metadata.push(`${key}: object`);
  }
  return metadata;
}

function arrayPreview(value: unknown[]): string {
  if (value.length === 0) return "No items.";
  return value
    .slice(0, 8)
    .map((item, index) => {
      if (typeof item === "string") return `- ${item}`;
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const title =
          stringRecordValue(record, "title") ??
          stringRecordValue(record, "name") ??
          stringRecordValue(record, "label") ??
          stringRecordValue(record, "file") ??
          stringRecordValue(record, "path") ??
          `Item ${index + 1}`;
        const summary =
          stringRecordValue(record, "summary") ??
          stringRecordValue(record, "description") ??
          stringRecordValue(record, "classification") ??
          stringRecordValue(record, "category") ??
          stringRecordValue(record, "status") ??
          stringRecordValue(record, "reason");
        return summary ? `- ${title}: ${summary}` : `- ${title}`;
      }
      return `- ${String(item)}`;
    })
    .join("\n");
}

function structuredRecordPreview(record: Record<string, unknown>): string | undefined {
  const entries = Object.entries(record).filter(([, value]) => value !== undefined && typeof value !== "function");
  if (entries.length === 0) return undefined;

  const lines: string[] = [];
  for (const [key, value] of entries.slice(0, MAX_STRUCTURED_FIELDS)) {
    const formatted = structuredValuePreview(value);
    if (formatted) lines.push(`- ${humanizeOutputKey(key)}: ${formatted}`);
  }
  if (entries.length > MAX_STRUCTURED_FIELDS) lines.push(`- ${entries.length - MAX_STRUCTURED_FIELDS} more field${entries.length - MAX_STRUCTURED_FIELDS === 1 ? "" : "s"}`);
  return lines.length ? lines.join("\n") : undefined;
}

function structuredValuePreview(value: unknown): string | undefined {
  if (value === null) return "None";
  if (typeof value === "string") return truncateInlinePreview(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "No items";
    const preview = arrayPreview(value.slice(0, MAX_STRUCTURED_ITEMS));
    const suffix = value.length > MAX_STRUCTURED_ITEMS ? `\n  ... ${value.length - MAX_STRUCTURED_ITEMS} more item${value.length - MAX_STRUCTURED_ITEMS === 1 ? "" : "s"}` : "";
    return `\n  ${preview.replace(/\n/g, "\n  ")}${suffix}`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferred = preferredValueFromRecord(record);
    if (preferred && SUMMARY_KEYS.includes(preferred.key)) {
      const nested = structuredValuePreview(preferred.value);
      if (nested) return nested;
    }
    const title = stringRecordValue(record, "title") ?? stringRecordValue(record, "name") ?? stringRecordValue(record, "label") ?? stringRecordValue(record, "file") ?? stringRecordValue(record, "path");
    const summary =
      stringRecordValue(record, "summary") ??
      stringRecordValue(record, "description") ??
      stringRecordValue(record, "classification") ??
      stringRecordValue(record, "category") ??
      stringRecordValue(record, "status");
    if (title && summary) return `${title}: ${summary}`;
    if (summary) return summary;
    if (title) return title;
    const scalarEntries = Object.entries(record).filter(([, item]) => item === null || ["string", "number", "boolean"].includes(typeof item));
    if (scalarEntries.length > 0 && scalarEntries.length <= 4) {
      return scalarEntries.map(([itemKey, itemValue]) => `${humanizeOutputKey(itemKey)}: ${itemValue === null ? "None" : String(itemValue)}`).join(", ");
    }
    const keys = Object.keys(record);
    return `${keys.length} field${keys.length === 1 ? "" : "s"}`;
  }
  return undefined;
}

function humanizeOutputKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : "Value";
}

function truncateInlinePreview(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 220 ? `${trimmed.slice(0, 220).trimEnd()}...` : trimmed;
}

function stringRecordValue(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberRecordValue(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function formatCardBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function humanizeEventLabel(event: WorkflowRunEvent): string {
  if (/report/i.test(event.type)) return "Report event";
  if (/checkpoint/i.test(event.type)) return "Checkpoint event";
  if (/write|saved|created/i.test(event.type)) return "Artifact event";
  if (/output/i.test(event.type)) return "Output event";
  return event.type;
}

function outputFormatForPath(path: string): WorkflowRunOutputFormat {
  const lower = path.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(lower)) return "image";
  if (/\.html?$/.test(lower)) return "html";
  if (/\.(md|markdown)$/.test(lower)) return "markdown";
  if (/\.json$/.test(lower)) return "json";
  return "path";
}

function looksLikePath(value: string): boolean {
  const trimmed = value.trim();
  return (
    /^\/[^ \n\r\t]+/.test(trimmed) ||
    /^\.[/\\][^ \n\r\t]+/.test(trimmed) ||
    /^~\/[^ \n\r\t]+/.test(trimmed) ||
    /^[\w.-]+[/\\][^ \n\r\t]+/.test(trimmed)
  );
}

function looksLikeHtml(value: string): boolean {
  return (
    /^\s*<!doctype html/i.test(value) ||
    /^\s*<html[\s>]/i.test(value) ||
    /<\/(?:div|section|article|p|h[1-6]|table|ul|ol|li|span|strong|em|b)>/i.test(value)
  );
}

function looksLikeMarkdown(value: string, labelHint: string): boolean {
  return /\.(md|markdown)$/i.test(labelHint) || /^\s{0,3}#/m.test(value) || /^\s*[-*]\s+/m.test(value) || /\n\n/.test(value);
}

function parseJsonIfPossible(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed || !/^[{["]/.test(trimmed)) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function stringifyPretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function jsonKeySummary(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) return "items";
  return Object.keys(value as Record<string, unknown>).join(" ");
}

function truncatePreview(value: string | undefined): string | undefined {
  if (!value) return value;
  const trimmed = value.trim();
  return trimmed.length > MAX_PREVIEW_CHARS ? `${trimmed.slice(0, MAX_PREVIEW_CHARS).trimEnd()}\n...` : trimmed;
}

function dedupeCards(cards: WorkflowRunOutputCard[]): WorkflowRunOutputCard[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = card.artifactPath ? `artifact:${card.artifactPath}` : `${card.kind}:${card.preview ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].slice(0, 5);
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
