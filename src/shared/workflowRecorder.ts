import type {
  ChatMessage,
  StartWorkflowRecordingInput,
  WorkflowRecordingCapture,
  WorkflowRecordingEvent,
  WorkflowRecordingEventStatus,
  WorkflowRecordingPlaybookDraft,
  WorkflowRecordingReviewDraftUpdate,
  WorkflowRecordingReviewState,
  WorkflowRecordingReviewValidationIssue,
  WorkflowRecordingState,
} from "./types";

const WORKFLOW_RECORDING_PREVIEW_CHARS = 700;
const WORKFLOW_RECORDING_SECTION_PREVIEW_CHARS = 500;
const WORKFLOW_RECORDING_REVIEW_PROMPT_EVIDENCE_CHARS = 12_000;
const WORKFLOW_RECORDING_REVIEW_EDIT_ITEM_LIMIT = 12;
const WORKFLOW_RECORDING_REVIEW_VALIDATION_ISSUE_LIMIT = 8;
const WORKFLOW_RECORDING_BROWSER_SOURCE_TOOLS = new Set([
  "browser_open",
  "browser_nav",
  "browser_navigate",
  "browser_snapshot",
  "browser_extract",
  "browser_read",
  "chrome",
]);

interface WorkflowRecordingRedaction {
  text: string;
  redacted: boolean;
  replacementCount: number;
}

interface NormalizedWorkflowRecordingEvidence {
  preview: string;
  inputPreview?: string;
  resultPreview?: string;
  artifactPath?: string;
  redacted: boolean;
  redactionCount: number;
}

export class WorkflowRecordingReviewValidationError extends Error {
  readonly issues: WorkflowRecordingReviewValidationIssue[];

  constructor(issues: WorkflowRecordingReviewValidationIssue[]) {
    super(workflowRecordingReviewValidationMessage(issues));
    this.name = "WorkflowRecordingReviewValidationError";
    this.issues = issues;
  }
}

export function workflowRecordingTitle(goal?: StartWorkflowRecordingInput["goal"]): string {
  const cleaned = cleanSingleLine(goal);
  if (!cleaned) return "Workflow Recording";
  return `Workflow Recording: ${truncate(cleaned, 72)}`;
}

export function startWorkflowRecordingState(input: Pick<StartWorkflowRecordingInput, "goal"> & { now?: string }): WorkflowRecordingState {
  const now = input.now ?? new Date().toISOString();
  const goal = cleanMultiline(input.goal);
  return {
    status: "recording",
    ...(goal ? { goal } : {}),
    startedAt: now,
  };
}

export function stopWorkflowRecordingState(input: {
  current?: WorkflowRecordingState;
  messages: ChatMessage[];
  now?: string;
}): WorkflowRecordingState {
  const now = input.now ?? new Date().toISOString();
  const current = input.current;
  const capture = workflowRecordingCaptureFromMessages(input.messages, now);
  const review = workflowRecordingReviewFromCapture({
    goal: current?.goal,
    capture,
    generatedAt: now,
  });
  return {
    status: "stopped",
    ...(current?.goal ? { goal: current.goal } : {}),
    startedAt: current?.startedAt ?? now,
    stoppedAt: now,
    capture,
    review,
  };
}

export function workflowRecordingCaptureFromMessages(messages: ChatMessage[], capturedAt = new Date().toISOString()): WorkflowRecordingCapture {
  const events = messages
    .filter((message) => message.role === "user" || message.role === "assistant" || message.role === "tool")
    .map((message): WorkflowRecordingEvent => {
      const status = workflowRecordingEventStatus(message);
      const toolName = metadataString(message.metadata?.toolName) ?? metadataString(message.metadata?.registeredName);
      const toolCallId = metadataString(message.metadata?.toolCallId);
      const evidence = normalizeWorkflowRecordingEvidence(message);
      return {
        id: `${message.createdAt}:${message.id}`,
        messageId: message.id,
        kind: message.role === "tool" ? "tool_result" : message.role === "assistant" ? "assistant_message" : "user_message",
        status,
        role: message.role,
        createdAt: message.createdAt,
        preview: evidence.preview,
        ...(evidence.inputPreview ? { inputPreview: evidence.inputPreview } : {}),
        ...(evidence.resultPreview ? { resultPreview: evidence.resultPreview } : {}),
        ...(toolName ? { toolName } : {}),
        ...(toolCallId ? { toolCallId } : {}),
        ...(evidence.artifactPath ? { artifactPath: evidence.artifactPath } : {}),
        ...(evidence.redacted ? { redacted: true, redactionCount: evidence.redactionCount } : {}),
      };
    });

  const toolEvents = events.filter((event) => event.kind === "tool_result");
  const redactedEventCount = events.filter((event) => event.redacted).length;
  const redactionCount = events.reduce((total, event) => total + (event.redactionCount ?? 0), 0);
  return {
    capturedAt,
    messageCount: events.length,
    userMessageCount: events.filter((event) => event.kind === "user_message").length,
    assistantMessageCount: events.filter((event) => event.kind === "assistant_message").length,
    toolResultCount: toolEvents.length,
    successfulToolResultCount: toolEvents.filter((event) => event.status === "succeeded").length,
    failedToolResultCount: toolEvents.filter((event) => event.status === "failed").length,
    skippedToolResultCount: toolEvents.filter((event) => event.status === "skipped").length,
    permissionBlockedToolResultCount: toolEvents.filter((event) => event.status === "permission_blocked").length,
    userCorrectedEventCount: events.filter((event) => event.status === "user_corrected").length,
    redactedEventCount,
    redactionCount,
    events,
  };
}

