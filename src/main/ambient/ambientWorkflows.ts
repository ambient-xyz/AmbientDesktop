import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type {
  SearchWorkflowRecordingsInput,
  WorkflowRecordingLibraryDescription,
  WorkflowRecordingLibraryEntry,
  WorkflowRecordingPlaybookDraft,
  WorkflowRecordingReviewDraftUpdate,
} from "../../shared/types";
import type { ProjectStore } from "../projectStore/projectStore";

const AMBIENT_WORKFLOW_DESCRIBE_MARKDOWN_CHARS = 6_000;
const AMBIENT_WORKFLOW_INJECTION_MARKDOWN_CHARS = 4_000;
const AMBIENT_WORKFLOW_MAX_MARKDOWN_CHARS = 16_000;

export interface AmbientWorkflowsSearchInput extends SearchWorkflowRecordingsInput {}

export interface AmbientWorkflowsDescribeInput {
  id: string;
  version?: number;
  includeMarkdown?: boolean;
  includeArchived?: boolean;
  maxMarkdownChars?: number;
}

export interface AmbientWorkflowsInjectInput {
  id: string;
  version?: number;
  maxMarkdownChars?: number;
}

export interface AmbientWorkflowsSearchResponse {
  results: WorkflowRecordingLibraryEntry[];
  truncated: boolean;
  catalogVersion: string;
}

export interface AmbientWorkflowsUpdateInput {
  id: string;
  baseVersion: number;
  title?: string;
  draft: WorkflowRecordingReviewDraftUpdate;
}

export interface AmbientWorkflowsArchiveInput {
  id: string;
  baseVersion: number;
  reason?: string;
}

export interface AmbientWorkflowsUnarchiveInput {
  id: string;
  baseVersion: number;
}

export interface AmbientWorkflowsRestoreVersionInput {
  id: string;
  version: number;
}

export interface AmbientWorkflowPlaybookDescription extends WorkflowRecordingLibraryDescription {
  requestedVersion?: number;
  markdownIncluded: boolean;
  markdownTruncated: boolean;
  guidance: string[];
}

export interface AmbientWorkflowPlaybookInjection {
  playbook: AmbientWorkflowPlaybookDescription;
  guidanceMarkdown: string;
  injectedAt: string;
}

export function searchAmbientWorkflowPlaybooks(store: ProjectStore, input: AmbientWorkflowsSearchInput = {}): AmbientWorkflowsSearchResponse {
  const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 8), 20));
  const results = store.listWorkflowRecordingLibrary({ ...input, limit: limit + 1 });
  const visible = results.slice(0, limit);
  return {
    results: visible,
    truncated: results.length > limit,
    catalogVersion: ambientWorkflowCatalogVersion(visible),
  };
}

export function describeAmbientWorkflowPlaybook(store: ProjectStore, input: AmbientWorkflowsDescribeInput): AmbientWorkflowPlaybookDescription {
  const current = store.describeWorkflowRecording(input.id, { includeArchived: input.includeArchived });
  const includeMarkdown = input.includeMarkdown === true;
  const maxMarkdownChars = boundedMarkdownChars(input.maxMarkdownChars, AMBIENT_WORKFLOW_DESCRIBE_MARKDOWN_CHARS);
  const requestedVersion = input.version;
  const base =
    requestedVersion === undefined || requestedVersion === current.version
      ? current
      : workflowRecordingDescriptionForVersion(current, requestedVersion);
  const markdown = includeMarkdown ? boundedText(readText(base.markdownPath), maxMarkdownChars) : { text: "", truncated: false };
  return {
    ...base,
    ...(requestedVersion !== undefined ? { requestedVersion } : {}),
    markdownPreview: includeMarkdown ? markdown.text : "",
    markdownIncluded: includeMarkdown,
    markdownTruncated: markdown.truncated,
    guidance: ambientWorkflowGuidance(base),
  };
}

export function injectAmbientWorkflowPlaybook(store: ProjectStore, input: AmbientWorkflowsInjectInput): AmbientWorkflowPlaybookInjection {
  const playbook = describeAmbientWorkflowPlaybook(store, {
    id: input.id,
    ...(input.version !== undefined ? { version: input.version } : {}),
    includeMarkdown: true,
    maxMarkdownChars: boundedMarkdownChars(input.maxMarkdownChars, AMBIENT_WORKFLOW_INJECTION_MARKDOWN_CHARS),
  });
  if (!playbook.enabled) throw new Error(`Workflow playbook is disabled and cannot be injected: ${playbook.id}`);
  if (playbook.archivedAt) throw new Error(`Workflow playbook is archived and cannot be injected: ${playbook.id}`);
  return {
    playbook,
    guidanceMarkdown: ambientWorkflowInjectionMarkdown(playbook),
    injectedAt: new Date().toISOString(),
  };
}

