import { z } from "zod";
import type { ProjectBoardCard, ProjectBoardCharterProjectSummary } from "../../shared/types";
import type { RunHandoffArtifact } from "./projectBoardArtifacts";

const artifactIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:#-]{0,159}$/;
const artifactIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(artifactIdPattern, "Use letters, numbers, '.', '_', ':', '#', or '-' and start with a letter or number.");
const isoDateSchema = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Use an ISO-style date/time string.");
const stringListSchema = z.array(z.string().min(1).max(2000)).default([]);
const looseObjectSchema = z.record(z.string(), z.unknown());

const taskToolBaseSchema = z
  .object({
    actionId: artifactIdSchema,
    runId: artifactIdSchema.optional(),
    taskId: artifactIdSchema.optional(),
    cardId: artifactIdSchema.optional(),
    createdAt: isoDateSchema,
    metadata: looseObjectSchema.default({}),
  })
  .strict();

const taskToolFollowUpSchema = z
  .object({
    title: z.string().min(1).max(240),
    reason: z.string().max(2000).default(""),
    blockedBy: z.array(artifactIdSchema).default([]),
  })
  .strict();

export const projectBoardTaskToolActionSchema = z.discriminatedUnion("action", [
  taskToolBaseSchema
    .extend({
      action: z.literal("task_show"),
      requested: z.array(z.enum(["card", "dependencies", "proof", "handoff", "sources", "charter"])).default(["card"]),
    })
    .strict(),
  taskToolBaseSchema
    .extend({
      action: z.literal("task_heartbeat"),
      summary: z.string().min(1).max(4000),
      completed: stringListSchema,
      remaining: stringListSchema,
      nextStep: z.string().max(2000).optional(),
    })
    .strict(),
  taskToolBaseSchema
    .extend({
      action: z.literal("task_block"),
      reason: z.string().min(1).max(4000),
      questions: stringListSchema,
      blockedBy: z.array(artifactIdSchema).default([]),
      terminal: z.boolean().default(false),
      retryable: z.boolean().default(true),
    })
    .strict(),
  taskToolBaseSchema
    .extend({
      action: z.literal("task_complete"),
      summary: z.string().min(1).max(8000),
      completed: stringListSchema,
      remaining: stringListSchema,
      risks: stringListSchema,
      commands: stringListSchema,
      changedFiles: stringListSchema,
      screenshots: stringListSchema,
      browserTraces: stringListSchema,
      visualChecks: z.array(looseObjectSchema).default([]),
      manualChecks: stringListSchema,
    })
    .strict(),
  taskToolBaseSchema
    .extend({
      action: z.literal("task_create_followup"),
      title: z.string().min(1).max(240),
      reason: z.string().max(2000).default(""),
      blockedBy: z.array(artifactIdSchema).default([]),
    })
    .strict(),
  taskToolBaseSchema
    .extend({
      action: z.literal("task_report_proof"),
      summary: z.string().max(8000).optional(),
      commands: stringListSchema,
      changedFiles: stringListSchema,
      screenshots: stringListSchema,
      browserTraces: stringListSchema,
      visualChecks: z.array(looseObjectSchema).default([]),
      manualChecks: stringListSchema,
    })
    .strict(),
  taskToolBaseSchema
    .extend({
      action: z.literal("task_report_handoff"),
      summary: z.string().min(1).max(12_000),
      completed: stringListSchema,
      remaining: stringListSchema,
      risks: stringListSchema,
      followUps: z.array(taskToolFollowUpSchema).default([]),
    })
    .strict(),
]);

export const projectBoardTaskToolActionListSchema = z.array(projectBoardTaskToolActionSchema);

export type ProjectBoardTaskToolAction = z.infer<typeof projectBoardTaskToolActionSchema>;
export type ProjectBoardTaskToolActionTransport = "native_tool" | "fenced_fallback" | "unknown";
export interface ProjectBoardTaskToolActionScope {
  runId?: string;
  taskId?: string;
  cardId?: string;
}
export const projectBoardNativeTaskToolNames = [
  "task_show",
  "task_heartbeat",
  "task_block",
  "task_complete",
  "task_create_followup",
  "task_report_proof",
  "task_report_handoff",
] as const;
export type ProjectBoardNativeTaskToolName = (typeof projectBoardNativeTaskToolNames)[number];
export const projectBoardTerminalTaskToolNames = [
  "task_block",
  "task_complete",
  "task_create_followup",
  "task_report_proof",
  "task_report_handoff",
] as const;