export function workflowRecordingReviewFromCapture(input: {
  goal?: string;
  capture: WorkflowRecordingCapture;
  generatedAt?: string;
}): WorkflowRecordingReviewState {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const draft = workflowRecordingPlaybookDraftFromCapture({
    goal: input.goal,
    capture: input.capture,
    generatedAt,
  });
  return { status: "draft", draft };
}

export function confirmWorkflowRecordingReviewState(input: {
  current: WorkflowRecordingState;
  now?: string;
}): WorkflowRecordingState {
  const draft = input.current.review?.draft;
  if (input.current.status !== "stopped" || !draft) return input.current;
  const confirmedAt = input.now ?? new Date().toISOString();
  const confirmed: WorkflowRecordingPlaybookDraft = {
    ...draft,
    status: "confirmed",
    confirmedAt,
  };
  return {
    ...input.current,
    review: {
      status: "confirmed",
      draft,
      confirmed,
      ...(input.current.review?.savedPlaybook ? { savedPlaybook: input.current.review.savedPlaybook } : {}),
    },
  };
}

export function applyWorkflowRecordingSummaryState(input: {
  current: WorkflowRecordingState;
  markdown: string;
  now?: string;
}): WorkflowRecordingState {
  const currentDraft = input.current.review?.draft;
  if (input.current.status !== "stopped" || !currentDraft) return input.current;
  const draft = workflowRecordingPlaybookDraftFromMarkdownSummary({
    currentDraft,
    markdown: input.markdown,
    generatedAt: input.now,
  });
  return {
    ...input.current,
    review: {
      status: "draft",
      draft,
      ...(input.current.review?.confirmed ? { confirmed: input.current.review.confirmed } : {}),
      ...(input.current.review?.savedPlaybook ? { savedPlaybook: input.current.review.savedPlaybook } : {}),
    },
  };
}

export function updateWorkflowRecordingReviewDraftState(input: {
  current: WorkflowRecordingState;
  draft: WorkflowRecordingReviewDraftUpdate;
  now?: string;
  source?: WorkflowRecordingPlaybookDraft["source"];
}): WorkflowRecordingState {
  const currentDraft = input.current.review?.draft;
  if (input.current.status !== "stopped" || !currentDraft) return input.current;
  const generatedAt = input.now ?? new Date().toISOString();
  const draft: WorkflowRecordingPlaybookDraft = {
    ...currentDraft,
    status: "draft",
    source: input.source ?? "user_edit",
    generatedAt,
    intent: cleanEditedText(input.draft.intent, currentDraft.intent, WORKFLOW_RECORDING_SECTION_PREVIEW_CHARS),
    inputs: cleanEditedTextList(input.draft.inputs, currentDraft.inputs, WORKFLOW_RECORDING_REVIEW_EDIT_ITEM_LIMIT),
    successfulExamples: cleanEditedToolExamples(input.draft.successfulExamples, currentDraft.successfulExamples),
    doNot: cleanEditedAvoidPatterns(input.draft.doNot, currentDraft.doNot),
    validation: cleanEditedTextList(input.draft.validation, currentDraft.validation, WORKFLOW_RECORDING_REVIEW_EDIT_ITEM_LIMIT),
    outputShape: cleanEditedTextList(input.draft.outputShape, currentDraft.outputShape, WORKFLOW_RECORDING_REVIEW_EDIT_ITEM_LIMIT),
  };
  delete draft.confirmedAt;
  return {
    ...input.current,
    review: {
      status: "draft",
      draft,
      ...(input.current.review?.confirmed ? { confirmed: input.current.review.confirmed } : {}),
      ...(input.current.review?.savedPlaybook ? { savedPlaybook: input.current.review.savedPlaybook } : {}),
    },
  };
}

export function workflowRecordingApplyReviewValidationIssues(input: {
  current: WorkflowRecordingState;
  issues: WorkflowRecordingReviewValidationIssue[];
  now?: string;
}): WorkflowRecordingState | undefined {
  if (!input.current.review) return undefined;
  const now = input.now ?? new Date().toISOString();
  return {
    ...input.current,
    review: {
      ...input.current.review,
      validationIssues: input.issues,
      validationRejectedAt: now,
    },
  };
}

