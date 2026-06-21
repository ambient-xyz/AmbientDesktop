import type { PermissionRequest } from "../../shared/permissionTypes";
import type { PlannerDecisionOption, PlannerDecisionQuestion, PlannerDiagramEdge, PlannerDiagramKind, PlannerDiagramNode, PlannerDiagramSpec, PlannerDurableArtifactValidationIssue, PlannerDurableArtifactValidationResult, PlannerPlanArtifact, PlannerPlanStep } from "../../shared/plannerTypes";
import type { WorkflowPlanEditIntentKind } from "../../shared/workflowThreadPlanEdit";

type PlannerPermissionPrompt = Omit<PermissionRequest, "id">;

export type PlannerToolDecision = { action: "allow" } | { action: "deny"; request: PlannerPermissionPrompt; reason: string };

export interface PlannerToolPolicyInput {
  threadId: string;
  toolName: string;
  toolInput: unknown;
  detail?: string;
  outsideWorkspaceDetail?: string;
  secretPathDetail?: string;
}

export const PLANNER_MODE_ALLOWED_TOOLS = [
  "read",
  "file_read",
  "grep",
  "find",
  "ls",
  "bash",
  "browser_nav",
  "browser_content",
  "browser_screenshot",
  "ambient_capability_builder_plan",
  "ambient_capability_builder_preview",
  "ambient_capability_builder_history",
  "ambient_capability_builder_update_plan",
  "ambient_capability_builder_repair_plan",
  "ambient_capability_builder_removal_plan",
  "ambient_voice_status",
  "ambient_voice_list_voices",
  "ambient_voice_clone_plan",
  "ambient_stt_status",
  "ambient_visual_analyze",
  "ambient_provider_catalog",
  "ambient_model_status",
  "ambient_local_deep_research_setup",
  "web_research_status",
  "web_research_provider_search",
  "web_research_provider_describe",
  "ambient_search_preference_status",
  "ambient_messaging_headless_ux_inventory",
  "ambient_runtime_surface_snapshot",
  "ambient_messaging_gateway_status",
  "ambient_messaging_remote_surface_activation_plan",
  "ambient_messaging_remote_surface_provider_support_plan",
  "ambient_messaging_telegram_owner_loop_activation_plan",
  "ambient_messaging_telegram_bridge_poll_preview",
  "ambient_messaging_telegram_bridge_polling_status",
  "ambient_messaging_telegram_bridge_polling_preview",
  "ambient_cli_search",
  "ambient_cli_describe",
  "ambient_workflows_search",
  "ambient_workflows_describe",
  "workflow_current_context",
  "workflow_get_artifact",
  "workflow_get_source",
  "workflow_get_run_trace",
  "workflow_get_versions",
  "workflow_capability_search",
  "workflow_capability_describe",
  "workflow_propose_manifest_revision",
  "workflow_propose_revision",
  "workflow_validate_revision",
  "workflow_explain_revision_diff",
  "workflow_update_run_settings",
] as const;

const PLANNER_MODE_ALLOWED_TOOL_SET = new Set<string>(PLANNER_MODE_ALLOWED_TOOLS);

export const PLANNER_MODE_DIRECT_ACTIVE_TOOLS = [
  "ambient_visual_analyze",
] as const;

const plannerSafeCommandPatterns = [
  /^\s*cat\b/i,
  /^\s*head\b/i,
  /^\s*tail\b/i,
  /^\s*less\b/i,
  /^\s*more\b/i,
  /^\s*grep\b/i,
  /^\s*rg\b/i,
  /^\s*find\b/i,
  /^\s*fd\b/i,
  /^\s*ls\b/i,
  /^\s*pwd\b/i,
  /^\s*wc\b/i,
  /^\s*sort\b/i,
  /^\s*uniq\b/i,
  /^\s*diff\b/i,
  /^\s*file\b/i,
  /^\s*stat\b/i,
  /^\s*du\b/i,
  /^\s*df\b/i,
  /^\s*tree\b/i,
  /^\s*which\b/i,
  /^\s*whereis\b/i,
  /^\s*type\b/i,
  /^\s*env\b/i,
  /^\s*printenv\b/i,
  /^\s*uname\b/i,
  /^\s*whoami\b/i,
  /^\s*id\b/i,
  /^\s*date\b/i,
  /^\s*ps\b/i,
  /^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get|ls-files|ls-tree|rev-parse)\b/i,
  /^\s*node\s+--version\b/i,
  /^\s*python3?\s+--version\b/i,
  /^\s*jq\b/i,
  /^\s*sed\s+-n\b/i,
  /^\s*awk\b/i,
];

const plannerBlockedCommandPatterns = [
  /\brm\b/i,
  /\brmdir\b/i,
  /\bmv\b/i,
  /\bcp\b/i,
  /\bmkdir\b/i,
  /\btouch\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bchgrp\b/i,
  /\bln\b/i,
  /\btee\b/i,
  /\btruncate\b/i,
  /\bdd\b/i,
  /(^|[^<])>(?!>)/,
  />>/,
  /\b(npm|pnpm|yarn)\s+(test|run|install|uninstall|update|ci|link|publish|add|remove|build|dev|start)\b/i,
  /\b(python3?|node|bun|deno|tsx|ts-node|vite|vitest|jest|pytest|cargo|go|make)\b(?!\s+--version\b)/i,
  /\b(git)\s+(add|commit|push|pull|merge|rebase|reset|checkout|switch|stash|cherry-pick|revert|tag|init|clone|clean|restore)\b/i,
  /\b(sudo|su|kill|pkill|killall|reboot|shutdown)\b/i,
  /\b(systemctl|service)\s+\S*\s*(start|stop|restart|enable|disable)\b/i,
  /\b(vim?|nano|emacs|code|subl)\b/i,
];
const plannerNetworkCommandPatterns = [/\b(curl|wget|scp|sftp|ssh|rsync|nc|netcat|nmap|rclone)\b/i];

type PlannerGenericOutOfScopeFeature = {
  id: string;
  patterns: RegExp[];
};

const plannerGenericOutOfScopeFeatures: PlannerGenericOutOfScopeFeature[] = [
  {
    id: "auth-or-accounts",
    patterns: [/\bauth(?:entication)?\b/i, /\b(?:user\s+)?accounts?\b/i, /\blog[-\s]?in\b/i, /\bsign[-\s]?in\b/i],
  },
  {
    id: "backend-or-api",
    patterns: [/\bback[-\s]?end\b/i, /\bapi\b/i, /\bserver\b/i, /\bexternal\s+services?\b/i],
  },
  {
    id: "persistence-or-history",
    patterns: [/\bpersist(?:ence|ent|ed|ing)?\b/i, /\bhistory\b/i, /\blocal\s*storage\b/i, /\blocalStorage\b/i, /\bdatabase\b/i, /\bsync\b/i],
  },
  {
    id: "charts-or-analytics",
    patterns: [/\bcharts?\b/i, /\bgraphs?\b/i, /\bvisuali[sz]ations?\b/i, /\banalytics?\b/i, /\btracking\s+dashboard\b/i],
  },
  {
    id: "sharing-or-collaboration",
    patterns: [/\bsharing\b/i, /\bcollaboration\b/i, /\bcollaborative\b/i, /\bmulti[-\s]?user\b/i],
  },
  {
    id: "routing-or-pages",
    patterns: [/\bmulti[-\s]?page\b/i, /\brouting\b/i, /\broutes?\b/i],
  },
  {
    id: "deployment",
    patterns: [/\bdeployment\b/i, /\bdeploy\b/i, /\bhosting\b/i, /\bci\/?cd\b/i],
  },
  {
    id: "payments",
    patterns: [/\bpayments?\b/i, /\bbilling\b/i, /\bstripe\b/i, /\bcheckout\b/i],
  },
  {
    id: "notifications",
    patterns: [/\bnotifications?\b/i, /\bpush\b/i, /\bemail\b/i, /\breminders?\b/i],
  },
  {
    id: "admin",
    patterns: [/\badmin\b/i, /\breporting\b/i, /\bdashboard\b/i],
  },
];

export function isPlannerModeAllowedTool(toolName: string): boolean {
  return PLANNER_MODE_ALLOWED_TOOL_SET.has(toolName);
}

export function plannerModeToolsForWorkflowPlanEditIntent(tools: string[], intent: WorkflowPlanEditIntentKind | undefined): string[] {
  if (!intent) return tools;
  const intentScopedTools = intent === "run_settings" ? tools : tools.filter((tool) => tool !== "workflow_update_run_settings");
  if (intent === "manifest_limits" || intent === "run_settings") {
    return intentScopedTools.filter((tool) => tool !== "workflow_propose_revision");
  }
  if (intent === "question") {
    return intentScopedTools.filter((tool) => tool !== "workflow_propose_revision" && tool !== "workflow_propose_manifest_revision");
  }
  return intentScopedTools;
}