export interface ProjectBoardNativeTaskToolDefinition {
  name: ProjectBoardNativeTaskToolName;
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
  parameters: unknown;
}

export interface ProjectBoardNativeTaskActionContext {
  actionId: string;
  createdAt: string;
  cardId?: string;
  taskId?: string;
  runId?: string;
}

export interface ProjectBoardTaskToolActionDiagnostics {
  schemaVersion: 1;
  actionCount: number;
  nativeToolActionCount: number;
  fencedFallbackActionCount: number;
  unknownActionCount: number;
  terminalActionCount: number;
  nativeToolUsed: boolean;
  fallbackJsonUsed: boolean;
  fallbackOnly: boolean;
  latestAction?: string;
  latestActionId?: string;
  missingProtocol: string[];
  integrityIssueCount: number;
}

export function parseProjectBoardTaskToolActions(value: unknown): ProjectBoardTaskToolAction[] {
  if (value === undefined || value === null) return [];
  const input = Array.isArray(value) ? value : [value];
  return projectBoardTaskToolActionListSchema.parse(input);
}

export function projectBoardTaskToolActionsFromProofOfWork(proofOfWork: Record<string, unknown> | undefined): ProjectBoardTaskToolAction[] {
  if (!proofOfWork) return [];
  try {
    return parseProjectBoardTaskToolActions(proofOfWork.taskToolActions ?? proofOfWork.taskActions ?? proofOfWork.modelTaskActions);
  } catch {
    return [];
  }
}

export function projectBoardTaskToolActionMatchesScope(
  action: ProjectBoardTaskToolAction,
  scope: ProjectBoardTaskToolActionScope | undefined,
): boolean {
  if (!scope) return true;
  if (scope.runId && action.runId && action.runId !== scope.runId) return false;
  if (scope.taskId && action.taskId && action.taskId !== scope.taskId) return false;
  if (scope.cardId && action.cardId && action.cardId !== scope.cardId) return false;
  return true;
}

export function projectBoardTaskToolActionsForScope(
  actions: ProjectBoardTaskToolAction[],
  scope: ProjectBoardTaskToolActionScope | undefined,
): ProjectBoardTaskToolAction[] {
  if (!scope?.runId && !scope?.taskId && !scope?.cardId) return actions;
  return actions.filter((action) => projectBoardTaskToolActionMatchesScope(action, scope));
}

export function projectBoardTaskToolActionsFromProofOfWorkForScope(
  proofOfWork: Record<string, unknown> | undefined,
  scope: ProjectBoardTaskToolActionScope | undefined,
): ProjectBoardTaskToolAction[] {
  return projectBoardTaskToolActionsForScope(projectBoardTaskToolActionsFromProofOfWork(proofOfWork), scope);
}

export function projectBoardTaskToolProtocolMissing(actions: ProjectBoardTaskToolAction[]): string[] {
  const countsByAction = new Map<string, number>();
  for (const action of actions) countsByAction.set(action.action, (countsByAction.get(action.action) ?? 0) + 1);
  const terminalActionCount = actions.filter((action) => projectBoardTerminalTaskToolNames.includes(action.action as (typeof projectBoardTerminalTaskToolNames)[number])).length;
  const onlyContextAndHeartbeat = actions.length > 0 && actions.every((action) => action.action === "task_show" || action.action === "task_heartbeat");
  const missing: string[] = [];
  if (actions.length === 0) missing.push("any_task_action");
  if ((countsByAction.get("task_heartbeat") ?? 0) <= 0) missing.push("task_heartbeat");
  if (terminalActionCount <= 0) missing.push("terminal_task_action");
  if (onlyContextAndHeartbeat) missing.push("proof_block_complete_followup_or_handoff");
  return missing;
}

export function projectBoardTaskToolActionWithNativeMetadata(
  action: ProjectBoardTaskToolAction,
  toolName: ProjectBoardNativeTaskToolName,
): ProjectBoardTaskToolAction {
  return projectBoardTaskToolActionSchema.parse({
    ...action,
    metadata: {
      ...action.metadata,
      transport: "native_tool",
      toolName,
    },
  });
}