export function validateWorkflowRecordingReviewDraftForReuse(input: {
  current: WorkflowRecordingState;
  draft: WorkflowRecordingReviewDraftUpdate | WorkflowRecordingPlaybookDraft;
}): WorkflowRecordingReviewValidationIssue[] {
  const runTerms = workflowRecordingRunSpecificTerms(input.current);
  if (runTerms.localPaths.length === 0 && runTerms.files.length === 0) return [];

  const issues: WorkflowRecordingReviewValidationIssue[] = [];
  for (const field of workflowRecordingReviewDraftTextFields(input.draft)) {
    for (const term of runTerms.localPaths) {
      if (!containsTerm(field.text, term)) continue;
      issues.push({
        field: field.field,
        term,
        reason: "local_path",
        message: "Durable workflow fields should not include local absolute paths from one recorded run.",
        suggestion: "Replace local paths with reusable roles such as <target directory>, <workspace output file>, or the user-facing location described generically.",
      });
      break;
    }
    if (issues.length >= WORKFLOW_RECORDING_REVIEW_VALIDATION_ISSUE_LIMIT) break;
    for (const term of runTerms.files) {
      if (!containsTerm(field.text, term)) continue;
      issues.push({
        field: field.field,
        term,
        reason: "run_specific_file",
        message: "Durable workflow fields should not include filenames discovered during this run.",
        suggestion: "Replace discovered filenames with reusable roles such as the largest PDF, the second largest PDF, the selected file, or the generated output artifact.",
      });
      break;
    }
    if (issues.length >= WORKFLOW_RECORDING_REVIEW_VALIDATION_ISSUE_LIMIT) break;
  }
  return issues.slice(0, WORKFLOW_RECORDING_REVIEW_VALIDATION_ISSUE_LIMIT);
}

export function assertWorkflowRecordingReviewDraftReusable(input: {
  current: WorkflowRecordingState;
  draft: WorkflowRecordingReviewDraftUpdate | WorkflowRecordingPlaybookDraft;
}): void {
  const issues = validateWorkflowRecordingReviewDraftForReuse(input);
  if (issues.length) throw new WorkflowRecordingReviewValidationError(issues);
}

export function workflowRecordingReviewValidationMessage(issues: WorkflowRecordingReviewValidationIssue[]): string {
  if (!issues.length) return "Workflow recording review draft passed reusable-field validation.";
  return [
    "Rejected durable workflow draft because it includes run-specific evidence.",
    "",
    "Problems:",
    ...issues.map((issue) => `- ${issue.field}: ${issue.message} Found "${issue.term}".`),
    "",
    "Fix:",
    "- Keep the durable playbook generic: describe the repeatable procedure, inputs, validation, and output shape.",
    "- Put run-specific filenames, full paths, timestamps, byte counts, and one-off results only in captured evidence, not in the saved plan.",
    "- Submit another workflow_recording_review_update_draft call with corrected fields.",
  ].join("\n");
}

export function workflowRecordingPlaybookDraftFromMarkdownSummary(input: {
  currentDraft: WorkflowRecordingPlaybookDraft;
  markdown: string;
  generatedAt?: string;
}): WorkflowRecordingPlaybookDraft {
  const sections = markdownSummarySections(input.markdown);
  if (!sections.size) throw new Error("Pi summary must use the expected workflow review headings before it can be applied.");
  const intent = cleanEditedText(firstUsefulText(sectionText(sections, "intent"), input.currentDraft.intent), input.currentDraft.intent, WORKFLOW_RECORDING_SECTION_PREVIEW_CHARS);
  const inputs = cleanEditedTextList(sectionItems(sections, "inputs", input.currentDraft.inputs), input.currentDraft.inputs, WORKFLOW_RECORDING_REVIEW_EDIT_ITEM_LIMIT);
  const successfulExamples = sectionItems(sections, "successful tool examples", [])
    .map(parseMarkdownToolExample)
    .filter((example): example is WorkflowRecordingPlaybookDraft["successfulExamples"][number] => Boolean(example))
    .slice(0, 12);
  const doNot = sectionItems(sections, "do not", [])
    .map(parseMarkdownAvoidPattern)
    .filter((pattern): pattern is WorkflowRecordingPlaybookDraft["doNot"][number] => Boolean(pattern))
    .slice(0, 12);
  const validation = cleanEditedTextList(sectionItems(sections, "validation", input.currentDraft.validation), input.currentDraft.validation, WORKFLOW_RECORDING_REVIEW_EDIT_ITEM_LIMIT);
  const outputShape = cleanEditedTextList(sectionItems(sections, "output shape", input.currentDraft.outputShape), input.currentDraft.outputShape, WORKFLOW_RECORDING_REVIEW_EDIT_ITEM_LIMIT);
  return {
    ...input.currentDraft,
    status: "draft",
    source: "pi_summary",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    intent,
    inputs,
    successfulExamples: cleanEditedToolExamples(successfulExamples, input.currentDraft.successfulExamples),
    doNot: cleanEditedAvoidPatterns(doNot, input.currentDraft.doNot),
    validation,
    outputShape,
  };
}