export function isPlannerSafeBashCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return true;
  if (isPlannerNetworkCommand(trimmed)) return false;
  if (plannerBlockedCommandPatterns.some((pattern) => pattern.test(trimmed))) return false;
  return plannerSafeCommandPatterns.some((pattern) => pattern.test(trimmed));
}

export function classifyPlannerToolPermission(input: PlannerToolPolicyInput): PlannerToolDecision {
  if (input.secretPathDetail) {
    return denyPlannerTool(input, {
      title: "Planner Mode blocked sensitive file access",
      message: "Planner Mode can inspect project files, but it does not read paths that look like secrets or credentials.",
      detail: input.secretPathDetail,
      risk: "secret-path",
    });
  }

  if (input.outsideWorkspaceDetail) {
    return denyPlannerTool(input, {
      title: "Planner Mode blocked outside-workspace access",
      message: "Planner Mode is limited to read-only inspection inside the active workspace.",
      detail: input.outsideWorkspaceDetail,
      risk: "outside-workspace",
    });
  }

  if (input.toolName === "bash") {
    const command = getStringField(input.toolInput, "command") ?? "";
    if (isPlannerSafeBashCommand(command)) return { action: "allow" };
    return denyPlannerTool(input, {
      title: "Planner Mode blocked this shell command",
      message: "Planner Mode only allows local read-only shell inspection commands.",
      detail: command,
      risk: command && isPlannerNetworkCommand(command) ? "network-command" : "workspace-command",
    });
  }

  if (input.toolName.startsWith("browser_")) {
    const profileMode = getStringField(input.toolInput, "profileMode") ?? "isolated";
    if (profileMode === "copied") {
      return denyPlannerTool(input, {
        title: "Planner Mode blocked copied browser profile access",
        message: "Planner Mode can use the isolated browser, but it cannot use copied Chrome profile access.",
        detail: input.detail,
        risk: "browser-profile",
      });
    }
    if (input.toolName === "browser_nav" || input.toolName === "browser_content" || input.toolName === "browser_screenshot") {
      return { action: "allow" };
    }
    return denyPlannerTool(input, {
      title: "Planner Mode blocked browser control",
      message: "Planner Mode allows visible read-only browsing, not JavaScript evaluation, picking, login, or page mutation.",
      detail: input.detail,
      risk: input.toolName === "browser_login" ? "browser-login" : "browser-control",
    });
  }

  if (input.toolName === "workflow_update_run_settings") {
    const action = getStringField(input.toolInput, "action") ?? "propose_persistent";
    if (action === "preview_foreground") return { action: "allow" };
    return denyPlannerTool(input, {
      title: "Planner Mode blocked persistent workflow settings mutation",
      message: "Planner Mode can preview foreground workflow run settings, but persistent settings changes must be proposed as reviewable revisions.",
      detail: input.detail,
      risk: "workspace-command",
    });
  }

  if (isPlannerModeAllowedTool(input.toolName)) return { action: "allow" };

  return denyPlannerTool(input, {
    title: "Planner Mode blocked a mutating tool",
    message: "Planner Mode is read-only. Switch back to Agent Mode before editing files, running tests, or calling plugin tools.",
    detail: input.detail,
    risk: input.toolName.includes("plugin") ? "plugin-tool" : "workspace-command",
  });
}

export function extractPlannerPlanArtifactFields(content: string): Pick<
  PlannerPlanArtifact,
  "title" | "summary" | "content" | "steps" | "openQuestions" | "risks" | "verification" | "warnings" | "diagrams" | "decisionQuestions"
> {
  const normalized = content.trim();
  const decisionQuestions = extractPlannerDecisionQuestions(normalized);
  const diagrams = extractPlannerDiagramSpecs(normalized);
  const warnings = [...plannerDecisionQuestionWarnings(normalized), ...plannerDiagramWarnings(normalized)];
  const strippedContent = stripPlannerDiagramBlocks(stripPlannerDecisionQuestionBlocks(normalized)).trim();
  const planContent =
    strippedContent ||
    (decisionQuestions.length
      ? "# Planner Mode Plan\n\nAnswer the planner decisions below before finalizing this plan."
      : diagrams.length
        ? "# Planner Mode Plan\n\nReview the planner diagrams and source context before implementing this plan."
        : "");
  const lines = planContent.split(/\r?\n/);
  const title = firstHeading(lines) ?? "Planner Mode Plan";
  const summary = firstSummaryParagraph(lines) ?? "";
  return {
    title,
    summary,
    content: planContent,
    steps: extractSteps(lines),
    openQuestions: normalizePlannerOpenQuestions(extractSectionItems(lines, /questions?|open questions?|clarifications?/i)),
    risks: extractSectionItems(lines, /risks?|tradeoffs?|concerns?/i),
    verification: extractSectionItems(lines, /verification|tests?|validation|acceptance/i),
    warnings,
    diagrams,
    decisionQuestions,
  };
}

export function validatePlannerPlanArtifactContent(
  input: Pick<PlannerPlanArtifact, "content" | "steps" | "openQuestions" | "risks" | "verification" | "diagrams">,
  checkedAt = new Date(),
): PlannerDurableArtifactValidationResult {
  const content = input.content.trim();
  const errors: PlannerDurableArtifactValidationIssue[] = [];
  const warnings: PlannerDurableArtifactValidationIssue[] = [];

  if (!content) {
    errors.push({
      code: "planner-plan-empty",
      section: "source-plan",
      message: "Planner response did not contain plan content.",
    });
  }

  const strongCorruptionPatterns = [
    /\uFFFD/,
    /\bFILL_UNKNOWNS?\b/i,
    /\bHttpNotFound\b/i,
    /<\/?think\b/i,
  ];
  if (strongCorruptionPatterns.some((pattern) => pattern.test(content))) {
    errors.push({
      code: "planner-plan-corrupt-marker",
      section: "source-plan",
      message: "Planner response contained provider corruption markers, so Ambient rejected it instead of saving it as a final plan.",
    });
  }

  if (plannerPlanContainsUnextractedDiagramMarker(content, input.diagrams ?? [])) {
    errors.push({
      code: "planner-plan-invalid-diagrams",
      section: "diagram-gallery",
      message:
        "Planner response included a planner diagram marker, but Ambient could not extract any valid product diagrams. Retry finalization or repair the diagram block before creating durable HTML.",
    });
  }
  if (plannerPlanContainsInvalidDecisionQuestionMarker(content)) {
    errors.push({
      code: "planner-plan-invalid-question-block",
      section: "native-questions",
      message:
        "Planner response included an ambient-planner-questions marker that Ambient could not parse as complete native decision JSON. Retry finalization before creating durable HTML.",
    });
  }

  const structureSignals = plannerPlanStructureSignalCount(input);
  if (content.length >= 80 && structureSignals === 0) {
    errors.push({
      code: "planner-plan-missing-structure",
      section: "source-plan",
      message: "Planner response did not contain recognizable plan structure such as headings, steps, risks, or verification.",
    });
  }

  const noiseScore = plannerTextNoiseScore(content);
  if (noiseScore >= 3 && content.length >= 120) {
    errors.push({
      code: "planner-plan-corrupt-text",
      section: "source-plan",
      message: "Planner response looked like mixed-script or symbol-heavy corrupt text rather than a coherent plan.",
    });
  }

  return {
    ok: errors.length === 0,
    checkedAt: checkedAt.toISOString(),
    errors,
    warnings,
  };
}

function plannerPlanContainsUnextractedDiagramMarker(content: string, diagrams: PlannerDiagramSpec[]): boolean {
  return diagrams.length === 0 && /\bambient-planner-diagrams\b/i.test(content);
}

function plannerPlanContainsInvalidDecisionQuestionMarker(content: string): boolean {
  return plannerDecisionQuestionWarnings(content).length > 0;
}

export function sanitizePlannerFinalPlanArtifactFields<
  T extends Pick<
    PlannerPlanArtifact,
    "title" | "summary" | "content" | "steps" | "openQuestions" | "risks" | "verification" | "warnings" | "diagrams"
  > &
    Partial<Pick<PlannerPlanArtifact, "decisionQuestions">>,