export function updateAmbientWorkflowPlaybook(store: ProjectStore, input: AmbientWorkflowsUpdateInput): AmbientWorkflowPlaybookDescription {
  return {
    ...store.updateWorkflowRecordingPlaybook(input.id, {
      baseVersion: input.baseVersion,
      draft: input.draft,
      ...(input.title ? { title: input.title } : {}),
    }),
    markdownIncluded: false,
    markdownTruncated: false,
    guidance: [
      "Workflow playbook updated as a new version.",
      "Describe the workflow again before injecting the updated version.",
    ],
  };
}

export function archiveAmbientWorkflowPlaybook(store: ProjectStore, input: AmbientWorkflowsArchiveInput): AmbientWorkflowPlaybookDescription {
  return {
    ...store.archiveWorkflowRecording(input.id, { baseVersion: input.baseVersion, ...(input.reason ? { reason: input.reason } : {}) }),
    markdownIncluded: false,
    markdownTruncated: false,
    guidance: [
      "Workflow playbook archived. It is hidden from default search and cannot be injected unless unarchived.",
    ],
  };
}

export function unarchiveAmbientWorkflowPlaybook(store: ProjectStore, input: AmbientWorkflowsUnarchiveInput): AmbientWorkflowPlaybookDescription {
  return {
    ...store.unarchiveWorkflowRecording(input.id, { baseVersion: input.baseVersion }),
    markdownIncluded: false,
    markdownTruncated: false,
    guidance: [
      "Workflow playbook unarchived. It can appear in default search again when enabled.",
    ],
  };
}

export function restoreAmbientWorkflowPlaybookVersion(store: ProjectStore, input: AmbientWorkflowsRestoreVersionInput): AmbientWorkflowPlaybookDescription {
  return {
    ...store.restoreWorkflowRecordingVersion(input.id, input.version),
    markdownIncluded: false,
    markdownTruncated: false,
    guidance: [
      "Workflow playbook version restored by creating a new current version.",
      "Describe the workflow again before injecting the restored version.",
    ],
  };
}

export function ambientWorkflowsSearchText(result: AmbientWorkflowsSearchResponse): string {
  const lines: Array<string | undefined> = [
    "Ambient Workflows playbook search",
    `Catalog: ${result.catalogVersion}`,
    `Results: ${result.results.length}${result.truncated ? " (truncated)" : ""}`,
  ];
  for (const item of result.results) {
    lines.push(
      "",
      `Workflow: ${item.title}`,
      `Workflow id: ${item.id}`,
      `Version: ${item.version}`,
      `Enabled: ${item.enabled ? "yes" : "no"}`,
      `Archived: ${item.archivedAt ? `yes (${item.archivedAt})` : "no"}`,
      `Saved at: ${item.savedAt}`,
      item.summary ? `Summary: ${item.summary}` : undefined,
      item.toolNames.length ? `Successful tools: ${item.toolNames.join(", ")}` : "Successful tools: none recorded",
      item.outputShape.length ? `Output shape: ${item.outputShape.join("; ")}` : undefined,
      item.score !== undefined ? `Score: ${item.score}` : undefined,
      `Files: ${item.markdownPath}`,
      "Next: call ambient_workflows_describe with this exact id before ambient_workflows_inject.",
    );
  }
  if (result.results.length === 0) lines.push("No enabled recorded workflow playbooks matched. This search does not inspect legacy compiler workflows.");
  return lines.filter(Boolean).join("\n");
}