function cleanEditedToolExamples(
  examples: WorkflowRecordingReviewDraftUpdate["successfulExamples"],
  fallback: WorkflowRecordingPlaybookDraft["successfulExamples"],
): WorkflowRecordingPlaybookDraft["successfulExamples"] {
  const cleaned = examples
    .map((example) => {
      const toolName = cleanEditedText(example.toolName, undefined, 120);
      if (!toolName) return undefined;
      const inputPreview = cleanEditedText(example.inputPreview, undefined, WORKFLOW_RECORDING_SECTION_PREVIEW_CHARS);
      const resultPreview = cleanEditedText(example.resultPreview, undefined, WORKFLOW_RECORDING_SECTION_PREVIEW_CHARS);
      const artifactPath = cleanEditedText(example.artifactPath, undefined, 500);
      return {
        toolName,
        ...(inputPreview ? { inputPreview } : {}),
        ...(resultPreview ? { resultPreview } : {}),
        ...(artifactPath ? { artifactPath } : {}),
      };
    })
    .filter((example): example is WorkflowRecordingPlaybookDraft["successfulExamples"][number] => Boolean(example))
    .slice(0, WORKFLOW_RECORDING_REVIEW_EDIT_ITEM_LIMIT);
  return cleaned.length ? cleaned : fallback;
}

function cleanEditedAvoidPatterns(
  patterns: WorkflowRecordingReviewDraftUpdate["doNot"],
  fallback: WorkflowRecordingPlaybookDraft["doNot"],
): WorkflowRecordingPlaybookDraft["doNot"] {
  const cleaned = patterns
    .map((pattern) => {
      const reason = cleanEditedText(pattern.reason, undefined, WORKFLOW_RECORDING_SECTION_PREVIEW_CHARS);
      if (!reason) return undefined;
      const toolName = cleanEditedText(pattern.toolName, undefined, 120);
      return {
        ...(toolName ? { toolName } : {}),
        status: pattern.status,
        reason,
      };
    })
    .filter((pattern): pattern is WorkflowRecordingPlaybookDraft["doNot"][number] => Boolean(pattern))
    .slice(0, WORKFLOW_RECORDING_REVIEW_EDIT_ITEM_LIMIT);
  return cleaned.length ? cleaned : fallback;
}

function cleanEditedTextList(values: string[], fallback: string[], limit: number): string[] {
  const cleaned = values
    .map((value) => cleanEditedText(value, undefined, WORKFLOW_RECORDING_SECTION_PREVIEW_CHARS))
    .filter((value): value is string => Boolean(value))
    .slice(0, limit);
  return cleaned.length ? cleaned : fallback;
}

function workflowRecordingRunSpecificTerms(current: WorkflowRecordingState): { localPaths: string[]; files: string[] } {
  const events = current.capture?.events ?? [];
  const userText = events
    .filter((event) => event.kind === "user_message")
    .map(workflowRecordingEventSearchText)
    .join("\n")
    .toLowerCase();
  const evidenceText = events
    .filter((event) => event.kind !== "user_message")
    .map(workflowRecordingEventSearchText)
    .join("\n");

  const localPaths = uniqueTerms(extractLocalPathTerms(evidenceText));
  const files = uniqueTerms(extractFileLikeTerms(evidenceText).filter((term) => !userText.includes(term.toLowerCase())));
  return { localPaths, files };
}

function workflowRecordingEventSearchText(event: WorkflowRecordingEvent): string {
  return [event.preview, event.inputPreview, event.resultPreview, event.artifactPath].filter((value): value is string => Boolean(value)).join("\n");
}

function workflowRecordingReviewDraftTextFields(
  draft: WorkflowRecordingReviewDraftUpdate | WorkflowRecordingPlaybookDraft,
): Array<{ field: string; text: string }> {
  const fields: Array<{ field: string; text: string }> = [];
  const push = (field: string, value: unknown) => {
    if (typeof value === "string" && value.trim()) fields.push({ field, text: value });
  };
  push("intent", draft.intent);
  draft.inputs.forEach((value, index) => push(`inputs[${index}]`, value));
  draft.successfulExamples.forEach((example, index) => {
    push(`successfulExamples[${index}].inputPreview`, example.inputPreview);
    push(`successfulExamples[${index}].resultPreview`, example.resultPreview);
  });
  draft.doNot.forEach((pattern, index) => {
    push(`doNot[${index}].reason`, pattern.reason);
  });
  draft.validation.forEach((value, index) => push(`validation[${index}]`, value));
  draft.outputShape.forEach((value, index) => push(`outputShape[${index}]`, value));
  return fields;
}