>(fields: T): T {
  const strippedOptionalSections = stripPlannerOptionalNextStepSections(fields.content);
  const strippedContent = stripPlannerUngroundedGenericOutOfScopeItems(strippedOptionalSections, fields.decisionQuestions ?? []);
  if (strippedContent === fields.content.trim()) return fields;
  const extracted = extractPlannerPlanArtifactFields(strippedContent);
  return {
    ...fields,
    title: extracted.title,
    summary: extracted.summary,
    content: extracted.content,
    steps: extracted.steps,
    openQuestions: extracted.openQuestions,
    risks: extracted.risks,
    verification: extracted.verification,
    warnings: extracted.warnings,
    diagrams: extracted.diagrams,
  };
}

export function isPlannerPlanContentValidationFailure(
  validation: PlannerDurableArtifactValidationResult | undefined,
): validation is PlannerDurableArtifactValidationResult {
  return Boolean(validation?.errors.some((issue) => issue.code.startsWith("planner-plan-")));
}

export function plannerPlanArtifactValidationFailureContent(validation: PlannerDurableArtifactValidationResult): string {
  const errorLines = validation.errors.length
    ? validation.errors.map((issue) => `- ${issue.section ? `${issue.section}: ` : ""}${issue.message}`)
    : ["- Planner response failed source-plan validation."];
  return [
    "# Planner finalization failed",
    "",
    "Ambient rejected the model response because it did not look like a coherent final plan.",
    "",
    "## Validation errors",
    ...errorLines,
    "",
    "Retry finalization or revise the plan before starting implementation.",
  ].join("\n");
}

export type PlannerDurableRevisionOperation =
  | {
      op: "replace_section";
      heading: string;
      markdown: string;
    }
  | {
      op: "replace_diagrams";
      diagrams: PlannerDiagramSpec[];
      scope: "provided" | "all";
    }
  | {
      op: "replace_summary";
      summary: string;
    }
  | {
      op: "replace_title";
      title: string;
    };

export type PlannerDurableRevisionResponse =
  | {
      mode: "targeted_edit";
      artifactId: string;
      summary: string;
      operations: PlannerDurableRevisionOperation[];
    }
  | {
      mode: "full_rewrite";
      artifactId: string;
      reason: string;
      content: string;
    };

export interface AppliedPlannerDurableRevision {
  fields: Pick<
    PlannerPlanArtifact,
    "sourceMessageId" | "title" | "summary" | "content" | "steps" | "openQuestions" | "risks" | "verification" | "warnings" | "diagrams"
  >;
  messageContent: string;
  fullRewrite: boolean;
}

export function extractPlannerDurableRevisionResponse(content: string): PlannerDurableRevisionResponse | undefined {
  const jsonContent = plannerDurableRevisionJsonContent(content);
  if (!jsonContent) return undefined;
  const parsed = parseJsonObject(jsonContent);
  if (!parsed || Array.isArray(parsed)) return undefined;
  return normalizePlannerDurableRevisionResponse(parsed);
}

export function applyPlannerDurableRevisionResponse(
  existing: PlannerPlanArtifact,
  sourceMessageId: string,
  response: PlannerDurableRevisionResponse,
): AppliedPlannerDurableRevision {
  if (response.artifactId !== existing.id) {
    throw new Error(`Planner durable revision targeted ${response.artifactId}, but the active artifact is ${existing.id}.`);
  }

  if (response.mode === "full_rewrite") {
    const fields = sanitizePlannerFinalPlanArtifactFields(extractPlannerPlanArtifactFields(response.content));
    return {
      fields: {
        sourceMessageId,
        title: fields.title,
        summary: fields.summary,
        content: fields.content,
        steps: fields.steps,
        openQuestions: fields.openQuestions,
        risks: fields.risks,
        verification: fields.verification,
        warnings: fields.warnings,
        diagrams: fields.diagrams,
      },
      messageContent: fields.content,
      fullRewrite: true,
    };
  }

  let title = existing.title;
  let summary = existing.summary;
  let content = existing.content;
  let diagrams = [...(existing.diagrams ?? [])];
  const applyWarnings: string[] = [];
  const appliedLabels: string[] = [];

  for (const operation of response.operations) {
    if (operation.op === "replace_title") {
      title = operation.title;
      appliedLabels.push("title");
      continue;
    }
    if (operation.op === "replace_summary") {
      summary = operation.summary;
      appliedLabels.push("summary");
      continue;
    }
    if (operation.op === "replace_diagrams") {
      diagrams = mergePlannerDiagramRevision(diagrams, operation.diagrams, operation.scope);
      appliedLabels.push(operation.scope === "all" ? "all diagrams" : `diagram ${plannerRevisionDiagramKindsLabel(operation.diagrams)}`);
      continue;
    }
    const replacement = replaceMarkdownSection(content, operation.heading, operation.markdown);
    content = replacement.content;
    appliedLabels.push(`section "${operation.heading}"`);
    if (replacement.warning) applyWarnings.push(replacement.warning);
  }

  const extracted = extractPlannerPlanArtifactFields(content);
  const sanitized = sanitizePlannerFinalPlanArtifactFields(extracted);
  const warnings = [...(sanitized.warnings ?? []), ...applyWarnings];
  const uniqueWarnings = [...new Set(warnings)];
  const operationSummary = appliedLabels.length ? appliedLabels.join(", ") : "targeted edits";
  const sanitizedDiagrams = sanitized.diagrams ?? [];
  return {
    fields: {
      sourceMessageId,
      title,
      summary: summary || sanitized.summary,
      content: sanitized.content,
      steps: sanitized.steps,
      openQuestions: sanitized.openQuestions,
      risks: sanitized.risks,
      verification: sanitized.verification,
      warnings: uniqueWarnings,
      diagrams: sanitizedDiagrams.length ? sanitizedDiagrams : diagrams,
    },
    messageContent: [
      "# Plan revision applied",
      "",
      response.summary || "Applied targeted edits to the existing durable plan.",
      "",
      `Targeted updates: ${operationSummary}.`,
      ...(uniqueWarnings.length ? ["", "Warnings:", ...uniqueWarnings.map((warning) => `- ${warning}`)] : []),
    ].join("\n"),
    fullRewrite: false,
  };
}

export function extractPlannerDecisionQuestions(content: string): PlannerDecisionQuestion[] {
  const blocks = plannerDecisionQuestionBlocks(content);
  const questions: PlannerDecisionQuestion[] = [];
  const usedQuestionIds = new Set<string>();
  for (const block of blocks) {
    const parsed = parseJsonObject(block);
    if (!parsed) continue;
    const rawQuestions = rawPlannerDecisionQuestions(parsed);
    for (const rawQuestion of rawQuestions) {
      const question = normalizePlannerDecisionQuestion(rawQuestion, questions.length, usedQuestionIds);
      if (!question) continue;
      questions.push(question);
      if (questions.length >= 10) return questions;
    }
  }
  return questions;
}

export function extractPlannerDiagramSpecs(content: string): PlannerDiagramSpec[] {
  const blocks = plannerDiagramBlockMatches(content);
  const diagrams: PlannerDiagramSpec[] = [];
  const usedDiagramIds = new Set<string>();
  for (const block of blocks) {
    const parsed = parseJsonObject(block.content);
    if (!parsed) continue;
    const rawDiagrams = rawPlannerDiagrams(parsed);
    for (const rawDiagram of rawDiagrams) {
      const diagram = normalizePlannerDiagramSpec(rawDiagram, diagrams.length, usedDiagramIds);
      if (!diagram) continue;
      diagrams.push(diagram);
      if (diagrams.length >= 12) return diagrams;
    }
  }
  return diagrams;
}

function denyPlannerTool(
  input: PlannerToolPolicyInput,
  request: Omit<PlannerPermissionPrompt, "threadId" | "toolName">,
): PlannerToolDecision {
  return {
    action: "deny",
    reason: request.message,
    request: {
      threadId: input.threadId,
      toolName: input.toolName,
      ...request,
    },
  };
}

