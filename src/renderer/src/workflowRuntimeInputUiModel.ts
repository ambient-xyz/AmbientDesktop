import type { WorkflowRunDetail, WorkflowRunEvent, WorkflowUserInputChoice } from "../../shared/types";

export interface WorkflowRuntimeInputCard {
  id: string;
  eventId: string;
  seq: number;
  runId: string;
  requestId: string;
  prompt: string;
  choices: WorkflowUserInputChoice[];
  allowFreeform: boolean;
  graphNodeId?: string;
  itemKey?: string;
  browserIntervention?: WorkflowRuntimeBrowserIntervention;
  contextItems: WorkflowRuntimeInputContextItem[];
}

export type WorkflowRuntimeInputContextKind = "artifact" | "preview" | "url" | "data";
export type WorkflowRuntimeInputContextFormat = "path" | "markdown" | "html" | "text" | "json" | "image" | "url";

export interface WorkflowRuntimeBrowserIntervention {
  title: string;
  kind?: string;
  provider?: string;
  status?: string;
  toolName?: string;
  runtime?: string;
  profileMode?: string;
  browserUserActionId?: string;
  targetId?: string;
  url?: string;
  message?: string;
  preview?: WorkflowRuntimeBrowserInterventionPreview;
}

export interface WorkflowRuntimeBrowserInterventionPreview {
  title?: string;
  url?: string;
  detail?: string;
  textExcerpt?: string;
  screenshotArtifactPath?: string;
  screenshotPath?: string;
  screenshotBytes?: number;
  screenshotWidth?: number;
  screenshotHeight?: number;
}

export interface WorkflowRuntimeInputContextItem {
  id: string;
  kind: WorkflowRuntimeInputContextKind;
  label: string;
  detail?: string;
  format: WorkflowRuntimeInputContextFormat;
  value: string;
  artifactPath?: string;
}

export function workflowRuntimeInputCards(detail?: Pick<WorkflowRunDetail, "run" | "events">): WorkflowRuntimeInputCard[] {
  if (!detail) return [];
  const answered = new Set(
    detail.events
      .filter((event) => event.type === "workflow.input.received")
      .map((event) => stringValue(event.data?.requestId) ?? event.message)
      .filter((value): value is string => Boolean(value)),
  );
  return detail.events
    .filter((event) => event.type === "workflow.input.required")
    .map((event) => inputCardFromEvent(event))
    .filter((card): card is WorkflowRuntimeInputCard => Boolean(card && !answered.has(card.requestId)))
    .sort((left, right) => right.seq - left.seq);
}

function inputCardFromEvent(event: WorkflowRunEvent): WorkflowRuntimeInputCard | undefined {
  const requestId = stringValue(event.data?.id);
  const prompt = stringValue(event.message) ?? stringValue(event.data?.prompt);
  if (!requestId || !prompt) return undefined;
  const browserIntervention = browserInterventionFromEvent(event);
  return {
    id: `workflow-input:${requestId}`,
    eventId: event.id,
    seq: event.seq,
    runId: event.runId,
    requestId,
    prompt,
    choices: choicesFromValue(event.data?.choices),
    allowFreeform: event.data?.allowFreeform !== false,
    graphNodeId: event.graphNodeId ?? stringValue(event.data?.graphNodeId),
    itemKey: event.itemKey ?? stringValue(event.data?.itemKey),
    ...(browserIntervention ? { browserIntervention } : {}),
    contextItems: contextItemsFromEvent(event),
  };
}

function contextItemsFromEvent(event: WorkflowRunEvent): WorkflowRuntimeInputContextItem[] {
  const items: WorkflowRuntimeInputContextItem[] = [];
  const addItem = (item: WorkflowRuntimeInputContextItem | undefined) => {
    if (!item) return;
    const key = `${item.kind}:${item.artifactPath ?? ""}:${item.value}`;
    if (items.some((existing) => `${existing.kind}:${existing.artifactPath ?? ""}:${existing.value}` === key)) return;
    items.push(item);
  };
  const requestData = objectValue(event.data?.data);
  if (requestData) {
    addContextItemsFromRecord(items.length, publicRuntimeInputData(requestData), "Attached context").forEach(addItem);
  }
  const eventData = objectValue(event.data);
  if (eventData) {
    const publicEventData = { ...eventData };
    delete publicEventData.id;
    delete publicEventData.prompt;
    delete publicEventData.choices;
    delete publicEventData.allowFreeform;
    delete publicEventData.data;
    delete publicEventData.status;
    delete publicEventData.graphNodeId;
    delete publicEventData.graphEdgeId;
    delete publicEventData.itemKey;
    delete publicEventData.requestId;
    addContextItemsFromRecord(items.length, publicEventData, "Runtime context").forEach(addItem);
  }
  return items.slice(0, 4);
}