function extractLocalPathTerms(value: string): string[] {
  const terms: string[] = [];
  const pathPattern = /(?:file:\/\/)?\/(?:Users|Volumes|private|var|tmp|opt|home|mnt|Applications)\/[^\s"'<>),;]+/g;
  for (const match of value.matchAll(pathPattern)) {
    const term = match[0]?.replace(/[.,:;)\]}]+$/g, "");
    if (term && term.length >= 8) terms.push(term);
  }
  const windowsPathPattern = /\b[A-Za-z]:\\[^\s"'<>),;]+/g;
  for (const match of value.matchAll(windowsPathPattern)) {
    const term = match[0]?.replace(/[.,:;)\]}]+$/g, "");
    if (term && term.length >= 6) terms.push(term);
  }
  return terms;
}

function extractFileLikeTerms(value: string): string[] {
  const terms: string[] = [];
  const filePattern =
    /(?:^|[/"'(\[\s])([A-Za-z0-9][A-Za-z0-9._ -]{1,140}\.(?:pdf|html?|csv|tsv|xlsx?|docx?|pptx?|txt|md|json|jsonl|png|jpe?g|gif|webp|svg|zip|tar|gz|py|ts|tsx|js|jsx|css))(?=$|[\s"'.,:;)\]])/gi;
  for (const match of value.matchAll(filePattern)) {
    const term = match[1]?.replace(/[.,:;)\]}]+$/g, "").trim();
    if (term && term.length >= 5) terms.push(term);
  }
  return terms;
}

function uniqueTerms(values: string[]): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(value);
  }
  return terms.sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function containsTerm(value: string, term: string): boolean {
  return value.toLowerCase().includes(term.toLowerCase());
}

function cleanEditedText(value: unknown, fallback: string | undefined, maxChars: number): string {
  const cleaned = cleanMultiline(value);
  const redacted = redactWorkflowRecordingText(truncate(cleaned, maxChars)).text;
  return cleanMultiline(redacted) ?? fallback ?? "";
}

export function workflowRecordingPlaybookDraftFromCapture(input: {
  goal?: string;
  capture: WorkflowRecordingCapture;
  generatedAt?: string;
}): WorkflowRecordingPlaybookDraft {
  const capture = input.capture;
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const userInputs = capture.events
    .filter((event) => event.kind === "user_message" && event.preview)
    .map((event) => event.preview)
    .slice(0, 5);
  const assistantEvidence = capture.events
    .filter((event) => event.kind === "assistant_message" && event.preview)
    .map((event) => event.preview)
    .slice(-3);
  const successfulExamples = capture.events
    .filter((event) => event.kind === "tool_result" && event.status === "succeeded" && event.toolName)
    .map((event) => ({
      toolName: event.toolName ?? "tool",
      ...(event.inputPreview ? { inputPreview: event.inputPreview } : {}),
      ...(event.resultPreview ? { resultPreview: event.resultPreview } : {}),
      ...(event.artifactPath ? { artifactPath: event.artifactPath } : {}),
    }))
    .slice(0, 12);
  const doNot = capture.events
    .filter((event): event is WorkflowRecordingEvent & { status: "failed" | "skipped" | "permission_blocked" } =>
      event.kind === "tool_result" && (event.status === "failed" || event.status === "skipped" || event.status === "permission_blocked")
    )
    .map((event) => ({
      ...(event.toolName ? { toolName: event.toolName } : {}),
      status: event.status,
      reason: firstUsefulText(event.resultPreview, event.preview) ?? `${event.status} tool event captured.`,
    }))
    .slice(0, 12);
  const validation = [
    ...successfulExamples
      .map((example) => firstUsefulText(example.resultPreview, example.inputPreview))
      .filter((value): value is string => Boolean(value))
      .slice(0, 3),
    ...assistantEvidence.slice(0, 2),
  ];

  return {
    status: "draft",
    source: "deterministic_capture",
    generatedAt,
    sourceCapturedAt: capture.capturedAt,
    intent: firstUsefulText(input.goal, userInputs[0], "Review this stopped workflow recording and confirm the reusable intent.")!,
    inputs: userInputs,
    successfulExamples,
    doNot,
    validation: validation.length ? validation : ["Review the captured assistant answer and successful tool results before confirming this playbook."],
    outputShape: [
      "Intent summary",
      "Successful tool-call examples",
      "Do Not patterns for failed, skipped, or permission-blocked approaches",
      "Validation evidence and final user-facing result shape",
    ],
    evidenceSummary: {
      messageCount: capture.messageCount,
      toolResultCount: capture.toolResultCount,
      successfulToolResultCount: capture.successfulToolResultCount,
      failedToolResultCount: capture.failedToolResultCount,
      skippedToolResultCount: capture.skippedToolResultCount ?? 0,
      permissionBlockedToolResultCount: capture.permissionBlockedToolResultCount ?? 0,
      redactionCount: capture.redactionCount ?? 0,
    },
  };
}