function getStringField(input: unknown, key: string): string | undefined {
  if (!input || typeof input !== "object" || !(key in input)) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function isPlannerNetworkCommand(command: string): boolean {
  return plannerNetworkCommandPatterns.some((pattern) => pattern.test(command));
}

function plannerDecisionQuestionBlocks(content: string): string[] {
  return plannerDecisionQuestionBlockMatches(content).map((match) => match.content);
}

function plannerDecisionQuestionWarnings(content: string): string[] {
  const validMatches = new Set(plannerDecisionQuestionBlockMatches(content).map((match) => `${match.start}:${match.end}`));
  return plannerDecisionQuestionBlockCandidates(content)
    .filter((candidate) => !validMatches.has(`${candidate.start}:${candidate.end}`))
    .map((candidate) => plannerDecisionQuestionCandidateWarning(candidate))
    .filter((warning): warning is string => Boolean(warning));
}

function stripPlannerDecisionQuestionBlocks(content: string): string {
  const matches = plannerDecisionQuestionBlockMatches(content);
  if (!matches.length) return content;
  let stripped = content;
  for (const match of [...matches].sort((left, right) => right.start - left.start)) {
    stripped = `${stripped.slice(0, match.start)}${stripped.slice(match.end)}`;
  }
  return stripped.replace(/\n{3,}/g, "\n\n");
}

function plannerDiagramWarnings(content: string): string[] {
  const validMatches = new Set(plannerDiagramBlockMatches(content).map((match) => `${match.start}:${match.end}`));
  return plannerDiagramBlockCandidates(content)
    .filter((candidate) => !validMatches.has(`${candidate.start}:${candidate.end}`))
    .map((candidate) => plannerDiagramCandidateWarning(candidate))
    .filter((warning): warning is string => Boolean(warning));
}

function stripPlannerDiagramBlocks(content: string): string {
  const matches = plannerDiagramBlockMatches(content);
  if (!matches.length) return content;
  let stripped = content;
  for (const match of [...matches].sort((left, right) => right.start - left.start)) {
    stripped = `${stripped.slice(0, match.start)}${stripped.slice(match.end)}`;
  }
  return stripped.replace(/\n{3,}/g, "\n\n");
}

function plannerDurableRevisionJsonContent(content: string): string | undefined {
  const fencePattern = /```([^\n`]*)\n([\s\S]*?)```/g;
  for (const match of content.matchAll(fencePattern)) {
    const info = match[1]?.trim() ?? "";
    const body = match[2]?.trim() ?? "";
    if (/^ambient-planner-revision$/i.test(info) && body) return body;
  }

  const tagged = content.match(/<ambient-planner-revision>\s*([\s\S]*?)\s*<\/ambient-planner-revision>/i);
  if (tagged?.[1]?.trim()) return tagged[1].trim();

  const trimmed = content.trim();
  if (!trimmed.startsWith("{") || !/"mode"\s*:/.test(trimmed)) return undefined;
  return trimmed;
}

function normalizePlannerDurableRevisionResponse(parsed: Record<string, unknown>): PlannerDurableRevisionResponse | undefined {
  const artifactId = typeof parsed.artifactId === "string" ? parsed.artifactId.trim() : "";
  const mode = typeof parsed.mode === "string" ? parsed.mode.trim() : "";
  if (!artifactId) return undefined;

  if (mode === "targeted_edit") {
    const operations = (Array.isArray(parsed.operations) ? parsed.operations : [])
      .map((operation) => normalizePlannerDurableRevisionOperation(operation))
      .filter((operation): operation is PlannerDurableRevisionOperation => Boolean(operation))
      .slice(0, 12);
    if (!operations.length) return undefined;
    const summary =
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? cleanInlineMarkdown(parsed.summary).slice(0, 500)
        : "Applied targeted edits to the existing durable plan.";
    return { mode, artifactId, summary, operations };
  }

  if (mode === "full_rewrite") {
    const content = typeof parsed.content === "string" ? parsed.content.trim() : "";
    if (!content) return undefined;
    const reason =
      typeof parsed.reason === "string" && parsed.reason.trim()
        ? cleanInlineMarkdown(parsed.reason).slice(0, 500)
        : "The requested revision requires a complete plan rewrite.";
    return { mode, artifactId, reason, content };
  }

  return undefined;
}

function normalizePlannerDurableRevisionOperation(rawOperation: unknown): PlannerDurableRevisionOperation | undefined {
  if (!rawOperation || typeof rawOperation !== "object" || Array.isArray(rawOperation)) return undefined;
  const record = rawOperation as Record<string, unknown>;
  const op = typeof record.op === "string" ? record.op.trim() : typeof record.type === "string" ? record.type.trim() : "";

  if (op === "replace_section") {
    const heading = firstStringField(record, ["heading", "sectionId", "section", "title"]);
    const markdown = firstStringField(record, ["markdown", "content", "body"]);
    if (!heading || !markdown) return undefined;
    return {
      op,
      heading: cleanInlineMarkdown(heading).slice(0, 120),
      markdown: markdown.trim().slice(0, 16_000),
    };
  }

  if (op === "replace_diagrams") {
    const diagrams = normalizePlannerRevisionDiagrams(record);
    if (!diagrams.length) return undefined;
    return {
      op,
      diagrams,
      scope: record.scope === "all" ? "all" : "provided",
    };
  }

  if (op === "replace_summary") {
    const summary = firstStringField(record, ["summary", "markdown", "content"]);
    if (!summary?.trim()) return undefined;
    return { op, summary: cleanInlineMarkdown(summary).slice(0, 500) };
  }

  if (op === "replace_title") {
    const title = firstStringField(record, ["title", "markdown", "content"]);
    if (!title?.trim()) return undefined;
    return { op, title: cleanInlineMarkdown(title).slice(0, 120) };
  }

  return undefined;
}

function normalizePlannerRevisionDiagrams(record: Record<string, unknown>): PlannerDiagramSpec[] {
  const source = Object.hasOwn(record, "diagrams") || Object.hasOwn(record, "diagram") ? record : record.payload;
  if (!source || typeof source !== "object") return [];
  const parsed = Array.isArray(source) ? source : (source as Record<string, unknown>);
  const rawDiagrams = rawPlannerDiagrams(parsed);
  const usedDiagramIds = new Set<string>();
  return rawDiagrams
    .map((rawDiagram, index) => normalizePlannerDiagramSpec(rawDiagram, index, usedDiagramIds))
    .filter((diagram): diagram is PlannerDiagramSpec => Boolean(diagram))
    .slice(0, 12);
}

function firstStringField(record: Record<string, unknown>, fields: string[]): string | undefined {
  for (const field of fields) {
    const value = record[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function mergePlannerDiagramRevision(
  existingDiagrams: PlannerDiagramSpec[],
  updatedDiagrams: PlannerDiagramSpec[],
  scope: "provided" | "all",
): PlannerDiagramSpec[] {
  if (scope === "all") return updatedDiagrams;
  const updatedCustomIds = new Set(updatedDiagrams.filter((diagram) => diagram.kind === "custom").map((diagram) => diagram.id));
  const updatedRequiredKinds = new Set(updatedDiagrams.filter((diagram) => diagram.kind !== "custom").map((diagram) => diagram.kind));
  const retained = existingDiagrams.filter((diagram) => {
    if (diagram.kind !== "custom" && updatedRequiredKinds.has(diagram.kind)) return false;
    if (diagram.kind === "custom" && updatedCustomIds.has(diagram.id)) return false;
    return true;
  });
  return [...retained, ...updatedDiagrams].slice(0, 12);
}

function plannerRevisionDiagramKindsLabel(diagrams: PlannerDiagramSpec[]): string {
  const labels = [...new Set(diagrams.map((diagram) => diagram.kind.replace(/_/g, " ")))];
  return labels.join(", ");
}

function replaceMarkdownSection(content: string, heading: string, markdown: string): { content: string; warning?: string } {
  const normalizedTarget = normalizeMarkdownHeadingText(heading);
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => normalizeMarkdownHeadingText(markdownHeadingText(line) ?? "") === normalizedTarget);
  const replacementBody = stripDuplicateReplacementHeading(markdown.trim(), normalizedTarget);
  if (start === -1) {
    const nextContent = [content.trimEnd(), "", `## ${heading}`, "", replacementBody].filter((part) => part.length > 0).join("\n");
    return {
      content: nextContent,
      warning: `Targeted revision appended missing section "${heading}" because the existing plan did not contain that heading.`,
    };
  }

  const startHeading = lines[start];
  const startLevel = markdownHeadingLevel(startHeading) ?? 2;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const level = markdownHeadingLevel(lines[index]);
    if (level !== undefined && level <= startLevel) {
      end = index;
      break;
    }
  }
  const replacementLines = [startHeading, "", replacementBody].filter((line) => line.length > 0);
  return {
    content: [...lines.slice(0, start), ...replacementLines, ...lines.slice(end)].join("\n").replace(/\n{3,}/g, "\n\n").trim(),
  };
}