function browserInterventionFromEvent(event: WorkflowRunEvent): WorkflowRuntimeBrowserIntervention | undefined {
  const requestData = objectValue(event.data?.data);
  const value = objectValue(requestData?.browserIntervention);
  if (!value) return undefined;
  const title = boundedString(value.title, 90) ?? "Browser needs user action";
  const kind = boundedString(value.kind, 80);
  const provider = boundedString(value.provider, 80);
  const status = boundedString(value.status, 80);
  const toolName = boundedString(value.toolName, 120);
  const runtime = boundedString(value.runtime, 80);
  const profileMode = boundedString(value.profileMode, 80);
  const browserUserActionId = boundedString(value.browserUserActionId ?? value.userActionId ?? value.id, 200);
  const targetId = boundedString(value.targetId, 200);
  const url = boundedString(value.url, 600);
  const message = boundedString(value.message, 600);
  const preview = browserInterventionPreviewFromValue(value, requestData);
  return {
    title,
    ...(kind ? { kind } : {}),
    ...(provider ? { provider } : {}),
    ...(status ? { status } : {}),
    ...(toolName ? { toolName } : {}),
    ...(runtime ? { runtime } : {}),
    ...(profileMode ? { profileMode } : {}),
    ...(browserUserActionId ? { browserUserActionId } : {}),
    ...(targetId ? { targetId } : {}),
    ...(url ? { url } : {}),
    ...(message ? { message } : {}),
    ...(preview ? { preview } : {}),
  };
}

function browserInterventionPreviewFromValue(
  value: Record<string, unknown>,
  requestData: Record<string, unknown> | undefined,
): WorkflowRuntimeBrowserInterventionPreview | undefined {
  const previewRecord = objectValue(value.preview) ?? objectValue(requestData?.browserPreview) ?? objectValue(requestData?.browserEvidence);
  const screenshot =
    objectValue(value.screenshot) ??
    objectValue(previewRecord?.screenshot) ??
    objectValue(requestData?.screenshot) ??
    objectValue(requestData?.browserScreenshot);
  const screenshotArtifactPath =
    boundedString(value.screenshotArtifactPath, 600) ??
    boundedString(previewRecord?.screenshotArtifactPath, 600) ??
    boundedString(screenshot?.artifactPath, 600);
  const screenshotPath =
    boundedString(value.screenshotPath, 600) ??
    boundedString(previewRecord?.screenshotPath, 600) ??
    boundedString(screenshot?.path, 600);
  const textExcerpt = truncatePreview(
    stringValue(value.pageExcerpt) ??
      stringValue(value.domExcerpt) ??
      stringValue(value.textExcerpt) ??
      stringValue(previewRecord?.pageExcerpt) ??
      stringValue(previewRecord?.domExcerpt) ??
      stringValue(previewRecord?.textExcerpt) ??
      stringValue(previewRecord?.text) ??
      "",
  );
  const preview: WorkflowRuntimeBrowserInterventionPreview = {
    ...(boundedString(previewRecord?.title, 120) ? { title: boundedString(previewRecord?.title, 120) } : {}),
    ...(boundedString(previewRecord?.url, 600) ?? boundedString(screenshot?.url, 600)
      ? { url: boundedString(previewRecord?.url, 600) ?? boundedString(screenshot?.url, 600) }
      : {}),
    ...(boundedString(previewRecord?.detail, 220) ? { detail: boundedString(previewRecord?.detail, 220) } : {}),
    ...(textExcerpt ? { textExcerpt } : {}),
    ...(screenshotArtifactPath ? { screenshotArtifactPath } : {}),
    ...(screenshotPath ? { screenshotPath } : {}),
    ...(numberValue(screenshot?.bytes) ? { screenshotBytes: numberValue(screenshot?.bytes) } : {}),
    ...(numberValue(screenshot?.width) ? { screenshotWidth: numberValue(screenshot?.width) } : {}),
    ...(numberValue(screenshot?.height) ? { screenshotHeight: numberValue(screenshot?.height) } : {}),
  };
  return Object.keys(preview).length > 0 ? preview : undefined;
}

function publicRuntimeInputData(record: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...record };
  delete copy.browserIntervention;
  delete copy.browserPreview;
  delete copy.browserEvidence;
  delete copy.browserScreenshot;
  delete copy.screenshot;
  return copy;
}