export function workflowRecordingReviewPromptFromState(
  recording: WorkflowRecordingState | undefined,
  input: { feedback?: string } = {},
): string | undefined {
  const draft = recording?.review?.draft;
  if (!draft) return undefined;
  return workflowRecordingReviewPromptFromDraft(draft, input);
}

export function workflowRecordingReviewPromptFromDraft(
  draft: WorkflowRecordingPlaybookDraft,
  input: { feedback?: string } = {},
): string {
  const safeDraft = redactWorkflowRecordingText(JSON.stringify(draft, null, 2)).text;
  const evidence = truncate(safeDraft, WORKFLOW_RECORDING_REVIEW_PROMPT_EVIDENCE_CHARS);
  const feedback = cleanMultiline(redactWorkflowRecordingText(input.feedback).text);
  return [
    "Review this stopped Workflow Recording and edit its durable workflow playbook draft.",
    "",
    "Available action:",
    "- Use workflow_recording_review_update_draft to write the revised draft. The side panel only changes when that tool succeeds.",
    "- You may use workflow_recording_review_read_draft to inspect the current draft before editing.",
    "- Do not try to edit files, continue the recorded task, inspect the workspace, or return the playbook only as Markdown.",
    "",
    "Reusable-field rules:",
    "- Use only the redacted evidence below; do not invent tools, outputs, private data, or hidden steps.",
    "- Durable fields must describe the reusable procedure, not this one recorded run.",
    "- Do not put run-specific filenames, full local paths, one-off URLs, timestamps, byte counts, or discovered result names in intent, inputs, successful examples, Do Not, validation, or output shape.",
    "- Replace specific run evidence with reusable roles such as target directory, two largest PDFs, selected file, generated HTML output, or workspace artifact.",
    "- Preserve successful tool-call shapes because they are the main repeatability signal, but make their previews reusable rather than naming the exact files found.",
    "- Preserve failed, skipped, and permission-blocked approaches in a Do Not section.",
    "- Do not ask for or reveal API keys, OAuth tokens, credential paths, raw connector private data, or local secret file contents.",
    "- If evidence is weak, say what is missing instead of filling gaps.",
    "- If workflow_recording_review_update_draft rejects the draft, read the concrete rejection, fix those exact fields, and call the tool again.",
    "",
    ...(feedback
      ? [
          "User review feedback to apply:",
          "```text",
          truncate(feedback, WORKFLOW_RECORDING_SECTION_PREVIEW_CHARS),
          "```",
          "",
        ]
      : []),
    "Required final response after the tool succeeds:",
    "- Briefly tell the user the review draft was updated.",
    "- Ask exactly: Is this workflow summary correct? Reply with corrections or say Confirm.",
    "",
    "Current redacted draft playbook JSON:",
    "```json",
    evidence,
    "```",
  ].join("\n");
}

function workflowRecordingEventStatus(message: ChatMessage): WorkflowRecordingEventStatus {
  const rawStatus = metadataString(message.metadata?.status)?.toLowerCase();
  const statusLine = firstContentLine(message.content)?.toLowerCase();
  if (isPermissionBlocked(rawStatus) || isPermissionBlocked(statusLine)) return "permission_blocked";
  if (rawStatus === "user_corrected" || rawStatus === "user-corrected" || rawStatus === "corrected" || statusLine?.includes("user corrected")) {
    return "user_corrected";
  }
  if (rawStatus === "running" || rawStatus === "streaming" || rawStatus === "thinking") return "running";
  if (rawStatus === "skipped" || rawStatus === "skip" || rawStatus === "canceled" || rawStatus === "cancelled" || statusLine?.includes(" skipped")) {
    return "skipped";
  }
  if (rawStatus === "error" || rawStatus === "failed" || rawStatus === "failure") return "failed";
  if (workflowRecordingBrowserSourceCaveat(message)) return "skipped";
  if (rawStatus === "done" || rawStatus === "completed" || rawStatus === "success") return "succeeded";
  if (statusLine?.includes(" failed") || statusLine?.includes(" error")) return "failed";
  if (statusLine?.includes(" completed") || statusLine?.includes(" succeeded") || statusLine?.includes(" success")) return "succeeded";
  if (message.role === "tool") return message.content.trim() ? "succeeded" : "unknown";
  if (message.role === "assistant" && rawStatus === "interrupted") return "failed";
  return message.content.trim() ? "succeeded" : "unknown";
}