function stripPlannerOptionalNextStepSections(content: string): string {
  const lines = content.trim().split(/\r?\n/);
  const stripped: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const heading = markdownHeadingText(lines[index]);
    const level = markdownHeadingLevel(lines[index]);
    if (!heading || level === undefined || !isPlannerOptionalNextStepHeading(heading)) {
      stripped.push(lines[index]);
      continue;
    }
    index += 1;
    while (index < lines.length) {
      const nextLevel = markdownHeadingLevel(lines[index]);
      if (nextLevel !== undefined && nextLevel <= level) {
        index -= 1;
        break;
      }
      index += 1;
    }
  }
  return stripped.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function stripPlannerUngroundedGenericOutOfScopeItems(content: string, decisionQuestions: PlannerDecisionQuestion[]): string {
  const lines = content.trim().split(/\r?\n/);
  const evidence = plannerScopeEvidenceText(lines, decisionQuestions);
  const stripped: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const heading = markdownHeadingText(lines[index]);
    const level = markdownHeadingLevel(lines[index]);
    if (heading && level !== undefined && isPlannerOutOfScopeHeading(heading)) {
      let end = lines.length;
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const nextLevel = markdownHeadingLevel(lines[cursor]);
        if (nextLevel !== undefined && nextLevel <= level) {
          end = cursor;
          break;
        }
      }
      const cleanedSection = lines
        .slice(index + 1, end)
        .map((line) => stripPlannerGenericOutOfScopeLine(line, evidence))
        .filter((line): line is string => line !== undefined);
      if (cleanedSection.some((line) => line.trim())) {
        stripped.push(lines[index], ...cleanedSection);
      }
      index = end - 1;
      continue;
    }

    const cleanedLine = stripPlannerInlineOutOfScopeLine(lines[index], evidence);
    if (cleanedLine !== undefined) stripped.push(cleanedLine);
  }
  return stripped.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function isPlannerOptionalNextStepHeading(heading: string): boolean {
  const normalized = normalizeMarkdownHeadingText(heading);
  return /^(optional next steps?|optional enhancements?|future work|future enhancements?|later work|roadmap|backlog|stretch goals?|nice to haves?)$/.test(
    normalized,
  );
}

function isPlannerOutOfScopeHeading(heading: string): boolean {
  const normalized = normalizeMarkdownHeadingText(heading);
  return /^(out of scope|excluded scope|not in scope|scope exclusions?)$/.test(normalized);
}

function stripPlannerInlineOutOfScopeLine(line: string, evidence: string): string | undefined {
  const match = line.match(/^(\s*(?:[-*+]\s*)?(?:\*\*)?out\s+of\s+scope(?:\s*\([^)]*\))?\s*:\s*(?:\*\*)?\s*)(.+)$/i);
  if (!match?.[1] || !match[2]) return line;
  const cleaned = stripPlannerGenericOutOfScopeText(match[2], evidence);
  return cleaned ? `${match[1]}${cleaned}` : undefined;
}

function stripPlannerGenericOutOfScopeLine(line: string, evidence: string): string | undefined {
  const inline = stripPlannerInlineOutOfScopeLine(line, evidence);
  if (inline !== line) return inline;
  const bullet = line.match(/^(\s*(?:[-*+]\s+|\d+[.)]\s+))(.+)$/);
  if (!bullet?.[1] || !bullet[2]) return line;
  const cleaned = stripPlannerGenericOutOfScopeText(bullet[2], evidence);
  return cleaned ? `${bullet[1]}${cleaned}` : undefined;
}

function stripPlannerGenericOutOfScopeText(text: string, evidence: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const trailingPunctuation = trimmed.match(/[.;]$/)?.[0] ?? "";
  const core = trailingPunctuation ? trimmed.slice(0, -1).trim() : trimmed;
  const parts = splitPlannerOutOfScopeItems(core);
  const kept = parts.filter((part) => !isPlannerUngroundedGenericOutOfScopeItem(part, evidence));
  if (kept.length === parts.length) return trimmed;
  const joined = kept.join(", ").trim();
  if (!joined) return "";
  return `${joined}${trailingPunctuation}`;
}

