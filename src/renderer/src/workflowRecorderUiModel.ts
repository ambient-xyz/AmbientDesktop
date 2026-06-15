import type {
  WorkflowInjectedPlaybookMetadata,
  WorkflowRecordingLibraryEntry,
  WorkflowRecordingPlaybookDraft,
  WorkflowRecordingReviewDraftUpdate,
  WorkflowRecordingState,
} from "../../shared/types";

export interface WorkflowRecorderSurfaceModel {
  legacyCompilerEnabled: boolean;
  navLabel: string;
  homeTitle: string;
  sidebarTitle: string;
  primaryCreateLabel: string;
  newWorkflowLabel: string;
  newWorkflowDetail: string;
  folderLabel: string;
  newFolderLabel: string;
  refreshLabel: string;
  emptyFolderLabel: string;
  homeTooltip: string;
  foldersTooltip: string;
  workflowTooltip: string;
  helpText: string;
  homeExplainer: string[];
  recordingChatEmptyState?: {
    title: string;
    paragraphs: string[];
  };
  startPane: {
    title: string;
    detail: string;
    requestLabel: string;
    requestTooltip: string;
    requestPlaceholder: string;
    bannerTitle: string;
    bannerDetail: string;
    stopButtonLabel: string;
    disabledStartLabel: string;
    disabledStartTitle: string;
    cards: Array<{ title: string; detail: string; tone: "info" | "success" | "warning" }>;
  };
  chatBanner: {
    recordingTitle: string;
    stoppedTitle: string;
    stopButtonLabel: string;
    stopAndReviewButtonLabel: string;
    stopAndReviewButtonTitle: string;
    stoppedButtonLabel: string;
    reviewButtonLabel: string;
    reviewButtonTitle: string;
    retryReviewButtonLabel: string;
    retryReviewButtonTitle: string;
    confirmButtonLabel: string;
    confirmButtonTitle: string;
    applySummaryButtonLabel: string;
    applySummaryButtonTitle: string;
  };
  legacyHidden: {
    title: string;
    detail: string;
    enableInstruction: string;
  };
}

export interface WorkflowRecorderReviewModel {
  available: boolean;
  title: string;
  detail: string;
  statusLabel: string;
  intent: string;
  metrics: Array<{ label: string; value: string }>;
  sections: Array<{ title: string; items: string[]; emptyLabel: string }>;
}

export interface WorkflowRecorderReviewEditorFields {
  intent: string;
  inputs: string;
  successfulExamples: string;
  doNot: string;
  validation: string;
  outputShape: string;
}

export interface WorkflowRecorderLibrarySidebarRow {
  id: string;
  title: string;
  preview: string;
  statusLabel: string;
  enabled: boolean;
  version: number;
  versionCount: number;
  toolLabel: string;
}

export interface WorkflowRecorderEditWithAmbientModel {
  buttonLabel: string;
  buttonTitle: string;
  draftPrefix: string;
  context: {
    id: string;
    title: string;
    version: number;
    manifestPath: string;
    markdownPath: string;
    sidecarPath: string;
    transcriptPath: string;
  };
  browserPreviewPath: string;
}

export interface WorkflowRecorderInjectedPlaybookChip {
  label: string;
  tooltip: string;
  workflowId: string;
  version: number;
}

export interface WorkflowRecorderStartActionState {
  disabled: boolean;
  title: string;
  needsRequest: boolean;
}