function normalizeWorkflowRecordingEvidence(message: ChatMessage): NormalizedWorkflowRecordingEvidence {
  const cleaned = cleanMultiline(message.content);
  const redacted = redactWorkflowRecordingText(cleaned);
  const split = message.role === "tool" ? splitToolTranscript(cleaned) : {};
  const inputRedaction = redactWorkflowRecordingText(split.input);
  const resultRedaction = redactWorkflowRecordingText(split.result);
  const artifactPath = redactWorkflowRecordingArtifactPath(metadataString(message.metadata?.artifactPath));
  const redactionCount = redacted.replacementCount + artifactPath.replacementCount;
  return {
    preview: truncate(redacted.text, WORKFLOW_RECORDING_PREVIEW_CHARS),
    ...(inputRedaction.text ? { inputPreview: truncate(inputRedaction.text, WORKFLOW_RECORDING_SECTION_PREVIEW_CHARS) } : {}),
    ...(resultRedaction.text ? { resultPreview: truncate(resultRedaction.text, WORKFLOW_RECORDING_SECTION_PREVIEW_CHARS) } : {}),
    ...(artifactPath.text ? { artifactPath: artifactPath.text } : {}),
    redacted: redactionCount > 0,
    redactionCount,
  };
}

export function redactWorkflowRecordingText(value: string | undefined): WorkflowRecordingRedaction {
  if (!value) return { text: "", redacted: false, replacementCount: 0 };
  let text = value;
  let replacementCount = 0;

  ({ text, replacementCount } = replaceAndCount(text, replacementCount, /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [REDACTED]"));
  ({ text, replacementCount } = replaceAndCount(text, replacementCount, /\b([A-Za-z0-9._%+-]+:)([A-Za-z0-9._~+/=-]{8,})(@)/g, "$1[REDACTED]$3"));
  ({ text, replacementCount } = replaceAndCount(
    text,
    replacementCount,
    /\b((?:access|refresh|id|oauth)[_-]?token|api[_-]?key|token)=([^&\s"']{4,})/gi,
    "$1=[REDACTED]",
  ));
  ({ text, replacementCount } = replaceAndCount(
    text,
    replacementCount,
    /\b([A-Z][A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Z0-9_]*\s*=\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s\n;]+)/g,
    "$1[REDACTED]",
  ));
  ({ text, replacementCount } = replaceAndCount(
    text,
    replacementCount,
    /((?:"[^"]*(?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|authorization|password|secret|credential)[^"]*"|[A-Za-z0-9_-]*(?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|authorization|password|secret|credential)[A-Za-z0-9_-]*)\s*[:=]\s*)(["']?)([^"',}\s;]{4,})(\2)/gi,
    "$1$2[REDACTED]$4",
  ));
  ({ text, replacementCount } = replaceAndCount(text, replacementCount, /\b(?:sk|ak|pk|rk|zai|ambient|glm)-[A-Za-z0-9._-]{12,}\b/gi, "[REDACTED]"));
  ({ text, replacementCount } = replaceAndCount(
    text,
    replacementCount,
    /(?:^|(?<=\s))\/[^\s"'<>|]*(?:shared-secrets|api[-_]?key|secret|credential|token)[^\s"'<>|]*/gi,
    "[REDACTED_CREDENTIAL_PATH]",
  ));

  return { text, redacted: replacementCount > 0, replacementCount };
}

function redactWorkflowRecordingArtifactPath(value: string | undefined): WorkflowRecordingRedaction {
  const redacted = redactWorkflowRecordingText(value);
  if (!redacted.redacted) return redacted;
  return { text: "[REDACTED_CREDENTIAL_PATH]", redacted: true, replacementCount: redacted.replacementCount };
}

function splitToolTranscript(value: string | undefined): { input?: string; result?: string } {
  const cleaned = cleanMultiline(value);
  if (!cleaned) return {};
  const lines = cleaned.split("\n");
  const inputTitleIndex = lines.findIndex((line) => isSectionTitle(line, "Input") || isSectionTitle(line, "Command"));
  const resultTitleIndex = lines.findIndex((line) => isSectionTitle(line, "Result"));
  if (inputTitleIndex === -1 && resultTitleIndex === -1) return { result: cleaned };

  const inputEnd = resultTitleIndex > inputTitleIndex && resultTitleIndex !== -1 ? resultTitleIndex : lines.length;
  const input = inputTitleIndex === -1 ? undefined : cleanMultiline(lines.slice(inputTitleIndex + 1, inputEnd).join("\n"));
  const result = resultTitleIndex === -1 ? undefined : cleanMultiline(lines.slice(resultTitleIndex + 1).join("\n"));
  return { input, result };
}

function isSectionTitle(line: string, title: string): boolean {
  return line.trim().toLowerCase() === title.toLowerCase();
}

function firstContentLine(value: string | undefined): string | undefined {
  return cleanMultiline(value)?.split("\n").find((line) => line.trim())?.trim();
}

function isPermissionBlocked(value: string | undefined): boolean {
  if (!value) return false;
  return value.includes("permission_blocked") || value.includes("permission-blocked") || (value.includes("permission") && value.includes("blocked"));
}

function workflowRecordingBrowserSourceCaveat(message: ChatMessage): boolean {
  if (message.role !== "tool") return false;
  const toolName = metadataString(message.metadata?.toolName) ?? metadataString(message.metadata?.registeredName);
  if (!isBrowserSourceTool(toolName)) return false;
  const text = cleanMultiline(message.content)?.toLowerCase();
  if (!text) return false;
  if (/\b(?:no|not|without|was not|wasn't|is not|isn't|did not|does not)\s+(?:actually\s+)?(?:a\s+)?(?:captcha|challenge|blocked|anti-bot)\b/.test(text)) {
    return false;
  }
  return (
    /\b(?:captcha|recaptcha|hcaptcha|datadome|perimeterx|cloudflare challenge|bot challenge|anti-bot|robot check|human verification)\b/.test(text) ||
    /\b(?:403|forbidden|access denied|blocked page|blocked by|navigation loop|endless loop|paywall)\b/.test(text) ||
    /\b(?:no usable page content|could not extract|unable to verify|unverified source|source could not be verified|no event details were verified)\b/.test(text)
  );
}

function isBrowserSourceTool(toolName: string | undefined): boolean {
  if (!toolName) return false;
  const normalized = toolName.trim().toLowerCase().replace(/[.-]/g, "_");
  return WORKFLOW_RECORDING_BROWSER_SOURCE_TOOLS.has(normalized);
}

function firstUsefulText(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => Boolean(cleanMultiline(value)));
}

function markdownSummarySections(markdown: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let current: string | undefined;
  for (const rawLine of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = rawLine.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = normalizeMarkdownHeading(heading[1]);
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (current) sections.get(current)?.push(rawLine);
  }
  return sections;
}

function normalizeMarkdownHeading(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function sectionText(sections: Map<string, string[]>, heading: string): string | undefined {
  return cleanMultiline((sections.get(heading) ?? []).join("\n"));
}

function sectionItems(sections: Map<string, string[]>, heading: string, fallback: string[]): string[] {
  const text = sectionText(sections, heading);
  if (!text) return fallback;
  const items = text
    .split("\n")
    .map((line) => line.trim().replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, "").trim())
    .filter((line) => line && !/^is this workflow summary correct\?/i.test(line))
    .slice(0, 12);
  return items.length ? items : fallback;
}

function parseMarkdownToolExample(value: string): WorkflowRecordingPlaybookDraft["successfulExamples"][number] | undefined {
  const line = cleanSingleLine(value);
  if (!line) return undefined;
  const toolName = markdownToolName(line) ?? "tool";
  const detail = line.replace(new RegExp(`^${escapeRegExp(toolName)}\\s*[:\\-–—]?\\s*`, "i"), "").trim();
  return {
    toolName,
    ...(detail ? { resultPreview: detail } : {}),
  };
}

function parseMarkdownAvoidPattern(value: string): WorkflowRecordingPlaybookDraft["doNot"][number] | undefined {
  const line = cleanSingleLine(value);
  if (!line) return undefined;
  const status = line.toLowerCase().includes("permission")
    ? "permission_blocked"
    : line.toLowerCase().includes("skip")
      ? "skipped"
      : "failed";
  return {
    ...(markdownToolName(line) ? { toolName: markdownToolName(line) } : {}),
    status,
    reason: line,
  };
}

function markdownToolName(value: string): string | undefined {
  const codeMatch = value.match(/`([A-Za-z][A-Za-z0-9_.:-]{1,80})`/);
  if (codeMatch) return codeMatch[1];
  const prefixMatch = value.match(/^([A-Za-z][A-Za-z0-9_.:-]{1,80})\s*:/);
  if (prefixMatch) return prefixMatch[1];
  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function metadataString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cleanSingleLine(value: unknown): string | undefined {
  return cleanMultiline(value)?.replace(/\s+/g, " ").trim();
}

function cleanMultiline(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/\r\n?/g, "\n").trim();
  return cleaned || undefined;
}

function truncate(value: string | undefined, maxChars: number): string {
  if (!value) return "";
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function replaceAndCount(
  text: string,
  replacementCount: number,
  pattern: RegExp,
  replacement: string,
): { text: string; replacementCount: number } {
  pattern.lastIndex = 0;
  const matches = text.match(pattern);
  if (!matches?.length) return { text, replacementCount };
  return { text: text.replace(pattern, replacement), replacementCount: replacementCount + matches.length };
}