function splitPlannerOutOfScopeItems(text: string): string[] {
  return text
    .split(/\s*[,;]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isPlannerUngroundedGenericOutOfScopeItem(item: string, evidence: string): boolean {
  const feature = plannerGenericOutOfScopeFeatureForText(item);
  if (!feature) return false;
  return !plannerGenericOutOfScopeFeatureForText(evidence, feature.id);
}

function plannerGenericOutOfScopeFeatureForText(text: string, featureId?: string): PlannerGenericOutOfScopeFeature | undefined {
  const normalized = cleanInlineMarkdown(text);
  return plannerGenericOutOfScopeFeatures.find((feature) => {
    if (featureId && feature.id !== featureId) return false;
    return feature.patterns.some((pattern) => pattern.test(normalized));
  });
}

function plannerScopeEvidenceText(lines: string[], decisionQuestions: PlannerDecisionQuestion[]): string {
  const evidenceLines: string[] = [];
  for (const line of lines) {
    const cleaned = cleanInlineMarkdown(line);
    if (/^(user request|requested|original request|source request)\s*:/i.test(cleaned)) {
      evidenceLines.push(cleaned);
    }
  }
  for (const question of decisionQuestions) {
    const answer = question.answer;
    if (!answer) continue;
    const option =
      answer.kind === "option"
        ? question.options.find((candidate) => candidate.id === answer.optionId)
        : undefined;
    evidenceLines.push(
      [
        question.question,
        option?.label,
        option?.description,
        answer.kind === "custom" ? answer.customText : undefined,
      ]
        .filter((part): part is string => Boolean(part?.trim()))
        .join(" "),
    );
  }
  return evidenceLines.join("\n");
}

function stripDuplicateReplacementHeading(markdown: string, normalizedTarget: string): string {
  const lines = markdown.split(/\r?\n/);
  const first = lines[0];
  if (first && normalizeMarkdownHeadingText(markdownHeadingText(first) ?? "") === normalizedTarget) {
    return lines.slice(1).join("\n").trim();
  }
  return markdown;
}

function markdownHeadingLevel(line: string): number | undefined {
  return line.match(/^\s{0,3}(#{1,6})\s+.+?\s*#*\s*$/)?.[1]?.length;
}

function markdownHeadingText(line: string): string | undefined {
  return line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/)?.[1];
}

function normalizeMarkdownHeadingText(value: string): string {
  return cleanInlineMarkdown(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function plannerDiagramBlockMatches(content: string): Array<{ start: number; end: number; content: string }> {
  return plannerDiagramBlockCandidates(content)
    .map((candidate) => {
      const blockContent = plannerDiagramJsonContent(candidate.content);
      return blockContent ? { start: candidate.start, end: candidate.end, content: blockContent } : undefined;
    })
    .filter((match): match is { start: number; end: number; content: string } => Boolean(match))
    .sort((left, right) => left.start - right.start);
}

function plannerDiagramBlockCandidates(content: string): Array<{ start: number; end: number; content: string; source: string }> {
  const matches: Array<{ start: number; end: number; content: string; source: string }> = [];
  const fencedPattern = /```([^\n`]*)\n([\s\S]*?)```/g;
  let fenced: RegExpExecArray | null;
  while ((fenced = fencedPattern.exec(content)) !== null) {
    const info = (fenced[1] ?? "").trim();
    const body = fenced[2] ?? "";
    const blockContent = /ambient-planner-diagrams/i.test(info)
      ? body.trim()
      : unwrapPlannerDiagramTag(body) ??
        unwrapBarePlannerMarkerBlock(body, "ambient-planner-diagrams") ??
        (isJsonFence(info) && looksLikePlannerDiagramJson(body) ? body.trim() : undefined);
    if (!blockContent) continue;
    matches.push({ start: fenced.index, end: fenced.index + fenced[0].length, content: blockContent, source: info || "fence" });
  }

  const tagPattern = /<ambient-planner-diagrams>\s*([\s\S]*?)\s*<\/ambient-planner-diagrams>/gi;
  let tagged: RegExpExecArray | null;
  while ((tagged = tagPattern.exec(content)) !== null) {
    if (matches.some((match) => tagged!.index >= match.start && tagged!.index < match.end)) continue;
    const blockContent = tagged[1]?.trim();
    if (!blockContent) continue;
    matches.push({ start: tagged.index, end: tagged.index + tagged[0].length, content: blockContent, source: "ambient-planner-diagrams tag" });
  }

  const trimmed = content.trim();
  const topLevelJsonContent = looksLikePlannerDiagramJson(trimmed) ? trimmed : undefined;
  if (topLevelJsonContent) {
    const start = content.indexOf(trimmed);
    const end = start + trimmed.length;
    if (!matches.some((match) => start >= match.start && start < match.end)) {
      matches.push({ start, end, content: topLevelJsonContent, source: "top-level JSON" });
    }
  }

  addBarePlannerMarkerCandidates(matches, content, "ambient-planner-diagrams", "bare ambient-planner-diagrams marker");

  return matches.sort((left, right) => left.start - right.start);
}

function unwrapPlannerDiagramTag(content: string): string | undefined {
  const trimmed = content.trim();
  const tagged = trimmed.match(/^<ambient-planner-diagrams>\s*([\s\S]*?)\s*<\/ambient-planner-diagrams>\s*$/i);
  if (tagged?.[1]) return tagged[1].trim();
  if (/^<ambient-planner-diagrams>\s*/i.test(trimmed)) {
    const withoutOpenTag = trimmed.replace(/^<ambient-planner-diagrams>\s*/i, "").trim();
    if (withoutOpenTag.startsWith("{") || withoutOpenTag.startsWith("[")) return withoutOpenTag;
  }
  return undefined;
}

function plannerDecisionQuestionBlockMatches(content: string): Array<{ start: number; end: number; content: string }> {
  return plannerDecisionQuestionBlockCandidates(content)
    .map((candidate) => {
      const blockContent = plannerDecisionQuestionJsonContent(candidate.content);
      return blockContent ? { start: candidate.start, end: candidate.end, content: blockContent } : undefined;
    })
    .filter((match): match is { start: number; end: number; content: string } => Boolean(match))
    .sort((left, right) => left.start - right.start);
}

function plannerDecisionQuestionBlockCandidates(content: string): Array<{ start: number; end: number; content: string; source: string }> {
  const matches: Array<{ start: number; end: number; content: string; source: string }> = [];
  const fencedPattern = /```([^\n`]*)\n([\s\S]*?)```/g;
  let fenced: RegExpExecArray | null;
  while ((fenced = fencedPattern.exec(content)) !== null) {
    const info = (fenced[1] ?? "").trim();
    const body = fenced[2] ?? "";
    const blockContent = /ambient-planner-questions/i.test(info)
      ? body.trim()
      : unwrapPlannerDecisionQuestionTag(body) ??
        unwrapBarePlannerMarkerBlock(body, "ambient-planner-questions") ??
        (isJsonFence(info) && looksLikePlannerDecisionQuestionJson(body) ? body.trim() : undefined);
    if (!blockContent) continue;
    matches.push({ start: fenced.index, end: fenced.index + fenced[0].length, content: blockContent, source: info || "fence" });
  }

  const tagPattern = /<ambient-planner-questions>\s*([\s\S]*?)\s*<\/ambient-planner-questions>/gi;
  let tagged: RegExpExecArray | null;
  while ((tagged = tagPattern.exec(content)) !== null) {
    if (matches.some((match) => tagged!.index >= match.start && tagged!.index < match.end)) continue;
    const blockContent = tagged[1]?.trim();
    if (!blockContent) continue;
    matches.push({ start: tagged.index, end: tagged.index + tagged[0].length, content: blockContent, source: "ambient-planner-questions tag" });
  }

  const trimmed = content.trim();
  const topLevelJsonContent = looksLikePlannerDecisionQuestionJson(trimmed) ? trimmed : undefined;
  if (topLevelJsonContent) {
    const start = content.indexOf(trimmed);
    const end = start + trimmed.length;
    if (!matches.some((match) => start >= match.start && start < match.end)) {
      matches.push({ start, end, content: topLevelJsonContent, source: "top-level JSON" });
    }
  }

  addBarePlannerMarkerCandidates(matches, content, "ambient-planner-questions", "bare ambient-planner-questions marker");

  return matches.sort((left, right) => left.start - right.start);
}

function unwrapPlannerDecisionQuestionTag(content: string): string | undefined {
  const trimmed = content.trim();
  const tagged = trimmed.match(/^<ambient-planner-questions>\s*([\s\S]*?)\s*<\/ambient-planner-questions>\s*$/i);
  if (tagged?.[1]) return tagged[1].trim();
  if (/^<ambient-planner-questions>\s*/i.test(trimmed)) {
    const withoutOpenTag = trimmed.replace(/^<ambient-planner-questions>\s*/i, "").trim();
    if (withoutOpenTag.startsWith("{") || withoutOpenTag.startsWith("[")) return withoutOpenTag;
  }
  return undefined;
}

function unwrapBarePlannerMarkerBlock(content: string, marker: string): string | undefined {
  const trimmed = content.trim();
  const markerPattern = new RegExp(`^${escapeRegExp(marker)}\\s*:?\\s*(?:\\r?\\n)+`, "i");
  const match = trimmed.match(markerPattern);
  if (!match) return undefined;
  const jsonRange = findJsonValueRange(trimmed, match[0].length);
  return jsonRange ? trimmed.slice(jsonRange.start, jsonRange.end).trim() : trimmed.slice(match[0].length).trim();
}

function addBarePlannerMarkerCandidates(
  matches: Array<{ start: number; end: number; content: string; source: string }>,
  content: string,
  marker: string,
  source: string,
): void {
  const markerPattern = new RegExp(`(^|\\r?\\n)([ \\t]*${escapeRegExp(marker)}[ \\t]*:?)[ \\t]*(?:\\r?\\n)+`, "gi");
  let markerMatch: RegExpExecArray | null;
  while ((markerMatch = markerPattern.exec(content)) !== null) {
    const markerStart = markerMatch.index + markerMatch[1].length;
    const jsonRange = findJsonValueRange(content, markerPattern.lastIndex);
    const contentStart = jsonRange?.start ?? markerPattern.lastIndex;
    const candidate = {
      start: markerStart,
      end: jsonRange?.end ?? content.length,
      content: content.slice(contentStart, jsonRange?.end ?? content.length).trim(),
      source,
    };
    if (!candidate.content || matches.some((match) => rangesOverlap(candidate, match))) continue;
    matches.push(candidate);
  }
}

function findJsonValueRange(content: string, startIndex: number): { start: number; end: number } | undefined {
  let start = startIndex;
  while (start < content.length && /\s/.test(content[start])) start += 1;
  const opening = content[start];
  const firstClosing = opening === "{" ? "}" : opening === "[" ? "]" : undefined;
  if (!firstClosing) return undefined;

  const closings: string[] = [firstClosing];
  let inString = false;
  let escaping = false;
  for (let index = start + 1; index < content.length; index += 1) {
    const char = content[index];
    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") {
      closings.push(char === "{" ? "}" : "]");
      continue;
    }
    if (char === "}" || char === "]") {
      const expected = closings.pop();
      if (char !== expected) return undefined;
      if (!closings.length) return { start, end: index + 1 };
    }
  }
  return undefined;
}

function rangesOverlap(
  left: { start: number; end: number },
  right: { start: number; end: number },
): boolean {
  return left.start < right.end && right.start < left.end;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isJsonFence(info: string): boolean {
  return /^json(?:\s|$)/i.test(info.trim());
}

function looksLikePlannerDecisionQuestionJson(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return false;
  const parsed = parseJsonObject(trimmed);
  if (parsed) return rawPlannerDecisionQuestions(parsed).length > 0 || hasPlannerDecisionQuestionContainer(parsed);
  return /["']decisionQuestions["']\s*:|["']questions["']\s*:|["']question["']\s*:[\s\S]*["']options["']\s*:/.test(trimmed);
}

function plannerDecisionQuestionJsonContent(content: string): string | undefined {
  const trimmed = content.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return undefined;
  const parsed = parseJsonObject(trimmed);
  if (!parsed) return undefined;
  return rawPlannerDecisionQuestions(parsed).some((rawQuestion, index) => normalizePlannerDecisionQuestion(rawQuestion, index, new Set())) ? trimmed : undefined;
}

function looksLikePlannerDiagramJson(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return false;
  const parsed = parseJsonObject(trimmed);
  if (parsed) return rawPlannerDiagrams(parsed).length > 0 || hasPlannerDiagramContainer(parsed);
  return /["']diagrams["']\s*:|["']diagram["']\s*:|["']nodes["']\s*:/.test(trimmed);
}

function plannerDiagramJsonContent(content: string): string | undefined {
  const trimmed = content.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return undefined;
  const parsed = parseJsonObject(trimmed);
  if (!parsed) return undefined;
  return rawPlannerDiagrams(parsed).some((rawDiagram, index) => normalizePlannerDiagramSpec(rawDiagram, index, new Set())) ? trimmed : undefined;
}

function plannerDecisionQuestionCandidateWarning(candidate: { content: string; source: string }): string | undefined {
  const parsed = parseJsonObject(candidate.content);
  if (!parsed) return `Planner question block in ${candidate.source} is not valid JSON, so Ambient could not turn it into native questions.`;
  const rawQuestions = rawPlannerDecisionQuestions(parsed);
  if (!rawQuestions.length) return `Planner question block in ${candidate.source} did not contain questions, decisionQuestions, or a complete question/options object.`;
  return `Planner question block in ${candidate.source} did not contain any valid question with at least two options.`;
}

function plannerDiagramCandidateWarning(candidate: { content: string; source: string }): string | undefined {
  const parsed = parseJsonObject(candidate.content);
  if (!parsed) return `Planner diagram block in ${candidate.source} is not valid JSON, so Ambient could not render it into the durable plan.`;
  const rawDiagrams = rawPlannerDiagrams(parsed);
  if (!rawDiagrams.length) return `Planner diagram block in ${candidate.source} did not contain a diagrams array or complete diagram object.`;
  return `Planner diagram block in ${candidate.source} did not contain any valid diagram with nodes Ambient can render.`;
}

function parseJsonObject(content: string): Record<string, unknown> | unknown[] | undefined {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown> | unknown[];
  } catch {
    return undefined;
  }
  return undefined;
}

function rawPlannerDecisionQuestions(parsed: Record<string, unknown> | unknown[]): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.questions)) return parsed.questions;
  if (Array.isArray(parsed.decisionQuestions)) return parsed.decisionQuestions;
  if (isPlannerDecisionQuestionLike(parsed)) return [parsed];
  const nestedQuestion = (parsed as Record<string, unknown>)["question"];
  if (nestedQuestion && typeof nestedQuestion === "object" && !Array.isArray(nestedQuestion)) return [nestedQuestion];
  return [];
}

function hasPlannerDecisionQuestionContainer(parsed: Record<string, unknown> | unknown[]): boolean {
  if (Array.isArray(parsed)) return false;
  return Object.hasOwn(parsed, "questions") || Object.hasOwn(parsed, "decisionQuestions") || Object.hasOwn(parsed, "question");
}

function isPlannerDecisionQuestionLike(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.question === "string" && Array.isArray(record.options);
}

function rawPlannerDiagrams(parsed: Record<string, unknown> | unknown[]): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.diagrams)) return parsed.diagrams;
  if (isPlannerDiagramLike(parsed)) return [parsed];
  const nestedDiagram = (parsed as Record<string, unknown>)["diagram"];
  if (nestedDiagram && typeof nestedDiagram === "object" && !Array.isArray(nestedDiagram)) return [nestedDiagram];
  return [];
}