export function ambientWorkflowsDescribeText(result: AmbientWorkflowPlaybookDescription): string {
  const lines: Array<string | undefined> = [
    "Ambient Workflows playbook description",
    `Workflow: ${result.title}`,
    `Workflow id: ${result.id}`,
    `Version: ${result.version}`,
    `Enabled: ${result.enabled ? "yes" : "no"}`,
    `Archived: ${result.archivedAt ? `yes (${result.archivedAt})` : "no"}`,
    `Saved at: ${result.savedAt}`,
    result.summary ? `Summary: ${result.summary}` : undefined,
    `Successful tools: ${result.toolNames.join(", ") || "none recorded"}`,
    result.outputShape.length ? `Output shape: ${result.outputShape.join("; ")}` : undefined,
    result.versions.length ? `Versions: ${result.versions.map((version) => `v${version.version}${version.restoredFromVersion ? ` restored-from-v${version.restoredFromVersion}` : ""}`).join(", ")}` : undefined,
    `Manifest: ${result.manifestPath}`,
    `Markdown: ${result.markdownPath}`,
    `Sidecar: ${result.sidecarPath}`,
    "",
    "Playbook:",
    `Intent: ${result.playbook?.intent ?? result.summary}`,
    ...(result.playbook?.inputs.length ? ["Inputs:", ...result.playbook.inputs.map((item) => `- ${item}`)] : []),
    ...(result.playbook?.successfulExamples.length ? ["Successful tool examples:", ...result.playbook.successfulExamples.map(ambientWorkflowToolExampleLine)] : []),
    ...(result.playbook?.doNot.length ? ["Do Not:", ...result.playbook.doNot.map((item) => `- ${item.toolName ? `${item.toolName}: ` : ""}${item.status} - ${item.reason}`)] : []),
    ...(result.playbook?.validation.length ? ["Validation:", ...result.playbook.validation.map((item) => `- ${item}`)] : []),
    "",
    "Guidance:",
    ...result.guidance.map((item) => `- ${item}`),
    result.markdownIncluded ? "" : undefined,
    result.markdownIncluded ? `Workflow markdown${result.markdownTruncated ? " (truncated)" : ""}:` : undefined,
    result.markdownIncluded ? result.markdownPreview : undefined,
  ];
  return lines.filter(Boolean).join("\n");
}

export function ambientWorkflowsUpdateText(result: AmbientWorkflowPlaybookDescription): string {
  return [
    "Ambient Workflows playbook updated",
    `Workflow: ${result.title}`,
    `Workflow id: ${result.id}`,
    `Version: ${result.version}`,
    `Updated at: ${result.updatedAt ?? result.savedAt}`,
    "",
    "Next: describe the workflow again before injecting it into chat context.",
  ].join("\n");
}

export function ambientWorkflowsArchiveText(result: AmbientWorkflowPlaybookDescription): string {
  return [
    "Ambient Workflows playbook archived",
    `Workflow: ${result.title}`,
    `Workflow id: ${result.id}`,
    `Version: ${result.version}`,
    `Archived at: ${result.archivedAt ?? result.updatedAt ?? result.savedAt}`,
    result.archivedReason ? `Reason: ${result.archivedReason}` : undefined,
    "",
    "Archived playbooks are hidden from default search and cannot be injected until unarchived.",
  ].filter(Boolean).join("\n");
}

export function ambientWorkflowsUnarchiveText(result: AmbientWorkflowPlaybookDescription): string {
  return [
    "Ambient Workflows playbook unarchived",
    `Workflow: ${result.title}`,
    `Workflow id: ${result.id}`,
    `Version: ${result.version}`,
    `Updated at: ${result.updatedAt ?? result.savedAt}`,
    "",
    "This playbook can appear in default search again when enabled.",
  ].join("\n");
}

export function ambientWorkflowsRestoreVersionText(result: AmbientWorkflowPlaybookDescription): string {
  return [
    "Ambient Workflows playbook version restored",
    `Workflow: ${result.title}`,
    `Workflow id: ${result.id}`,
    `Version: ${result.version}`,
    `Updated at: ${result.updatedAt ?? result.savedAt}`,
    "",
    "The restored content was saved as a new current version.",
  ].join("\n");
}

export function ambientWorkflowsPreflightDescribeText(result: AmbientWorkflowPlaybookDescription): string {
  return [
    "Ambient Workflows preflight description",
    "Injection not attached: this playbook had not been described yet in this thread.",
    ambientWorkflowsDescribeText(result),
    "",
    "Next: if this playbook is still relevant, retry ambient_workflows_inject with the same id and version.",
  ].join("\n");
}

export function ambientWorkflowsInjectText(result: AmbientWorkflowPlaybookInjection): string {
  return [
    "Ambient Workflows playbook injected",
    `Workflow: ${result.playbook.title}`,
    `Workflow id: ${result.playbook.id}`,
    `Version: ${result.playbook.version}`,
    `Injected at: ${result.injectedAt}`,
    "",
    result.guidanceMarkdown,
  ].join("\n");
}