function addContextItemsFromRecord(
  offset: number,
  record: Record<string, unknown>,
  defaultLabel: string,
): WorkflowRuntimeInputContextItem[] {
  const items: WorkflowRuntimeInputContextItem[] = [];
  for (const [key, value] of Object.entries(record)) {
    const item = contextItemFromValue(`context-${offset + items.length}`, key, value, defaultLabel);
    if (item) items.push(item);
    if (items.length >= 4) break;
  }
  if (items.length === 0 && Object.keys(record).length > 0) {
    items.push({
      id: `context-${offset}`,
      kind: "data",
      label: defaultLabel,
      detail: `${Object.keys(record).length} field${Object.keys(record).length === 1 ? "" : "s"}`,
      format: "json",
      value: truncatePreview(safeJson(record)),
    });
  }
  return items;
}

function contextItemFromValue(
  id: string,
  key: string,
  value: unknown,
  defaultLabel: string,
): WorkflowRuntimeInputContextItem | undefined {
  if (value === undefined || value === null) return undefined;
  const label = labelFromKey(key, defaultLabel);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const format = formatForString(key, trimmed);
    return {
      id,
      kind: format === "path" || format === "image" ? "artifact" : format === "url" ? "url" : "preview",
      label,
      detail: detailForFormat(format),
      format,
      value: truncatePreview(trimmed),
      ...(format === "path" || format === "image" ? { artifactPath: trimmed } : {}),
    };
  }
  if (Array.isArray(value)) {
    return {
      id,
      kind: "data",
      label,
      detail: `${value.length} item${value.length === 1 ? "" : "s"}`,
      format: "json",
      value: truncatePreview(safeJson(value)),
    };
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const path = stringValue(record.artifactPath) ?? stringValue(record.path) ?? stringValue(record.filePath) ?? stringValue(record.reportPath);
    const preview =
      stringValue(record.preview) ??
      stringValue(record.summary) ??
      stringValue(record.markdown) ??
      stringValue(record.html) ??
      stringValue(record.text) ??
      safeJson(record);
    const format = path ? formatForString(key, path) : stringValue(record.html) ? "html" : stringValue(record.markdown) ? "markdown" : "json";
    return {
      id,
      kind: path ? "artifact" : "data",
      label: stringValue(record.title) ?? label,
      detail: path ? "Artifact for review" : `${Object.keys(record).length} field${Object.keys(record).length === 1 ? "" : "s"}`,
      format,
      value: truncatePreview(preview),
      ...(path ? { artifactPath: path } : {}),
    };
  }
  return {
    id,
    kind: "data",
    label,
    detail: "Runtime value",
    format: "text",
    value: String(value),
  };
}

function choicesFromValue(value: unknown): WorkflowUserInputChoice[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return undefined;
      const record = item as Record<string, unknown>;
      const id = stringValue(record.id);
      const label = stringValue(record.label);
      if (!id || !label) return undefined;
      const description = stringValue(record.description);
      return { id, label, ...(description ? { description } : {}) };
    })
    .filter((item): item is WorkflowUserInputChoice => Boolean(item));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function boundedString(value: unknown, maxLength: number): string | undefined {
  const text = stringValue(value);
  if (!text) return undefined;
  return text.length > maxLength ? text.slice(0, maxLength).trimEnd() : text;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function labelFromKey(key: string, fallback: string): string {
  const cleaned = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!cleaned) return fallback;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function formatForString(key: string, value: string): WorkflowRuntimeInputContextFormat {
  if (/^https?:\/\//i.test(value)) return "url";
  const lower = `${key} ${value}`.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(lower)) return "image";
  if (/\.html?$/.test(lower)) return "html";
  if (/\.(md|markdown)$/.test(lower)) return "markdown";
  if (/<\/(?:html|body|div|section|article|p|h[1-6]|table)>/i.test(value) || /^\s*<html[\s>]/i.test(value)) return "html";
  if (/markdown/.test(lower) || /^\s{0,3}#/m.test(value) || /^\s*[-*]\s+/m.test(value)) return "markdown";
  if (/path|file|artifact|report/.test(key) || looksLikePath(value)) return "path";
  return "text";
}

function detailForFormat(format: WorkflowRuntimeInputContextFormat): string {
  switch (format) {
    case "path":
      return "Artifact path";
    case "image":
      return "Image artifact";
    case "url":
      return "External URL";
    case "html":
      return "HTML preview";
    case "markdown":
      return "Markdown preview";
    case "json":
      return "Structured data";
    default:
      return "Preview";
  }
}

function looksLikePath(value: string): boolean {
  return /^\/[^ \n\r\t]+/.test(value) || /^\.[/\\][^ \n\r\t]+/.test(value) || /^[\w.-]+[/\\][^ \n\r\t]+/.test(value);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncatePreview(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 1200 ? `${trimmed.slice(0, 1200).trimEnd()}\n...` : trimmed;
}