function hasPlannerDiagramContainer(parsed: Record<string, unknown> | unknown[]): boolean {
  if (Array.isArray(parsed)) return false;
  return Object.hasOwn(parsed, "diagrams") || Object.hasOwn(parsed, "diagram");
}

function isPlannerDiagramLike(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.nodes) && (typeof record.title === "string" || typeof record.id === "string" || typeof record.kind === "string");
}

function normalizePlannerDecisionQuestion(
  rawQuestion: unknown,
  index: number,
  usedQuestionIds: Set<string>,
): PlannerDecisionQuestion | undefined {
  if (!rawQuestion || typeof rawQuestion !== "object" || Array.isArray(rawQuestion)) return undefined;
  const record = rawQuestion as Record<string, unknown>;
  const questionText = typeof record.question === "string" ? cleanInlineMarkdown(record.question).trim() : "";
  if (questionText.length < 8) return undefined;
  const rawOptions = Array.isArray(record.options) ? record.options : [];
  const usedOptionIds = new Set<string>();
  const options = rawOptions
    .map((option, optionIndex) => normalizePlannerDecisionOption(option, optionIndex, usedOptionIds))
    .filter((option): option is PlannerDecisionOption => Boolean(option))
    .filter((option) => option.id !== "custom" && option.label.toLowerCase() !== "custom")
    .slice(0, 6);
  if (options.length < 2) return undefined;

  const questionId = uniqueSlug(typeof record.id === "string" ? record.id : undefined, `question-${index + 1}`, usedQuestionIds);
  const requestedRecommended = typeof record.recommendedOptionId === "string" ? record.recommendedOptionId.trim() : "";
  const recommendedOptionId = options.some((option) => option.id === requestedRecommended) ? requestedRecommended : options[0].id;
  const sortedOptions = [
    ...options.filter((option) => option.id === recommendedOptionId),
    ...options.filter((option) => option.id !== recommendedOptionId),
  ];

  return {
    id: questionId,
    question: questionText.slice(0, 300),
    recommendedOptionId,
    required: record.required === true,
    options: sortedOptions,
  };
}

function normalizePlannerDecisionOption(
  rawOption: unknown,
  index: number,
  usedOptionIds: Set<string>,
): PlannerDecisionOption | undefined {
  if (!rawOption || typeof rawOption !== "object" || Array.isArray(rawOption)) return undefined;
  const record = rawOption as Record<string, unknown>;
  const label = typeof record.label === "string" ? cleanInlineMarkdown(record.label).trim() : "";
  if (!label) return undefined;
  return {
    id: uniqueSlug(typeof record.id === "string" ? record.id : undefined, `option-${index + 1}`, usedOptionIds),
    label: label.slice(0, 60),
    description: typeof record.description === "string" ? cleanInlineMarkdown(record.description).trim().slice(0, 500) : "",
  };
}

function normalizePlannerDiagramSpec(
  rawDiagram: unknown,
  index: number,
  usedDiagramIds: Set<string>,
): PlannerDiagramSpec | undefined {
  if (!rawDiagram || typeof rawDiagram !== "object" || Array.isArray(rawDiagram)) return undefined;
  const record = rawDiagram as Record<string, unknown>;
  const rawNodes = Array.isArray(record.nodes) ? record.nodes : [];
  const usedNodeIds = new Set<string>();
  const nodeAliases = new Map<string, string>();
  const nodes = rawNodes
    .map((rawNode, nodeIndex) => normalizePlannerDiagramNode(rawNode, nodeIndex, usedNodeIds, nodeAliases))
    .filter((node): node is PlannerDiagramNode => Boolean(node))
    .slice(0, 16);
  if (!nodes.length) return undefined;

  const nodeIds = new Set(nodes.map((node) => node.id));
  const rawEdges = Array.isArray(record.edges) ? record.edges : [];
  const edges = rawEdges
    .map((rawEdge) => normalizePlannerDiagramEdge(rawEdge, nodeIds, nodeAliases))
    .filter((edge): edge is PlannerDiagramEdge => Boolean(edge))
    .slice(0, 24);
  const kind = normalizePlannerDiagramKind(typeof record.kind === "string" ? record.kind : undefined);
  const title =
    typeof record.title === "string" && record.title.trim()
      ? cleanInlineMarkdown(record.title).slice(0, 80)
      : plannerDiagramKindTitle(kind, index);

  return {
    id: uniqueSlug(typeof record.id === "string" ? record.id : title, `diagram-${index + 1}`, usedDiagramIds),
    title,
    kind,
    ...(typeof record.purpose === "string" && record.purpose.trim() ? { purpose: cleanInlineMarkdown(record.purpose).slice(0, 240) } : {}),
    nodes,
    edges,
    ...(typeof record.layoutHint === "string" && record.layoutHint.trim() ? { layoutHint: cleanInlineMarkdown(record.layoutHint).slice(0, 160) } : {}),
    ...(typeof record.fallbackSummary === "string" && record.fallbackSummary.trim()
      ? { fallbackSummary: cleanInlineMarkdown(record.fallbackSummary).slice(0, 360) }
      : {}),
  };
}

function normalizePlannerDiagramNode(
  rawNode: unknown,
  index: number,
  usedNodeIds: Set<string>,
  nodeAliases: Map<string, string>,
): PlannerDiagramNode | undefined {
  if (!rawNode || typeof rawNode !== "object" || Array.isArray(rawNode)) return undefined;
  const record = rawNode as Record<string, unknown>;
  const rawId = typeof record.id === "string" ? record.id.trim() : "";
  const rawLabel = typeof record.label === "string" ? record.label.trim() : "";
  const label = cleanInlineMarkdown(rawLabel || rawId);
  if (!label) return undefined;
  const id = uniqueSlug(rawId || label, `node-${index + 1}`, usedNodeIds);
  for (const alias of [rawId, rawLabel, slugBase(rawId, ""), slugBase(rawLabel, "")]) {
    if (alias) nodeAliases.set(alias, id);
  }
  return {
    id,
    label: label.slice(0, 80),
    ...(typeof record.role === "string" && record.role.trim() ? { role: cleanInlineMarkdown(record.role).slice(0, 180) } : {}),
  };
}

function normalizePlannerDiagramEdge(
  rawEdge: unknown,
  nodeIds: Set<string>,
  nodeAliases: Map<string, string>,
): PlannerDiagramEdge | undefined {
  if (!rawEdge || typeof rawEdge !== "object" || Array.isArray(rawEdge)) return undefined;
  const record = rawEdge as Record<string, unknown>;
  const from = resolvePlannerDiagramNodeRef(typeof record.from === "string" ? record.from : undefined, nodeIds, nodeAliases);
  const to = resolvePlannerDiagramNodeRef(typeof record.to === "string" ? record.to : undefined, nodeIds, nodeAliases);
  if (!from || !to || from === to) return undefined;
  return {
    from,
    to,
    ...(typeof record.label === "string" && record.label.trim() ? { label: cleanInlineMarkdown(record.label).slice(0, 80) } : {}),
  };
}