export function projectBoardTaskToolActionTransport(action: ProjectBoardTaskToolAction): ProjectBoardTaskToolActionTransport {
  const transport = action.metadata?.transport;
  if (transport === "native_tool" || transport === "fenced_fallback") return transport;
  if (Object.keys(action.metadata ?? {}).length === 0) return "fenced_fallback";
  return "unknown";
}

export function projectBoardTaskToolActionDiagnostics(actions: ProjectBoardTaskToolAction[]): ProjectBoardTaskToolActionDiagnostics {
  const nativeToolActionCount = actions.filter((action) => projectBoardTaskToolActionTransport(action) === "native_tool").length;
  const fencedFallbackActionCount = actions.filter((action) => projectBoardTaskToolActionTransport(action) === "fenced_fallback").length;
  const unknownActionCount = actions.filter((action) => projectBoardTaskToolActionTransport(action) === "unknown").length;
  const terminalActionCount = actions.filter((action) =>
    projectBoardTerminalTaskToolNames.includes(action.action as (typeof projectBoardTerminalTaskToolNames)[number]),
  ).length;
  const latestAction = [...actions].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.actionId.localeCompare(right.actionId)).at(-1);
  return {
    schemaVersion: 1,
    actionCount: actions.length,
    nativeToolActionCount,
    fencedFallbackActionCount,
    unknownActionCount,
    terminalActionCount,
    nativeToolUsed: nativeToolActionCount > 0,
    fallbackJsonUsed: fencedFallbackActionCount > 0,
    fallbackOnly: actions.length > 0 && nativeToolActionCount === 0 && fencedFallbackActionCount > 0,
    ...(latestAction ? { latestAction: latestAction.action, latestActionId: latestAction.actionId } : {}),
    missingProtocol: projectBoardTaskToolProtocolMissing(actions),
    integrityIssueCount: projectBoardTaskToolActionIntegrityIssues(actions).length,
  };
}

export function projectBoardTaskToolInstructions(): string {
  return [
    "Report durable task state through project-board task actions instead of burying it only in prose.",
    "Primary path: call native project-board task tools directly: task_show, task_heartbeat, task_report_proof, task_block, task_complete, task_create_followup, or task_report_handoff.",
    "Ambient fills actionId, createdAt, cardId, taskId, and runId for native tool calls when you omit them.",
    "Fallback path: use a fenced ```task_actions JSON array only when native task tools are unavailable, and never duplicate the same action through both paths.",
    "For project-board card execution these actions are mandatory durable progress/proof checkpoints, not optional narration.",
    "Task-action reporting takes precedence over card-body wording about progress narration.",
    "Your first observable board action for each execution pass should be task_heartbeat unless you need task_show first for context.",
    "Use task_show before starting if you need the card/dependency/proof context.",
    "Before reading files, editing files, or running shell commands, report task_heartbeat with the immediate plan, next step, and expected proof target.",
    "For the initial heartbeat, completed may be empty; remaining or nextStep must name concrete work. Later heartbeats should include real completed work from this run.",
    "Report task_heartbeat after meaningful milestones or before long verification loops.",
    "Report task_report_proof as soon as commands, changed files, screenshots, traces, visual checks, or manual checks exist.",
    "After sufficient proof, call task_complete immediately. If blocked or incomplete, call task_block, task_create_followup, or task_report_handoff with concrete remaining work.",
    "Do not end with only task_show/task_heartbeat or prose; emit a terminal task action before your final assistant message so Ambient can classify the run.",
  ].join("\n");
}

export function projectBoardNativeTaskToolDefinitions(): ProjectBoardNativeTaskToolDefinition[] {
  return projectBoardNativeTaskToolNames.map((name) => ({
    name,
    label: projectBoardNativeTaskToolLabel(name),
    description: projectBoardNativeTaskToolDescription(name),
    promptSnippet: `${name}: ${projectBoardNativeTaskToolDescription(name)}`,
    promptGuidelines: [
      "Use this tool only while executing the current project-board card.",
      "Ambient records the tool result as a durable task action for PM review, proof, blockers, handoffs, and follow-up generation.",
      "Prefer this native tool over a fenced task_actions JSON block when the tool is available.",
    ],
    parameters: projectBoardNativeTaskToolParameters(name),
  }));
}