export function workflowRecorderLegacyCompilerEnabled(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  if (typeof raw !== "string") return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function workflowRecorderStartActionState(input: {
  request: string;
  busy?: boolean;
  readyTitle: string;
  emptyTitle?: string;
}): WorkflowRecorderStartActionState {
  const needsRequest = input.request.trim().length === 0;
  if (needsRequest) {
    return {
      disabled: true,
      title: input.emptyTitle ?? "Type a recording goal before starting.",
      needsRequest: true,
    };
  }
  if (input.busy) {
    return {
      disabled: true,
      title: "Starting workflow recording.",
      needsRequest: false,
    };
  }
  return {
    disabled: false,
    title: input.readyTitle,
    needsRequest: false,
  };
}

export function workflowRecorderInjectedPlaybookChip(metadata: unknown): WorkflowRecorderInjectedPlaybookChip | undefined {
  const metadataRecord = recordValue(metadata);
  const resultDetails = recordValue(metadataRecord?.toolResultDetails);
  const playbook = workflowInjectedPlaybookMetadata(recordValue(resultDetails?.workflowPlaybook) ?? recordValue(metadataRecord?.workflowPlaybook));
  if (!playbook || playbook.status !== "injected" || !playbook.injected) return undefined;
  const sourceLabel = playbook.title || playbook.id;
  const toolSummary = playbook.toolNames.length ? `Tools: ${playbook.toolNames.slice(0, 4).join(", ")}` : "No captured tool examples";
  const outputSummary = playbook.outputShape.length ? `Output: ${playbook.outputShape.slice(0, 2).join("; ")}` : "No output shape captured";
  return {
    label: `Injected playbook · ${sourceLabel} v${playbook.version}`,
    tooltip: [sourceLabel, `v${playbook.version}`, toolSummary, outputSummary, playbook.markdownTruncated ? "Markdown was bounded" : undefined]
      .filter(Boolean)
      .join(" · "),
    workflowId: playbook.id,
    version: playbook.version,
  };
}

export function workflowRecorderSurfaceModel(input: { legacyCompilerEnabled?: boolean } = {}): WorkflowRecorderSurfaceModel {
  const legacyCompilerEnabled = Boolean(input.legacyCompilerEnabled);
  if (legacyCompilerEnabled) {
    return {
      legacyCompilerEnabled,
      navLabel: "Workflow Agents",
      homeTitle: "Workflow Agents",
      sidebarTitle: "Workflow Agents",
      primaryCreateLabel: "New Workflow",
      newWorkflowLabel: "New Workflow",
      newWorkflowDetail: "Discovery",
      folderLabel: "Workflow Agents",
      newFolderLabel: "New Workflow Folder",
      refreshLabel: "Refresh Workflow Agents",
      emptyFolderLabel: "No workflow agents",
      homeTooltip: "Workflow Agents home highlights running work, review needs, failures, completions, and shortcuts into focused views.",
      foldersTooltip: "Workflow folders group workflow threads without changing their underlying project, run history, or audit trail.",
      workflowTooltip: "New Workflow starts a Workflow Agent thread, asks discovery questions, and compiles an approved plan into a reviewable program.",
      helpText:
        "Workflow Agents are project-like workflow threads that discover scope, compile a reviewable program, and preserve graph, source, run, and audit history. Folders organize workflow threads separately from Local Task automation folders.",
      homeExplainer: [
        "Workflow Agents organize repeatable project workflows as thread-like records with discovery, diagrams, generated programs, runs, approvals, and audits. Local Tasks remain available as a supporting queue for coding-agent jobs.",
        "Use Home to monitor workflow activity. Creation, scheduling, and run review each have their own tab so the project, execution type, trigger, and review surface stay explicit.",
      ],
      startPane: {
        title: "New Workflow",
        detail: "Create a Workflow Agent thread by describing the repeatable process and answering locked discovery questions.",
        requestLabel: "Request",
        requestTooltip: "Describe the repeatable process that should become a Workflow Agent thread.",
        requestPlaceholder: "Workflow request",
        bannerTitle: "Legacy compiler mode is enabled.",
        bannerDetail: "Discovery, compile, graph, versions, runs, and audits are available in this developer mode.",
        stopButtonLabel: "Stop Workflow",
        disabledStartLabel: "Start recording",
        disabledStartTitle: "Workflow Recorder mode is disabled while the legacy compiler flag is enabled.",
        cards: [],
      },
      chatBanner: {
        recordingTitle: "Legacy workflow compiler enabled",
        stoppedTitle: "Legacy workflow compiler enabled",
        stopButtonLabel: "Stop Workflow",
        stopAndReviewButtonLabel: "Stop and request review",
        stopAndReviewButtonTitle: "Workflow Recorder review is disabled while the legacy compiler flag is enabled.",
        stoppedButtonLabel: "Recording stopped",
        reviewButtonLabel: "Request review",
        reviewButtonTitle: "Workflow Recorder review is disabled while the legacy compiler flag is enabled.",
        retryReviewButtonLabel: "Retry review",
        retryReviewButtonTitle: "Workflow Recorder review retry is disabled while the legacy compiler flag is enabled.",
        confirmButtonLabel: "Confirm",
        confirmButtonTitle: "Workflow Recorder confirmation is disabled while the legacy compiler flag is enabled.",
        applySummaryButtonLabel: "Apply summary",
        applySummaryButtonTitle: "Workflow Recorder summary application is disabled while the legacy compiler flag is enabled.",
      },
      legacyHidden: {
        title: "Legacy Workflow Agent",
        detail: "The legacy workflow compiler is enabled.",
        enableInstruction: "Unset AMBIENT_LEGACY_WORKFLOW_COMPILER to return to Workflow Recorder mode.",
      },
    };
  }

  return {
    legacyCompilerEnabled,
    navLabel: "Workflow Recordings",
    homeTitle: "Workflow Recordings",
    sidebarTitle: "Workflow Recordings",
    primaryCreateLabel: "New Workflow Recording",
    newWorkflowLabel: "New Workflow Recording",
    newWorkflowDetail: "Record",
    folderLabel: "Recordings",
    newFolderLabel: "New Recording Folder",
    refreshLabel: "Refresh Workflow Recordings",
    emptyFolderLabel: "No workflow recordings",
    homeTooltip: "Workflow Recordings home shows saved playbooks, active recordings, review drafts, and reusable workflow guidance.",
    foldersTooltip: "Workflow recording folders group saved playbooks and recording drafts without changing the project or chat they were captured from.",
    workflowTooltip: "New Workflow Recording starts a normal Ambient chat wrapper. Ambient records successful tool calls and failed approaches, then summarizes the workflow when you stop recording.",
    helpText:
      "Workflow Recordings are project-like chat wrappers that capture successful tool calls, failed approaches, user intent, and validation evidence. Saved recordings become searchable playbooks that can be injected like bounded skills.",
    homeExplainer: [
      "Workflow Recordings replace compile-first Workflow Agents by default. Start with normal Ambient chat behavior, record the process, then save a confirmed playbook with successful tool examples and Do Not patterns.",
      "Use Home to monitor recording drafts, saved playbooks, scheduled work, and run review. Legacy workflow compiler views remain hidden unless the legacy flag is enabled for development.",
    ],
    recordingChatEmptyState: {
      title: "Workflow Recorder",
      paragraphs: [
        "Record one successful run of a repeatable task. This chat uses the normal Ambient project loop while the recorder captures intent, tool calls, result shapes, failed approaches, and validation evidence.",
        "Do the real work here, including the inputs, decisions, sources, and proof that make the process reusable.",
        "When the run has enough signal, Review with Ambient turns the recording into a redacted draft playbook you can edit, confirm, and later inject into matching chats.",
      ],
    },
    startPane: {
      title: "New Workflow Recording",
      detail: "Use Ambient normally. Ambient will record intent, successful tool calls, failed approaches, and validation evidence, then summarize the workflow when you stop recording.",
      requestLabel: "Recording goal",
      requestTooltip: "Describe the task you want to perform in normal chat. Phase 1 will use this to start the recorder thread.",
      requestPlaceholder: "Example: Find upcoming romantic theater events near Scottsdale and rank them for date night.",
      bannerTitle: "Start a Workflow Recording",
      bannerDetail:
        "This creates a normal Ambient chat thread with recorder state. The goal is copied into the composer so the first model call still follows the standard chat path.",
      stopButtonLabel: "Stop Workflow",
      disabledStartLabel: "Start recording",
      disabledStartTitle: "Create a normal chat thread and begin recording workflow evidence.",
      cards: [
        {
          title: "Normal chat first",
          detail: "The recorder wraps the stable Projects/Chats loop instead of asking Ambient to compile executable IR before the task has succeeded once.",
          tone: "success",
        },
        {
          title: "Successful examples matter",
          detail: "Tool names, arguments, result shapes, and validation evidence are captured so later runs can inject concrete examples.",
          tone: "info",
        },
        {
          title: "Old compiler is hidden",
          detail: "Discovery, compile, graph, and generated-program controls stay behind AMBIENT_LEGACY_WORKFLOW_COMPILER=1.",
          tone: "warning",
        },
      ],
    },
    chatBanner: {
      recordingTitle: "Workflow Started. Press \"Review with Ambient\" to stop and review.",
      stoppedTitle: "Workflow stopped. Review is ready.",
      stopButtonLabel: "Stop only",
      stopAndReviewButtonLabel: "Review with Ambient",
      stopAndReviewButtonTitle: "Stop recording and stream a redacted draft playbook review through Ambient. This is the default review path before confirmation.",
      stoppedButtonLabel: "Recording stopped",
      reviewButtonLabel: "Review with Ambient",
      reviewButtonTitle: "Stream the redacted draft playbook through Ambient for a user-confirmable summary.",
      retryReviewButtonLabel: "Retry review",
      retryReviewButtonTitle: "Retry the Ambient review with the same captured playbook. Transient stalls follow the normal aggressive retry defaults.",
      confirmButtonLabel: "Confirm playbook",
      confirmButtonTitle: "Mark this stopped recording review as confirmed so it can be saved and indexed later.",
      applySummaryButtonLabel: "Apply latest Ambient summary",
      applySummaryButtonTitle: "Parse the latest structured Ambient workflow summary in this chat into a revised draft playbook.",
    },
    legacyHidden: {
      title: "Legacy Workflow Agent hidden",
      detail:
        "This thread belongs to the old compile-first workflow system. The new default is Workflow Recorder, so legacy compiler tabs and generated-program controls are hidden.",
      enableInstruction: "Relaunch with AMBIENT_LEGACY_WORKFLOW_COMPILER=1 only when you explicitly need to inspect legacy workflow artifacts.",
    },
  };
}

export function workflowRecorderLibrarySidebarRows(entries: WorkflowRecordingLibraryEntry[]): WorkflowRecorderLibrarySidebarRow[] {
  return [...entries]
    .sort((left, right) => Number(right.enabled) - Number(left.enabled) || right.savedAt.localeCompare(left.savedAt) || right.title.localeCompare(left.title))
    .map((entry) => {
      const toolLabel = entry.toolNames.length ? entry.toolNames.slice(0, 2).join(", ") : "No tool examples";
      return {
        id: entry.id,
        title: entry.title || "Untitled workflow playbook",
        preview: entry.summary || entry.outputShape[0] || "Saved workflow playbook",
        statusLabel: `${entry.enabled ? "Enabled" : "Disabled"} · v${entry.version}`,
        enabled: entry.enabled,
        version: entry.version,
        versionCount: entry.versions.length,
        toolLabel,
      };
    });
}

export function workflowRecorderEditWithAmbientModel(playbook: WorkflowRecordingLibraryEntry): WorkflowRecorderEditWithAmbientModel {
  const title = playbook.title || "Untitled workflow playbook";
  return {
    buttonLabel: "Edit with Ambient",
    buttonTitle: "Open this saved workflow for inspection and prefill a chat edit request.",
    draftPrefix: `I'd like to edit this workflow "${title}" to `,
    context: {
      id: playbook.id,
      title,
      version: playbook.version,
      manifestPath: playbook.manifestPath,
      markdownPath: playbook.markdownPath,
      sidecarPath: playbook.sidecarPath,
      transcriptPath: playbook.transcriptPath,
    },
    browserPreviewPath: playbook.markdownPath,
  };
}

export function workflowRecorderReviewModel(recording: WorkflowRecordingState | undefined): WorkflowRecorderReviewModel {
  const draft = recording?.review?.confirmed ?? recording?.review?.draft;
  if (!draft) {
    return {
      available: false,
      title: "Review draft pending",
      detail: "Stop the recording to capture a draft playbook for review.",
      statusLabel: "Pending",
      intent: "",
      metrics: [],
      sections: [],
    };
  }
  return workflowRecorderReviewModelFromDraft(draft);
}

export function workflowRecorderReviewModelFromDraft(draft: WorkflowRecordingPlaybookDraft): WorkflowRecorderReviewModel {
  const summary = draft.evidenceSummary;
  return {
    available: true,
    title: draft.status === "confirmed" ? "Confirmed workflow playbook" : "Draft workflow playbook",
    detail:
      draft.source === "pi_summary"
        ? "Ambient summary is ready for user review before indexing."
        : "Deterministic evidence draft is ready for Ambient/user correction.",
    statusLabel: draft.status === "confirmed" ? "Confirmed" : "Needs review",
    intent: draft.intent,
    metrics: [
      { label: "Messages", value: String(summary.messageCount) },
      { label: "Successful tools", value: String(summary.successfulToolResultCount) },
      { label: "Failed tools", value: String(summary.failedToolResultCount) },
      { label: "Redactions", value: String(summary.redactionCount) },
    ],
    sections: [
      {
        title: "Successful examples",
        items: draft.successfulExamples.map((example) =>
          [example.toolName, firstPresent(example.inputPreview, example.resultPreview)].filter(Boolean).join(": ")
        ),
        emptyLabel: "No successful tool examples were captured.",
      },
      {
        title: "Do Not",
        items: draft.doNot.map((item) => [item.toolName ?? "Tool", item.status, item.reason].filter(Boolean).join(": ")),
        emptyLabel: "No failed, skipped, or permission-blocked patterns were captured.",
      },
      {
        title: "Validation",
        items: draft.validation,
        emptyLabel: "No validation evidence was captured.",
      },
    ],
  };
}

export function workflowRecorderReviewEditorFieldsFromDraft(draft: WorkflowRecordingPlaybookDraft): WorkflowRecorderReviewEditorFields {
  return {
    intent: draft.intent,
    inputs: draft.inputs.join("\n"),
    successfulExamples: draft.successfulExamples.map(workflowRecorderToolExampleLine).join("\n"),
    doNot: draft.doNot.map(workflowRecorderAvoidPatternLine).join("\n"),
    validation: draft.validation.join("\n"),
    outputShape: draft.outputShape.join("\n"),
  };
}

export function workflowRecorderReviewDraftUpdateFromEditorFields(fields: WorkflowRecorderReviewEditorFields): WorkflowRecordingReviewDraftUpdate {
  return {
    intent: fields.intent.trim(),
    inputs: workflowRecorderEditorLines(fields.inputs),
    successfulExamples: workflowRecorderEditorLines(fields.successfulExamples)
      .map(workflowRecorderToolExampleFromLine)
      .filter((example): example is WorkflowRecordingReviewDraftUpdate["successfulExamples"][number] => Boolean(example))
      .slice(0, 12),
    doNot: workflowRecorderEditorLines(fields.doNot)
      .map(workflowRecorderAvoidPatternFromLine)
      .filter((pattern): pattern is WorkflowRecordingReviewDraftUpdate["doNot"][number] => Boolean(pattern))
      .slice(0, 12),
    validation: workflowRecorderEditorLines(fields.validation),
    outputShape: workflowRecorderEditorLines(fields.outputShape),
  };
}

function workflowRecorderToolExampleLine(example: WorkflowRecordingPlaybookDraft["successfulExamples"][number]): string {
  return [example.toolName, example.inputPreview ?? "", example.resultPreview ?? "", example.artifactPath ?? ""].join(" | ").replace(/\s+\|\s+\|\s*$/, "").trim();
}

function workflowRecorderAvoidPatternLine(pattern: WorkflowRecordingPlaybookDraft["doNot"][number]): string {
  return [pattern.status, pattern.toolName ?? "", pattern.reason].join(" | ").trim();
}

function workflowRecorderEditorLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function workflowRecorderToolExampleFromLine(line: string): WorkflowRecordingReviewDraftUpdate["successfulExamples"][number] | undefined {
  const parts = line.split("|").map((part) => part.trim());
  const toolName = parts[0];
  if (!toolName) return undefined;
  return {
    toolName,
    ...(parts[1] ? { inputPreview: parts[1] } : {}),
    ...(parts[2] ? { resultPreview: parts[2] } : {}),
    ...(parts[3] ? { artifactPath: parts[3] } : {}),
  };
}

function workflowRecorderAvoidPatternFromLine(line: string): WorkflowRecordingReviewDraftUpdate["doNot"][number] | undefined {
  const parts = line.split("|").map((part) => part.trim());
  const rawStatus = parts[0]?.toLowerCase();
  const status = rawStatus === "permission_blocked" || rawStatus === "skipped" || rawStatus === "failed" ? rawStatus : "failed";
  const toolName = status === rawStatus ? parts[1] : undefined;
  const reason = (status === rawStatus ? parts.slice(2).join(" | ") : parts.join(" | ")).trim();
  if (!reason) return undefined;
  return {
    ...(toolName ? { toolName } : {}),
    status,
    reason,
  };
}

function workflowInjectedPlaybookMetadata(record: Record<string, unknown> | undefined): WorkflowInjectedPlaybookMetadata | undefined {
  if (!record) return undefined;
  const id = nonEmptyString(record.id);
  const version = numberValue(record.version);
  const status = record.status === "preflight-description" || record.status === "injected" ? record.status : undefined;
  if (!id || version === undefined || !status) return undefined;
  return {
    id,
    ...(nonEmptyString(record.title) ? { title: nonEmptyString(record.title) } : {}),
    version: Math.max(1, Math.floor(version)),
    status,
    injected: record.injected === true,
    toolNames: stringArray(record.toolNames),
    outputShape: stringArray(record.outputShape),
    markdownTruncated: record.markdownTruncated === true,
  };
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function firstPresent(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => Boolean(value?.trim()));
}