function resolvePlannerDiagramNodeRef(raw: string | undefined, nodeIds: Set<string>, nodeAliases: Map<string, string>): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  if (nodeIds.has(trimmed)) return trimmed;
  const slugged = slugBase(trimmed, "");
  if (nodeIds.has(slugged)) return slugged;
  const alias = nodeAliases.get(trimmed) ?? nodeAliases.get(slugged);
  return alias && nodeIds.has(alias) ? alias : undefined;
}

function normalizePlannerDiagramKind(raw: string | undefined): PlannerDiagramKind {
  const normalized = raw?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  switch (normalized) {
    case "architecture":
      return "architecture";
    case "dependencies":
    case "dependency":
      return "dependencies";
    case "program_flow":
    case "program":
    case "flow":
      return "program_flow";
    case "functional_nonfunctional":
    case "functional_and_non_functional":
    case "functional_non_functional":
    case "concerns":
      return "functional_nonfunctional";
    default:
      return "custom";
  }
}

function plannerDiagramKindTitle(kind: PlannerDiagramKind, index: number): string {
  switch (kind) {
    case "architecture":
      return "Architecture";
    case "dependencies":
      return "Dependencies";
    case "program_flow":
      return "Program Flow";
    case "functional_nonfunctional":
      return "Functional And Non-Functional Concerns";
    default:
      return `Planner Diagram ${index + 1}`;
  }
}

function uniqueSlug(raw: string | undefined, fallback: string, used: Set<string>): string {
  const base = slugBase(raw, fallback);
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function slugBase(raw: string | undefined, fallback: string): string {
  return (
    raw
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || fallback
  );
}

function plannerPlanStructureSignalCount(
  input: Pick<PlannerPlanArtifact, "content" | "steps" | "openQuestions" | "risks" | "verification" | "diagrams">,
): number {
  const content = input.content;
  const signals = [
    /^\s{0,3}#{1,6}\s+\S/m.test(content),
    /(?:^|\n)\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(content),
    /(?:^|\n)\s*(?:plan|implementation|steps?|phases?|scope|risks?|verification|tests?|validation|decisions?|architecture|dependencies)\s*:/i.test(
      content,
    ),
    input.steps.length > 0,
    input.openQuestions.length > 0,
    input.risks.length > 0,
    input.verification.length > 0,
    (input.diagrams ?? []).length > 0,
  ];
  return signals.filter(Boolean).length;
}

function plannerTextNoiseScore(content: string): number {
  const chars = [...content].filter((char) => !/\s/u.test(char));
  if (!chars.length) return 0;
  const symbolRatio = chars.filter((char) => plannerSuspiciousSymbolPattern.test(char)).length / chars.length;
  const underscoreRatio = chars.filter((char) => char === "_").length / chars.length;
  const families = plannerScriptFamilies(content);
  const tokens = content.split(/\s+/).filter(Boolean);
  const suspiciousTokenRatio = tokens.length ? tokens.filter(isSuspiciousPlannerToken).length / tokens.length : 0;
  return [
    families.size >= 4,
    symbolRatio > 0.08,
    underscoreRatio > 0.025,
    suspiciousTokenRatio > 0.2,
  ].filter(Boolean).length;
}

const plannerSuspiciousSymbolPattern = /[^\p{L}\p{N}\s.,;:!?'"()[\]{}#\-*\/`~&@%+=<>|\\]/u;

function isSuspiciousPlannerToken(token: string): boolean {
  const chars = [...token];
  if (chars.length < 10) return false;
  const nonWordRatio = chars.filter((char) => !/[\p{L}\p{N}-]/u.test(char)).length / chars.length;
  const families = plannerScriptFamilies(token);
  if (families.size >= 3) return true;
  if (families.size >= 2 && nonWordRatio > 0.2) return true;
  return token.includes("_") && families.size >= 2;
}

function plannerScriptFamilies(text: string): Set<string> {
  const families = new Set<string>();
  for (const char of text) {
    if (/\p{Script=Latin}/u.test(char)) families.add("latin");
    else if (/\p{Script=Han}/u.test(char)) families.add("han");
    else if (/\p{Script=Cyrillic}/u.test(char)) families.add("cyrillic");
    else if (/\p{Script=Hiragana}/u.test(char) || /\p{Script=Katakana}/u.test(char)) families.add("japanese");
    else if (/\p{Script=Greek}/u.test(char)) families.add("greek");
    else if (/\p{Script=Arabic}/u.test(char)) families.add("arabic");
    else if (/\p{Script=Hebrew}/u.test(char)) families.add("hebrew");
    else if (/\p{Script=Devanagari}/u.test(char)) families.add("devanagari");
  }
  return families;
}

function firstHeading(lines: string[]): string | undefined {
  for (const line of lines) {
    const heading = line.match(/^\s{0,3}#{1,3}\s+(.+?)\s*#*\s*$/);
    if (heading?.[1]) return cleanInlineMarkdown(heading[1]).slice(0, 120);
  }
  return undefined;
}

function firstSummaryParagraph(lines: string[]): string | undefined {
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^\s{0,3}#{1,6}\s+/.test(trimmed)) continue;
    if (/^[-*+]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed) || /^>\s+/.test(trimmed)) continue;
    return cleanInlineMarkdown(trimmed).slice(0, 500);
  }
  return undefined;
}

function extractSteps(lines: string[]): PlannerPlanStep[] {
  const steps: PlannerPlanStep[] = [];
  let inPlanSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const heading = trimmed.match(/^#{1,4}\s+(.+)$/);
    if (heading) {
      const label = heading[1].toLowerCase();
      const optionalSection = /\b(optional|future|later|backlog|stretch|nice[-\s]?to[-\s]?have)\b/.test(label);
      inPlanSection = !optionalSection && /\b(plan|implementation|stages?|steps?|phases?)\b/.test(label);
      continue;
    }
    const numbered = trimmed.match(/^(\d+)[.)]\s+(?:\[[ xX-]\]\s+)?(.+)$/);
    const checklist = trimmed.match(/^[-*+]\s+\[[ xX-]\]\s+(.+)$/);
    const bullet = inPlanSection ? trimmed.match(/^[-*+]\s+(.+)$/) : undefined;
    const text = numbered?.[2] ?? checklist?.[1] ?? bullet?.[1];
    if (!text) continue;
    const title = cleanInlineMarkdown(text);
    if (title.length < 3) continue;
    steps.push({ id: `step-${steps.length + 1}`, title: title.slice(0, 180) });
    if (steps.length >= 40) break;
  }
  return steps;
}

function extractSectionItems(lines: string[], sectionPattern: RegExp): string[] {
  const items: string[] = [];
  let inSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const heading = trimmed.match(/^#{1,4}\s+(.+)$/);
    if (heading) {
      inSection = sectionPattern.test(heading[1]);
      continue;
    }
    if (!inSection) continue;
    const item = trimmed.match(/^[-*+]\s+(?:\[[ xX-]\]\s+)?(.+)$/) ?? trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (item?.[1]) items.push(cleanInlineMarkdown(item[1]).slice(0, 300));
    if (items.length >= 20) break;
  }
  return items;
}

export function normalizePlannerOpenQuestions(items: string[]): string[] {
  const normalized: string[] = [];
  for (const item of items) {
    const question = cleanInlineMarkdown(item).slice(0, 300);
    if (!question || plannerOpenQuestionItemMeansNone(question)) continue;
    if (normalized.some((existing) => existing.toLowerCase() === question.toLowerCase())) continue;
    normalized.push(question);
    if (normalized.length >= 20) break;
  }
  return normalized;
}

function plannerOpenQuestionItemMeansNone(item: string): boolean {
  const normalized = item
    .toLowerCase()
    .replace(/n\/a/g, "not applicable")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!normalized) return true;
  if (["none", "not applicable"].includes(normalized)) return true;
  return (
    /^none (material|known|identified|required|needed|remaining|open|unresolved)\b/.test(normalized) ||
    /^no (open |unresolved |remaining |material )?(questions|clarifications|decisions|unknowns)\b/.test(normalized) ||
    /\b(no|none) (planner )?decisions? (are )?(needed|required|open|remaining)\b/.test(normalized) ||
    /\b(no|none) (open |unresolved |remaining )?(questions|clarifications) (remain|remaining|are needed|are required)\b/.test(normalized)
  );
}

function cleanInlineMarkdown(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