export function projectBoardTaskToolActionFromNativeCall(
  name: ProjectBoardNativeTaskToolName,
  params: unknown,
  context: ProjectBoardNativeTaskActionContext,
): ProjectBoardTaskToolAction {
  const input = params && typeof params === "object" && !Array.isArray(params) ? (params as Record<string, unknown>) : {};
  const actionId = typeof input.actionId === "string" && input.actionId.trim() ? input.actionId.trim() : context.actionId;
  const createdAt = typeof input.createdAt === "string" && input.createdAt.trim() ? input.createdAt.trim() : context.createdAt;
  const cardId = typeof input.cardId === "string" && input.cardId.trim() ? input.cardId.trim() : context.cardId;
  const taskId = typeof input.taskId === "string" && input.taskId.trim() ? input.taskId.trim() : context.taskId;
  const runId = typeof input.runId === "string" && input.runId.trim() ? input.runId.trim() : context.runId;
  return projectBoardTaskToolActionSchema.parse({
    ...input,
    action: name,
    actionId,
    createdAt,
    ...(cardId ? { cardId } : {}),
    ...(taskId ? { taskId } : {}),
    ...(runId ? { runId } : {}),
  });
}

export function projectBoardTaskToolNativeResultText(action: ProjectBoardTaskToolAction, contextText?: string): string {
  return [
    "Project board task action captured.",
    `Action: ${projectBoardTaskToolActionTitle(action)}`,
    `Summary: ${projectBoardTaskToolActionSummary(action)}`,
    projectBoardTaskToolNativeFollowupText(action),
    contextText?.trim(),
    "```task_actions",
    JSON.stringify([action], null, 2),
    "```",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function projectBoardTaskToolNativeFollowupText(action: ProjectBoardTaskToolAction): string | undefined {
  if (action.action === "task_report_proof") {
    return "Proof is recorded. If the proof satisfies the card, call task_complete now. If anything remains, call task_report_handoff or task_block with the specific remaining work instead of continuing open-ended investigation.";
  }
  if (action.action === "task_heartbeat") {
    return "Progress is recorded. Continue the card, then report proof, completion, handoff, follow-up, or a concrete blocker before ending the run.";
  }
  if (action.action === "task_block") {
    return "Blocker is recorded. Stop the current attempt unless you can resolve the blocker directly.";
  }
  if (action.action === "task_complete") {
    return "Completion is recorded. Stop working this card.";
  }
  if (action.action === "task_report_handoff") {
    return "Handoff is recorded. Stop the current card unless you have explicit remaining proof work to finish now.";
  }
  if (action.action === "task_create_followup") {
    return "Follow-up is recorded. Continue the current card only if its proof expectations still need work.";
  }
  return undefined;
}

export function projectBoardTaskToolPromptSection(
  card: Pick<ProjectBoardCard, "id" | "title" | "testPlan" | "acceptanceCriteria">,
  options: { charterProjectSummary?: ProjectBoardCharterProjectSummary } = {},
): string {
  const proofExpectations = [
    ...card.acceptanceCriteria.map((item) => `- Acceptance: ${item}`),
    ...card.testPlan.unit.map((item) => `- Unit proof: ${item}`),
    ...card.testPlan.integration.map((item) => `- Integration proof: ${item}`),
    ...card.testPlan.visual.map((item) => `- Visual proof: ${item}`),
    ...card.testPlan.manual.map((item) => `- Manual proof: ${item}`),
  ];
  return [
    "Project-board task action protocol",
    `Card: ${card.title} (${card.id})`,
    options.charterProjectSummary ? projectBoardTaskProjectSummaryPromptSection(options.charterProjectSummary) : "",
    projectBoardTaskToolInstructions(),
    proofExpectations.length ? ["Proof expectations:", ...proofExpectations].join("\n") : "",
    [
      "Fallback JSON requirements (only when native task tools are unavailable):",
      "- Emit a fenced `task_actions` JSON array, even for a single action, and keep the JSON valid.",
      "- Each action object must use the discriminator field exactly as `action`; never use `type`, `status`, `name`, or `event` instead of `action`.",
      "- Valid action values are exactly `task_show`, `task_heartbeat`, `task_report_proof`, `task_block`, `task_complete`, `task_create_followup`, and `task_report_handoff`.",
      "- Include fresh run-specific `actionId` and current ISO `createdAt`; never use placeholders or copied samples.",
      "- Report only real work from this run. Initial `task_heartbeat` needs a concrete summary plus remaining or nextStep; proof/complete need material commands, changedFiles, screenshots, browserTraces, visualChecks, or manualChecks when available.",
      "- Empty proof arrays do not satisfy proof; use task_block or task_report_handoff when proof is unavailable.",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function projectBoardTaskProjectSummaryPromptSection(summary: ProjectBoardCharterProjectSummary): string {
  return [
    "Active charter project summary",
    "This is derived context from the active charter and source scan. Use it for orientation; explicit card scope, source files, and user answers override it.",
    `Summary: ${summary.summary}`,
    summary.majorSystems.length ? `Major systems: ${summary.majorSystems.join("; ")}` : "",
    summary.risks.length ? `Known risks: ${summary.risks.join("; ")}` : "",
    summary.dependencyHints.length ? `Dependency hints: ${summary.dependencyHints.join("; ")}` : "",
    summary.coverageGaps.length ? `Coverage gaps: ${summary.coverageGaps.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function projectBoardTaskToolActionsFromText(text: string): ProjectBoardTaskToolAction[] {
  const candidates = taskActionCandidateBlocks(text);
  const actions = candidates.flatMap(parseCandidateTaskActions);
  const byId = new Map<string, ProjectBoardTaskToolAction>();
  for (const action of actions) {
    if (!byId.has(action.actionId)) byId.set(action.actionId, action);
  }
  return [...byId.values()];
}

export function projectBoardTaskToolActionsFromTexts(texts: string[]): ProjectBoardTaskToolAction[] {
  const byId = new Map<string, ProjectBoardTaskToolAction>();
  for (const text of texts) {
    for (const action of projectBoardTaskToolActionsFromText(text)) {
      if (!byId.has(action.actionId)) byId.set(action.actionId, action);
    }
  }
  return [...byId.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.actionId.localeCompare(right.actionId));
}

export function projectBoardTaskToolActionIntegrityIssues(actions: ProjectBoardTaskToolAction[]): string[] {
  const issues: string[] = [];
  const hasMaterialProofAction = actions.some((action) => (action.action === "task_report_proof" || action.action === "task_complete") && taskActionHasMaterialProof(action));
  for (const action of actions) {
    const copiedFields = copiedSampleTaskActionFields(action);
    if (copiedFields.length > 0) {
      issues.push(`${action.action} ${action.actionId} appears to contain copied sample value(s): ${copiedFields.join(", ")}.`);
    }
    if (action.action === "task_report_proof" && !taskActionHasMaterialProof(action)) {
      issues.push(`${action.action} ${action.actionId} has no command, changed-file, screenshot, browser-trace, visual-check, manual-check, or completed-item evidence.`);
    }
    if (action.action === "task_complete" && !hasMaterialProofAction && !taskActionHasMaterialProof(action)) {
      issues.push(`${action.action} ${action.actionId} has no command, changed-file, screenshot, browser-trace, visual-check, manual-check, or completed-item evidence.`);
    }
  }
  return [...new Set(issues)];
}

function copiedSampleTaskActionFields(action: ProjectBoardTaskToolAction): string[] {
  const fields: string[] = [];
  const hasSampleActionId = ["heartbeat-1", "proof-1", "unique-heartbeat-id", "unique-proof-id"].includes(action.actionId);
  const check = (field: string, value: unknown) => {
    for (const item of stringValues(value)) {
      if (isCopiedSampleTaskActionValue(item)) fields.push(field);
    }
  };
  if ("summary" in action) check("summary", action.summary);
  if ("reason" in action) check("reason", action.reason);
  if ("title" in action) check("title", action.title);
  if ("completed" in action) check("completed", action.completed);
  if ("remaining" in action) check("remaining", action.remaining);
  if ("commands" in action) check("commands", action.commands);
  if ("changedFiles" in action) check("changedFiles", action.changedFiles);
  if ("manualChecks" in action) check("manualChecks", action.manualChecks);
  if (hasSampleActionId && fields.length > 0) fields.unshift("actionId");
  return [...new Set(fields)];
}

function stringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

function isCopiedSampleTaskActionValue(value: string): boolean {
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  return [
    "short progress update.",
    "concrete completed item.",
    "concrete remaining item.",
    "verification passed.",
    "describe actual progress from this run.",
    "name a concrete item actually completed.",
    "name concrete remaining work, or leave this array empty.",
    "summarize the actual proof collected in this run.",
  ].includes(normalized);
}

function taskActionHasMaterialProof(action: ProjectBoardTaskToolAction): boolean {
  if (action.action === "task_report_proof") {
    return (
      action.commands.length > 0 ||
      action.changedFiles.length > 0 ||
      action.screenshots.length > 0 ||
      action.browserTraces.length > 0 ||
      action.visualChecks.length > 0 ||
      action.manualChecks.length > 0
    );
  }
  if (action.action !== "task_complete") return false;
  return (
    action.completed.length > 0 ||
    action.commands.length > 0 ||
    action.changedFiles.length > 0 ||
    action.screenshots.length > 0 ||
    action.browserTraces.length > 0 ||
    action.visualChecks.length > 0 ||
    action.manualChecks.length > 0
  );
}

export function projectBoardTaskToolActionTitle(action: ProjectBoardTaskToolAction): string {
  if (action.action === "task_show") return "Task context requested";
  if (action.action === "task_heartbeat") return "Task heartbeat";
  if (action.action === "task_block") return "Task blocked";
  if (action.action === "task_complete") return "Task completed";
  if (action.action === "task_create_followup") return "Follow-up requested";
  if (action.action === "task_report_proof") return "Proof reported";
  return "Handoff reported";
}

export function projectBoardTaskToolActionSummary(action: ProjectBoardTaskToolAction): string {
  if (action.action === "task_block") return action.reason;
  if (action.action === "task_create_followup") return action.reason || action.title;
  if (action.action === "task_show") return `Requested ${action.requested.join(", ")} context.`;
  if ("summary" in action && action.summary) return action.summary;
  return projectBoardTaskToolActionTitle(action);
}

export function projectBoardTaskToolProofSummary(actions: ProjectBoardTaskToolAction[]): string | undefined {
  const proof = [...actions].reverse().find((action) => (action.action === "task_complete" || action.action === "task_report_proof") && action.summary);
  return proof && "summary" in proof ? proof.summary : undefined;
}

export function projectBoardTaskToolHandoffSummary(actions: ProjectBoardTaskToolAction[]): string | undefined {
  const handoff = [...actions].reverse().find((action) => action.action === "task_report_handoff" || action.action === "task_complete" || action.action === "task_block");
  return handoff ? projectBoardTaskToolActionSummary(handoff) : undefined;
}

export function projectBoardTaskToolCommands(actions: ProjectBoardTaskToolAction[]): string[] {
  return uniqueStrings(actions.flatMap((action) => (action.action === "task_complete" || action.action === "task_report_proof" ? action.commands : [])));
}

export function projectBoardTaskToolChangedFiles(actions: ProjectBoardTaskToolAction[]): string[] {
  return uniqueStrings(actions.flatMap((action) => (action.action === "task_complete" || action.action === "task_report_proof" ? action.changedFiles : [])));
}

export function projectBoardTaskToolScreenshots(actions: ProjectBoardTaskToolAction[]): string[] {
  return uniqueStrings(actions.flatMap((action) => (action.action === "task_complete" || action.action === "task_report_proof" ? action.screenshots : [])));
}

export function projectBoardTaskToolBrowserTraces(actions: ProjectBoardTaskToolAction[]): string[] {
  return uniqueStrings(actions.flatMap((action) => (action.action === "task_complete" || action.action === "task_report_proof" ? action.browserTraces : [])));
}

export function projectBoardTaskToolVisualChecks(actions: ProjectBoardTaskToolAction[]): Record<string, unknown>[] {
  return actions.flatMap((action) => (action.action === "task_complete" || action.action === "task_report_proof" ? action.visualChecks : []));
}

export function projectBoardTaskToolManualChecks(actions: ProjectBoardTaskToolAction[]): string[] {
  return uniqueStrings(actions.flatMap((action) => (action.action === "task_complete" || action.action === "task_report_proof" ? action.manualChecks : [])));
}

export function projectBoardTaskToolCompleted(actions: ProjectBoardTaskToolAction[]): string[] {
  return uniqueStrings(actions.flatMap((action) => (action.action === "task_complete" || action.action === "task_report_handoff" || action.action === "task_heartbeat" ? action.completed : [])));
}

export function projectBoardTaskToolRemaining(actions: ProjectBoardTaskToolAction[]): string[] {
  const remaining = actions.flatMap((action) => (action.action === "task_complete" || action.action === "task_report_handoff" || action.action === "task_heartbeat" ? action.remaining : []));
  const blockerQuestions = actions.flatMap((action) => (action.action === "task_block" ? action.questions : []));
  return uniqueStrings([...remaining, ...blockerQuestions]);
}

export function projectBoardTaskToolRisks(actions: ProjectBoardTaskToolAction[]): string[] {
  const handoffRisks = actions.flatMap((action) => (action.action === "task_complete" || action.action === "task_report_handoff" ? action.risks : []));
  const blockers = actions.filter((action) => action.action === "task_block").map((action) => action.reason);
  return uniqueStrings([...handoffRisks, ...blockers]);
}

export function projectBoardTaskToolFollowUps(actions: ProjectBoardTaskToolAction[]): RunHandoffArtifact["followUps"] {
  const explicit = actions.flatMap((action) => (action.action === "task_report_handoff" ? action.followUps : []));
  const created = actions
    .filter((action): action is Extract<ProjectBoardTaskToolAction, { action: "task_create_followup" }> => action.action === "task_create_followup")
    .map((action) => ({ title: action.title, reason: action.reason, blockedBy: action.blockedBy }));
  return [...explicit, ...created];
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function projectBoardNativeTaskToolLabel(name: ProjectBoardNativeTaskToolName): string {
  if (name === "task_show") return "Show Task Context";
  if (name === "task_heartbeat") return "Report Task Progress";
  if (name === "task_block") return "Report Task Blocker";
  if (name === "task_complete") return "Complete Task";
  if (name === "task_create_followup") return "Create Follow-up";
  if (name === "task_report_proof") return "Report Proof";
  return "Report Handoff";
}

function projectBoardNativeTaskToolDescription(name: ProjectBoardNativeTaskToolName): string {
  if (name === "task_show") return "Request the current project-board card, dependency, proof, source, or charter context.";
  if (name === "task_heartbeat") return "Record the required initial plan checkpoint or meaningful in-progress work on the current project-board card.";
  if (name === "task_block") return "Record a blocker or question that prevents the current card from completing.";
  if (name === "task_complete") return "Record that the current card is complete with its proof packet.";
  if (name === "task_create_followup") return "Record newly discovered follow-up work that should become a triageable card.";
  if (name === "task_report_proof") return "Record commands, changed files, screenshots, traces, visual checks, or manual checks for the current card.";
  return "Record the final PM handoff summary for the current card.";
}

function projectBoardNativeTaskToolParameters(name: ProjectBoardNativeTaskToolName): unknown {
  const base = {
    actionId: { type: "string", description: "Optional stable id for this task action. Ambient fills one when omitted." },
    runId: { type: "string", description: "Optional current Local Task run id. Ambient fills the current run when omitted." },
    taskId: { type: "string", description: "Optional current Local Task id. Ambient fills the current task when omitted." },
    cardId: { type: "string", description: "Optional current project-board card id. Ambient fills the current card when omitted." },
    createdAt: { type: "string", description: "Optional ISO timestamp. Ambient fills the current time when omitted." },
    metadata: { type: "object", description: "Optional structured metadata for this task action." },
  };
  if (name === "task_show") {
    return {
      type: "object",
      properties: {
        ...base,
        requested: {
          type: "array",
          items: { type: "string", enum: ["card", "dependencies", "proof", "handoff", "sources", "charter"] },
          description: "Context areas to display.",
        },
      },
      additionalProperties: false,
    };
  }
  if (name === "task_heartbeat") {
    return {
      type: "object",
      properties: {
        ...base,
        summary: { type: "string", description: "Concise progress summary." },
        completed: { type: "array", items: { type: "string" }, description: "Concrete items completed so far." },
        remaining: { type: "array", items: { type: "string" }, description: "Concrete remaining work." },
        nextStep: { type: "string", description: "The next intended worker step." },
      },
      required: ["summary"],
      additionalProperties: false,
    };
  }
  if (name === "task_block") {
    return {
      type: "object",
      properties: {
        ...base,
        reason: { type: "string", description: "Concrete blocker reason." },
        questions: { type: "array", items: { type: "string" }, description: "Questions the user or PM must answer." },
        blockedBy: { type: "array", items: { type: "string" }, description: "Card ids, task ids, or blocker references." },
        terminal: { type: "boolean", description: "True when more autonomous retries are not useful." },
        retryable: { type: "boolean", description: "False when retrying without user/PM input would repeat the same failure." },
      },
      required: ["reason"],
      additionalProperties: false,
    };
  }
  if (name === "task_create_followup") {
    return {
      type: "object",
      properties: {
        ...base,
        title: { type: "string", description: "Follow-up card title." },
        reason: { type: "string", description: "Why this follow-up is needed." },
        blockedBy: { type: "array", items: { type: "string" }, description: "Dependencies for the follow-up." },
      },
      required: ["title"],
      additionalProperties: false,
    };
  }
  const proofProperties = {
    commands: { type: "array", items: { type: "string" }, description: "Commands run as proof." },
    changedFiles: { type: "array", items: { type: "string" }, description: "Files changed or materially reviewed." },
    screenshots: { type: "array", items: { type: "string" }, description: "Screenshot artifact paths." },
    browserTraces: { type: "array", items: { type: "string" }, description: "Browser trace artifact paths." },
    visualChecks: { type: "array", items: { type: "object" }, description: "Text-first visual proof metrics or checks." },
    manualChecks: { type: "array", items: { type: "string" }, description: "Manual proof checks performed." },
  };
  if (name === "task_report_proof") {
    return {
      type: "object",
      properties: {
        ...base,
        summary: { type: "string", description: "Concise proof summary." },
        ...proofProperties,
      },
      additionalProperties: false,
    };
  }
  if (name === "task_complete") {
    return {
      type: "object",
      properties: {
        ...base,
        summary: { type: "string", description: "Completion summary." },
        completed: { type: "array", items: { type: "string" }, description: "Completed card work." },
        remaining: { type: "array", items: { type: "string" }, description: "Remaining work, if any." },
        risks: { type: "array", items: { type: "string" }, description: "Residual risks." },
        ...proofProperties,
      },
      required: ["summary"],
      additionalProperties: false,
    };
  }
  return {
    type: "object",
    properties: {
      ...base,
      summary: { type: "string", description: "Handoff summary." },
      completed: { type: "array", items: { type: "string" }, description: "Completed work." },
      remaining: { type: "array", items: { type: "string" }, description: "Remaining work." },
      risks: { type: "array", items: { type: "string" }, description: "Risks for the PM or next card." },
      followUps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            reason: { type: "string" },
            blockedBy: { type: "array", items: { type: "string" } },
          },
          required: ["title"],
          additionalProperties: false,
        },
      },
    },
    required: ["summary"],
    additionalProperties: false,
  };
}

function taskActionCandidateBlocks(text: string): string[] {
  const blocks: string[] = [];
  const fenced = /```([A-Za-z0-9_-]*)\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fenced.exec(text)) !== null) {
    const language = match[1].trim().toLowerCase();
    const body = match[2].trim();
    if (!body.includes('"action"')) continue;
    if (language === "task_actions" || language === "task-actions" || language === "json" || language === "jsonl" || body.includes('"task_')) {
      blocks.push(body);
    }
  }

  const marker = /TASK_ACTIONS_JSONL\s*([\s\S]*?)\s*END_TASK_ACTIONS_JSONL/g;
  while ((match = marker.exec(text)) !== null) {
    blocks.push(match[1].trim());
  }

  const trimmed = text.trim();
  if ((trimmed.startsWith("[") || trimmed.startsWith("{")) && trimmed.includes('"action"') && trimmed.includes('"task_')) {
    blocks.push(trimmed);
  }
  return blocks;
}

function parseCandidateTaskActions(candidate: string): ProjectBoardTaskToolAction[] {
  const parsedJson = parseJsonCandidate(candidate);
  if (parsedJson !== undefined) return safeParseTaskActions(parsedJson);
  return candidate
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const parsedLine = parseJsonCandidate(line);
      return parsedLine === undefined ? [] : safeParseTaskActions(parsedLine);
    });
}

function parseJsonCandidate(candidate: string): unknown {
  try {
    return JSON.parse(candidate);
  } catch {
    return undefined;
  }
}

function safeParseTaskActions(value: unknown): ProjectBoardTaskToolAction[] {
  const result = projectBoardTaskToolActionListSchema.safeParse(Array.isArray(value) ? value : taskActionListFromWrapper(value));
  return result.success ? result.data : [];
}

function taskActionListFromWrapper(value: unknown): unknown[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [value];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.task_actions)) return record.task_actions;
  if (Array.isArray(record.taskActions)) return record.taskActions;
  if (Array.isArray(record.actions)) return record.actions;
  return [value];
}