function workflowRecordingDescriptionForVersion(
  current: WorkflowRecordingLibraryDescription,
  requestedVersion: number,
): WorkflowRecordingLibraryDescription {
  const version = current.versions.find((candidate) => candidate.version === requestedVersion);
  if (!version) throw new Error(`Workflow recording version not found: ${current.id} v${requestedVersion}`);
  const sidecar = readJson(version.sidecarPath);
  const manifest = readJson(version.manifestPath);
  const playbook = playbookFromSidecar(sidecar);
  const currentEntry = { ...current };
  delete currentEntry.playbook;
  delete currentEntry.manifest;
  return {
    ...currentEntry,
    title: version.title || current.title,
    version: version.version,
    savedAt: version.savedAt,
    manifestPath: version.manifestPath,
    markdownPath: version.markdownPath,
    sidecarPath: version.sidecarPath,
    transcriptPath: version.transcriptPath,
    summary: playbook?.intent ?? version.title ?? current.summary,
    toolNames: Array.from(new Set((playbook?.successfulExamples ?? []).map((example) => example.toolName).filter(Boolean))).sort(),
    outputShape: playbook?.outputShape ?? [],
    markdownPreview: "",
    ...(playbook ? { playbook } : {}),
    ...(manifest && typeof manifest === "object" && !Array.isArray(manifest) ? { manifest: manifest as Record<string, unknown> } : {}),
  };
}

function ambientWorkflowGuidance(description: WorkflowRecordingLibraryDescription): string[] {
  return [
    "Treat this as recorded guidance from a confirmed prior run, not as code to execute.",
    "Injection is non-executing guidance only; continue through the normal chat/tool loop.",
    "Use successful tool examples as examples of argument shape and sequencing.",
    "Respect Do Not patterns before retrying similar tools or approaches.",
    "Validate live/current facts when the user asks for current information.",
    "Do not inject transcript content beyond the bounded playbook summary and examples.",
    ...(description.archivedAt ? ["This playbook is archived; unarchive it before injecting or scheduling it."] : []),
    `Use ambient_workflows_inject id="${description.id}" version=${description.version} only after this description is relevant.`,
  ];
}

function ambientWorkflowInjectionMarkdown(description: AmbientWorkflowPlaybookDescription): string {
  const playbook = description.playbook;
  const lines = [
    "# Injected Workflow Playbook",
    "",
    `Workflow: ${description.title}`,
    `Workflow id: ${description.id}`,
    `Version: ${description.version}`,
    "",
    "## Intent",
    playbook?.intent ?? description.summary,
    "",
    "## Inputs",
    ...(playbook?.inputs.length ? playbook.inputs.map((item) => `- ${item}`) : ["- Infer required inputs from the user request and ask only if necessary."]),
    "",
    "## Successful tool examples",
    ...(playbook?.successfulExamples.length ? playbook.successfulExamples.map(ambientWorkflowToolExampleLine) : ["- No successful tool examples were recorded."]),
    "",
    "## Do Not",
    ...(playbook?.doNot.length ? playbook.doNot.map((item) => `- ${item.toolName ? `${item.toolName}: ` : ""}${item.status} - ${item.reason}`) : ["- No failed approaches were recorded."]),
    "",
    "## Validation",
    ...(playbook?.validation.length ? playbook.validation.map((item) => `- ${item}`) : ["- Validate the result against the current user request before finalizing."]),
    "",
    "## Output shape",
    ...(playbook?.outputShape.length ? playbook.outputShape.map((item) => `- ${item}`) : ["- Return a concise answer with source/evidence notes where applicable."]),
    ...(description.markdownPreview
      ? [
          "",
          "## Bounded workflow.md excerpt",
          description.markdownPreview,
        ]
      : []),
  ];
  return lines.join("\n");
}

function ambientWorkflowToolExampleLine(example: WorkflowRecordingPlaybookDraft["successfulExamples"][number]): string {
  return [
    `- ${example.toolName}`,
    example.inputPreview ? `input: ${example.inputPreview}` : undefined,
    example.resultPreview ? `result: ${example.resultPreview}` : undefined,
    example.artifactPath ? `artifact: ${example.artifactPath}` : undefined,
  ]
    .filter(Boolean)
    .join(" | ");
}

function playbookFromSidecar(value: unknown): WorkflowRecordingPlaybookDraft | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const playbook = (value as Record<string, unknown>).playbook;
  if (!playbook || typeof playbook !== "object" || Array.isArray(playbook)) return undefined;
  return playbook as WorkflowRecordingPlaybookDraft;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readText(path));
  } catch {
    return undefined;
  }
}

function readText(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function boundedText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
}

function boundedMarkdownChars(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(Math.floor(value), AMBIENT_WORKFLOW_MAX_MARKDOWN_CHARS));
}

export function ambientWorkflowCatalogVersion(entries: WorkflowRecordingLibraryEntry[]): string {
  const source = entries.map((entry) => `${entry.id}:${entry.version}:${entry.enabled}:${entry.archivedAt ?? ""}:${entry.savedAt}`).join("|");
  return `ambient-workflows-v1:${createHash("sha256").update(source).digest("hex").slice(0, 12)}`;
}
