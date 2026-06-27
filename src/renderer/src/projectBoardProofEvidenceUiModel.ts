import type {
  ProjectBoardCard,
  ProjectBoardCardProofRecommendedAction,
  ProjectBoardCardProofReviewStatus,
} from "../../shared/projectBoardTypes";
import type { OrchestrationRun } from "../../shared/workflowTypes";
import type {
  ProjectBoardProofEvidenceArtifact,
  ProjectBoardProofEvidenceFile,
  ProjectBoardProofEvidenceFileGroup,
  ProjectBoardProofEvidenceMetric,
  ProjectBoardProofEvidenceModel,
  ProjectBoardProofEvidenceReview,
  ProjectBoardProofEvidenceTone,
  ProjectBoardProofVisualRole,
  ProjectBoardTaskActionEvidence,
} from "./projectBoardProofEvidenceTypes";
import {
  projectBoardEmptyProofPacketInspection,
  projectBoardProofPacketInspectionModel,
  projectBoardProofVisualRoleFromArtifactData,
  projectBoardProofVisualRoleLabel,
} from "./projectBoardProofInspectionUiModel";
import { truncateProjectBoardLedgerText } from "./projectBoardProofTextUiModel";

export type {
  ProjectBoardProofEvidenceArtifact,
  ProjectBoardProofEvidenceFile,
  ProjectBoardProofEvidenceFileGroup,
  ProjectBoardProofEvidenceMetric,
  ProjectBoardProofEvidenceModel,
  ProjectBoardProofEvidenceReview,
  ProjectBoardProofEvidenceTone,
  ProjectBoardProofInspectionItem,
  ProjectBoardProofInspectionNavigationChecklistItem,
  ProjectBoardProofInspectionNavigationModel,
  ProjectBoardProofPacketInspectionModel,
  ProjectBoardProofVisualInspectionItem,
  ProjectBoardProofVisualRole,
  ProjectBoardTaskActionEvidence,
} from "./projectBoardProofEvidenceTypes";
export { projectBoardProofInspectionNavigationModel } from "./projectBoardProofInspectionUiModel";
export { truncateProjectBoardLedgerText } from "./projectBoardProofTextUiModel";

export function projectBoardDurationLabel(durationMs: number): string {
  const safeMs = Math.max(0, Math.round(durationMs));
  if (safeMs < 1000) return `${safeMs}ms`;
  const seconds = safeMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

export function projectBoardUniqueProofItems<T>(items: T[], keyForItem: (item: T) => string): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    const key = keyForItem(item).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

export function projectBoardProofFileLabel(file: unknown): string {
  if (typeof file === "string") return file;
  if (!file || typeof file !== "object" || Array.isArray(file)) return String(file);
  const record = file as Record<string, unknown>;
  const path = typeof record.path === "string" ? record.path : String(record.file ?? record.name ?? "unknown");
  const status = typeof record.status === "string" ? `${record.status} ` : "";
  return `${status}${path}`;
}

export function projectBoardProofEvidenceModel(run: OrchestrationRun, card?: ProjectBoardCard): ProjectBoardProofEvidenceModel {
  const proof = run.proofOfWork;
  const error = run.error || projectBoardProofText(proof?.error);
  if (!proof) {
    return {
      hasProof: false,
      summary: error ? `Run error: ${error}` : "No proof packet recorded.",
      metrics: [],
      files: [],
      fileGroups: [],
      artifacts: [],
      taskActions: [],
      gitStatus: [],
      inspection: projectBoardEmptyProofPacketInspection(run, error),
      error,
    };
  }

  const taskActions = projectBoardTaskActionEvidenceFromProof(proof);
  const taskActionRecords = projectBoardTaskActionObjectsFromProof(proof);
  const changedFiles = projectBoardUniqueProofItems(
    [...projectBoardProofArray(proof.changedFiles), ...projectBoardTaskActionArray(taskActionRecords, "changedFiles")],
    projectBoardProofFileLabel,
  ).map((item) => projectBoardProofEvidenceFile(item, run.workspacePath));
  const meaningfulFiles = changedFiles.filter((file) => file.meaningful);
  const gitStatus = projectBoardProofArray(proof.gitStatus)
    .map((item) => String(item))
    .filter(Boolean);
  const screenshots = projectBoardProofArtifactsFromArray(
    projectBoardUniqueProofItems(
      [...projectBoardProofItems(proof.screenshots), ...projectBoardTaskActionArray(taskActionRecords, "screenshots")],
      projectBoardProofArtifactKey,
    ),
    "screenshot",
    run.workspacePath,
  );
  const visualChecks = projectBoardProofArtifactsFromArray(
    projectBoardUniqueProofItems(
      [...projectBoardProofItems(proof.visualChecks), ...projectBoardTaskActionArray(taskActionRecords, "visualChecks")],
      projectBoardProofArtifactKey,
    ),
    "log",
    run.workspacePath,
  );
  const browserTraces = [
    ...projectBoardProofArtifactsFromArray(
      projectBoardUniqueProofItems(
        [...projectBoardProofItems(proof.browserTraces), ...projectBoardTaskActionArray(taskActionRecords, "browserTraces")],
        projectBoardProofArtifactKey,
      ),
      "browser_trace",
      run.workspacePath,
    ),
    ...projectBoardProofArtifactsFromArray(
      projectBoardUniqueProofItems(projectBoardProofItems(proof.traces), projectBoardProofArtifactKey),
      "browser_trace",
      run.workspacePath,
    ),
    ...projectBoardProofArtifactsFromArray(
      projectBoardUniqueProofItems(projectBoardProofItems(proof.traceFiles), projectBoardProofArtifactKey),
      "browser_trace",
      run.workspacePath,
    ),
  ];
  const commands = [
    ...projectBoardProofArtifactsFromArray(
      projectBoardUniqueProofItems(
        [...projectBoardProofItems(proof.commands), ...projectBoardTaskActionArray(taskActionRecords, "commands")],
        projectBoardProofArtifactKey,
      ),
      "command",
      run.workspacePath,
    ),
    ...projectBoardProofArtifactsFromArray(
      projectBoardUniqueProofItems(projectBoardProofItems(proof.testResults), projectBoardProofArtifactKey),
      "command",
      run.workspacePath,
    ),
    ...projectBoardProofArtifactsFromArray(
      projectBoardUniqueProofItems(projectBoardProofItems(proof.testOutput), projectBoardProofArtifactKey),
      "command",
      run.workspacePath,
    ),
  ];
  const manualChecks = projectBoardProofArtifactsFromArray(
    projectBoardUniqueProofItems(projectBoardTaskActionArray(taskActionRecords, "manualChecks"), projectBoardProofArtifactKey),
    "log",
    run.workspacePath,
  );
  const hook = projectBoardProofHookArtifact(projectBoardProofObject(proof.afterRunHook));
  const focus = projectBoardProofFocusArtifact(projectBoardProofObject(proof.focusLoop));
  const browserEvidence = projectBoardProofObject(proof.browserEvidence);
  const lastAssistantText = projectBoardProofText(proof.lastAssistantText);
  const diff = projectBoardProofText(proof.diff);
  const review = card?.proofReview ? projectBoardProofEvidenceReview(card.proofReview) : undefined;
  const proofKind = projectBoardProofText(proof.kind);
  const progress = projectBoardProofObject(proof.progress);
  const elapsedMs =
    typeof proof.elapsedMs === "number" ? proof.elapsedMs : typeof progress?.elapsedMs === "number" ? progress.elapsedMs : undefined;
  const outputCharCount =
    typeof proof.outputCharCount === "number"
      ? proof.outputCharCount
      : typeof progress?.outputCharCount === "number"
        ? progress.outputCharCount
        : undefined;
  const toolMessageCount =
    typeof proof.toolMessageCount === "number"
      ? proof.toolMessageCount
      : typeof progress?.toolMessageCount === "number"
        ? progress.toolMessageCount
        : undefined;
  const hasVerification = Boolean(
    hook ||
    commands.length > 0 ||
    screenshots.length > 0 ||
    visualChecks.length > 0 ||
    browserTraces.length > 0 ||
    manualChecks.length > 0 ||
    taskActions.length > 0 ||
    lastAssistantText,
  );
  const inspection = projectBoardProofPacketInspectionModel({
    run,
    card,
    proof,
    screenshots,
    visualChecks,
    browserTraces,
    commands,
    manualChecks,
    taskActions,
    changedFiles,
    meaningfulFiles,
    diff,
    lastAssistantText,
    error,
    review,
    hook,
  });
  const summaryParts = [
    proofKind ? projectBoardReadableState(proofKind) : undefined,
    elapsedMs !== undefined ? `${projectBoardDurationLabel(elapsedMs)} elapsed` : undefined,
    outputCharCount !== undefined ? `${outputCharCount.toLocaleString()} output chars` : undefined,
    meaningfulFiles.length > 0
      ? `${meaningfulFiles.length} meaningful changed ${meaningfulFiles.length === 1 ? "file" : "files"}`
      : undefined,
    changedFiles.length > meaningfulFiles.length
      ? `${changedFiles.length - meaningfulFiles.length} generated/dependency ${changedFiles.length - meaningfulFiles.length === 1 ? "file" : "files"}`
      : undefined,
    taskActions.length > 0 ? `${taskActions.length} task action${taskActions.length === 1 ? "" : "s"}` : undefined,
    screenshots.length > 0 ? `${screenshots.length} screenshot${screenshots.length === 1 ? "" : "s"}` : undefined,
    visualChecks.length > 0 ? `${visualChecks.length} visual check${visualChecks.length === 1 ? "" : "s"}` : undefined,
    typeof browserEvidence?.summary === "string" ? browserEvidence.summary : undefined,
    hook ? hook.label : undefined,
    review ? `PM ${review.status.toLowerCase()}` : undefined,
  ].filter(Boolean);

  return {
    hasProof: true,
    summary:
      summaryParts.length > 0
        ? summaryParts.join(" · ")
        : hasVerification
          ? "Proof evidence recorded."
          : "Proof packet is present but sparse.",
    metrics: [
      elapsedMs !== undefined ? { label: "Elapsed", value: projectBoardDurationLabel(elapsedMs), tone: "neutral" as const } : undefined,
      outputCharCount !== undefined
        ? { label: "Output", value: `${outputCharCount.toLocaleString()} chars`, tone: "neutral" as const }
        : undefined,
      toolMessageCount !== undefined
        ? { label: "Tools", value: String(toolMessageCount), tone: toolMessageCount > 0 ? ("success" as const) : ("neutral" as const) }
        : undefined,
      typeof proof.messageCount === "number"
        ? { label: "Messages", value: String(proof.messageCount), tone: "neutral" as const }
        : undefined,
      typeof proof.lastAssistantStatus === "string"
        ? {
            label: "Assistant",
            value: projectBoardReadableState(proof.lastAssistantStatus),
            tone:
              proof.lastAssistantStatus === "error" || proof.lastAssistantStatus === "aborted" ? ("danger" as const) : ("success" as const),
          }
        : undefined,
      changedFiles.length > 0
        ? {
            label: "Files",
            value: `${meaningfulFiles.length}/${changedFiles.length} meaningful`,
            tone: meaningfulFiles.length > 0 ? ("success" as const) : ("warning" as const),
          }
        : undefined,
      taskActions.length > 0
        ? {
            label: "Actions",
            value: `${taskActions.length} captured`,
            tone: taskActions.some((action) => action.tone === "danger") ? ("danger" as const) : ("success" as const),
          }
        : undefined,
      gitStatus.length > 0 ? { label: "Git", value: `${gitStatus.length} entries`, tone: "neutral" as const } : undefined,
      screenshots.length > 0
        ? { label: "Visual", value: `${screenshots.length} screenshot${screenshots.length === 1 ? "" : "s"}`, tone: "success" as const }
        : undefined,
      visualChecks.length > 0 ? { label: "Checks", value: `${visualChecks.length} visual`, tone: "success" as const } : undefined,
      browserTraces.length > 0
        ? { label: "Trace", value: `${browserTraces.length} artifact${browserTraces.length === 1 ? "" : "s"}`, tone: "success" as const }
        : undefined,
      typeof projectBoardProofObject(proof.focusLoop)?.passNumber === "number"
        ? { label: "Focus", value: `Pass ${projectBoardProofObject(proof.focusLoop)?.passNumber}`, tone: "neutral" as const }
        : undefined,
      proof.diffTruncated === true ? { label: "Diff", value: "Truncated", tone: "warning" as const } : undefined,
    ].filter((item): item is ProjectBoardProofEvidenceMetric => Boolean(item)),
    files: changedFiles,
    fileGroups: projectBoardProofFileGroups(changedFiles),
    artifacts: [...screenshots, ...visualChecks, ...browserTraces, ...commands, ...manualChecks],
    taskActions,
    review,
    assistantSummary: lastAssistantText ? truncateProjectBoardLedgerText(lastAssistantText, 720) : undefined,
    hook,
    focus,
    gitStatus,
    diffPreview: diff ? truncateProjectBoardLedgerText(diff, 1200) : undefined,
    inspection,
    error,
  };
}

export function projectBoardProofPolicySummary(policy: Record<string, unknown> | undefined): string {
  const maxPasses =
    typeof policy?.maxPassesPerCard === "number" && Number.isFinite(policy.maxPassesPerCard) ? policy.maxPassesPerCard : undefined;
  const pauseOnBlocker = policy?.pauseOnTerminalBlocker !== false;
  const smallestProof = policy?.smallestSufficientProof !== false;
  return [
    `Focus passes: ${maxPasses ?? "workflow default"}`,
    pauseOnBlocker ? "pause on terminal blockers" : "continue unless blocked manually",
    smallestProof ? "close at smallest sufficient proof" : "allow broader completion before close",
  ].join(" · ");
}

export function projectBoardProofReviewStatusText(status: ProjectBoardCardProofReviewStatus): string {
  if (status === "ready_for_review") return "Ready for review";
  if (status === "needs_follow_up") return "Needs follow-up";
  if (status === "terminally_blocked") return "Terminally blocked";
  if (status === "retry_recommended") return "Retry recommended";
  return "Done";
}

export function projectBoardProofRecommendedActionText(action: ProjectBoardCardProofRecommendedAction): string {
  if (action === "close") return "close";
  if (action === "retry") return "retry";
  if (action === "follow_up") return "create follow-up";
  if (action === "ask_user") return "ask user";
  return "block";
}

function projectBoardProofEvidenceReview(review: NonNullable<ProjectBoardCard["proofReview"]>): ProjectBoardProofEvidenceReview {
  return {
    status: projectBoardProofReviewStatusText(review.status),
    summary: review.summary,
    reviewer:
      review.reviewer === "ambient_pi" ? "Ambient/Pi PM judge" : review.reviewer === "deterministic" ? "Deterministic reviewer" : undefined,
    model: review.model,
    confidence: typeof review.confidence === "number" ? `${Math.round(review.confidence * 100)}%` : undefined,
    evidenceQuality: review.evidenceQuality ? projectBoardReadableState(review.evidenceQuality) : undefined,
    recommendedAction: review.recommendedAction ? projectBoardProofRecommendedActionText(review.recommendedAction) : undefined,
    missing: review.missing,
    satisfied: review.satisfied,
  };
}

function projectBoardProofEvidenceFile(value: unknown, workspacePath?: string): ProjectBoardProofEvidenceFile {
  const record = projectBoardProofObject(value);
  const path = record
    ? typeof record.path === "string"
      ? record.path
      : typeof record.file === "string"
        ? record.file
        : typeof record.name === "string"
          ? record.name
          : JSON.stringify(record)
    : String(value);
  const status = record && typeof record.status === "string" ? record.status : undefined;
  const category = projectBoardProofFileEvidenceCategory(projectBoardProofFileClassificationPath(path, workspacePath));
  return {
    path,
    status,
    category,
    categoryLabel: projectBoardProofFileEvidenceCategoryLabel(category),
    meaningful: category !== "generated" && category !== "dependency",
  };
}

function projectBoardProofFileClassificationPath(path: string, workspacePath?: string): string {
  const value = projectBoardProofLocalPathLike(path.trim()).replace(/\\/g, "/");
  const workspace = workspacePath?.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!value || !workspace) return value;
  const valueLower = value.toLowerCase();
  const workspaceLower = workspace.toLowerCase();
  if (valueLower === workspaceLower) return "";
  if (valueLower.startsWith(`${workspaceLower}/`)) return value.slice(workspace.length + 1);
  return value;
}

function projectBoardProofLocalPathLike(path: string): string {
  if (!/^file:\/\//i.test(path)) return path;
  try {
    return decodeURIComponent(new URL(path).pathname);
  } catch {
    return path.replace(/^file:\/\//i, "");
  }
}

function projectBoardProofFileEvidenceCategory(path: string): ProjectBoardProofEvidenceFile["category"] {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  if (normalized.includes("/node_modules/") || normalized.startsWith("node_modules/")) return "dependency";
  if (
    normalized.includes("/.ambient-codex/") ||
    normalized.startsWith(".ambient-codex/") ||
    normalized.includes("/.vite/") ||
    normalized.startsWith(".vite/") ||
    normalized.includes("/dist/") ||
    normalized.startsWith("dist/") ||
    normalized.includes("/coverage/") ||
    normalized.startsWith("coverage/")
  ) {
    return "generated";
  }
  if (
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized) ||
    normalized.includes("__tests__/") ||
    normalized.startsWith("test/") ||
    normalized.startsWith("tests/")
  ) {
    return "test";
  }
  if (
    /\.(png|jpe?g|gif|webp|svg)$/.test(normalized) ||
    normalized.includes("screenshot") ||
    normalized.includes("visual") ||
    normalized.includes("playwright")
  ) {
    return "visual";
  }
  if (/\.(md|mdx|txt|rst)$/.test(normalized) || normalized.startsWith("docs/")) return "docs";
  if (
    /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig[^/]*\.json|vite\.config\.[cm]?[jt]s|eslint\.config\.[cm]?[jt]s|workflow\.md)$/.test(
      normalized,
    ) ||
    normalized.includes(".config.")
  ) {
    return "config";
  }
  if (
    /\.[cm]?[jt]sx?$/.test(normalized) ||
    /\.(css|scss|html)$/.test(normalized) ||
    normalized.startsWith("src/") ||
    normalized.startsWith("app/")
  ) {
    return "implementation";
  }
  return "other";
}

function projectBoardProofFileEvidenceCategoryLabel(category: ProjectBoardProofEvidenceFile["category"]): string {
  if (category === "implementation") return "Implementation";
  if (category === "test") return "Tests";
  if (category === "visual") return "Visual";
  if (category === "config") return "Config";
  if (category === "docs") return "Docs";
  if (category === "generated") return "Generated/cache";
  if (category === "dependency") return "Dependencies";
  return "Other";
}

function projectBoardProofFileGroups(files: ProjectBoardProofEvidenceFile[]): ProjectBoardProofEvidenceFileGroup[] {
  const order: ProjectBoardProofEvidenceFile["category"][] = [
    "implementation",
    "test",
    "visual",
    "config",
    "docs",
    "other",
    "generated",
    "dependency",
  ];
  return order
    .map((category) => {
      const items = files.filter((file) => file.category === category);
      return { label: projectBoardProofFileEvidenceCategoryLabel(category), files: items };
    })
    .filter((group) => group.files.length > 0);
}

function projectBoardProofArtifactsFromArray(
  value: unknown,
  kind: ProjectBoardProofEvidenceArtifact["kind"],
  workspacePath?: string,
): ProjectBoardProofEvidenceArtifact[] {
  const items = Array.isArray(value) ? value : typeof value === "string" && value.trim() ? [value] : [];
  return items.map((item, index) => projectBoardProofArtifact(item, kind, index, workspacePath));
}

function projectBoardProofArtifact(
  value: unknown,
  kind: ProjectBoardProofEvidenceArtifact["kind"],
  index: number,
  workspacePath?: string,
): ProjectBoardProofEvidenceArtifact {
  const record = projectBoardProofObject(value);
  const rawText = projectBoardProofText(value);
  const absolutePath = record ? projectBoardProofText(record.absolutePath) : undefined;
  const rawPath = record
    ? (projectBoardProofText(record.path) ?? projectBoardProofText(record.file) ?? projectBoardProofText(record.url) ?? absolutePath)
    : rawText;
  const path = kind === "command" || kind === "log" ? (record ? rawPath : undefined) : rawPath;
  const label =
    record && typeof record.label === "string"
      ? record.label
      : kind === "log" && typeof record?.result === "string"
        ? projectBoardReadableState(record.result)
        : kind === "screenshot"
          ? `Screenshot ${index + 1}`
          : kind === "browser_trace"
            ? `Browser trace ${index + 1}`
            : kind === "command"
              ? `Command ${index + 1}`
              : `Log ${index + 1}`;
  const width = record ? projectBoardProofNumber(record.width) : undefined;
  const height = record ? projectBoardProofNumber(record.height) : undefined;
  const dimensionsLabel = projectBoardProofArtifactDimensionsLabel(width, height);
  const artifactSearchText = [
    label,
    rawPath,
    record ? projectBoardProofText(record.viewport) : undefined,
    record ? projectBoardProofText(record.viewportLabel) : undefined,
    record ? projectBoardProofText(record.device) : undefined,
    record ? projectBoardProofText(record.browser) : undefined,
    record ? projectBoardProofText(record.summary) : undefined,
    record ? projectBoardProofText(record.detail) : undefined,
    rawText,
  ]
    .filter(Boolean)
    .join(" ");
  const visualRole =
    kind === "screenshot" || kind === "browser_trace" || kind === "log"
      ? projectBoardProofVisualRoleFromArtifactData(artifactSearchText, width, height)
      : undefined;
  const viewportLabel = visualRole ? projectBoardProofArtifactViewportLabel(record, visualRole, dimensionsLabel) : undefined;
  const details = [
    dimensionsLabel,
    record && typeof record.nonBlackPixels === "number" ? `${record.nonBlackPixels} nonblack pixels` : undefined,
    record && typeof record.distinctColorCount === "number" ? `${record.distinctColorCount} colors` : undefined,
    record && typeof record.result === "string" ? projectBoardReadableState(record.result) : undefined,
    record && typeof record.summary === "string" ? record.summary : undefined,
    record && typeof record.command === "string" ? record.command : undefined,
    record && typeof record.output === "string" ? truncateProjectBoardLedgerText(record.output, 300) : undefined,
    record && typeof record.detail === "string" ? record.detail : undefined,
    !record && rawText ? rawText : undefined,
  ].filter(Boolean);
  return {
    kind,
    label,
    path,
    detail: details.join(" · ") || undefined,
    previewSrc: projectBoardProofArtifactPreviewSrc(absolutePath ?? path, kind, workspacePath),
    width,
    height,
    dimensionsLabel,
    viewportLabel,
    visualRole,
    tone: record?.result === "blank_or_low_detail_image_detected" || record?.result === "visual_check_failed" ? "warning" : "success",
  };
}

function projectBoardProofHookArtifact(hook: Record<string, unknown> | undefined): ProjectBoardProofEvidenceArtifact | undefined {
  if (!hook) return undefined;
  const ok = hook.ok !== false;
  const detail = [
    typeof hook.command === "string" ? hook.command : undefined,
    typeof hook.durationMs === "number" ? `${hook.durationMs}ms` : undefined,
    typeof hook.output === "string" ? truncateProjectBoardLedgerText(hook.output, 320) : undefined,
    typeof hook.error === "string" ? truncateProjectBoardLedgerText(hook.error, 320) : undefined,
  ].filter(Boolean);
  return {
    kind: "command",
    label: ok ? "afterRun passed" : "afterRun failed",
    detail: detail.join(" · ") || undefined,
    tone: ok ? "success" : "danger",
  };
}

function projectBoardProofFocusArtifact(focus: Record<string, unknown> | undefined): ProjectBoardProofEvidenceArtifact | undefined {
  if (!focus) return undefined;
  const action = typeof focus.action === "string" ? focus.action : "recorded";
  const reason = typeof focus.reason === "string" ? focus.reason : undefined;
  const pass = typeof focus.passNumber === "number" ? `pass ${focus.passNumber}` : undefined;
  const missing =
    Array.isArray(focus.missingProof) && focus.missingProof.length > 0 ? `missing ${focus.missingProof.slice(0, 3).join(", ")}` : undefined;
  return {
    kind: "log",
    label: `Focus loop ${projectBoardReadableState(action)}`,
    detail: [pass, reason, missing].filter(Boolean).join(" · ") || undefined,
    tone: action === "finish" ? "success" : action === "block" || action === "ask_user" ? "danger" : "warning",
  };
}

function projectBoardProofNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function projectBoardProofArtifactDimensionsLabel(width: number | undefined, height: number | undefined): string | undefined {
  if (width === undefined || height === undefined) return undefined;
  return `${width}x${height}`;
}

function projectBoardProofArtifactViewportLabel(
  record: Record<string, unknown> | undefined,
  role: ProjectBoardProofVisualRole,
  dimensionsLabel: string | undefined,
): string | undefined {
  const explicit = record
    ? (projectBoardProofText(record.viewportLabel) ??
      projectBoardProofText(record.viewport) ??
      projectBoardProofText(record.device) ??
      projectBoardProofText(record.browser))
    : undefined;
  const label = explicit ? projectBoardReadableState(explicit) : projectBoardProofVisualRoleLabel(role);
  return dimensionsLabel ? `${label} ${dimensionsLabel}` : label;
}

function projectBoardProofScreenshotPreviewSrc(path: string | undefined, workspacePath?: string): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("data:image/") || path.startsWith("ambient-media://") || /^https?:\/\//.test(path) || /^file:\/\//.test(path))
    return path;
  if (path.startsWith("/")) return `file://${encodeURI(path).replace(/#/g, "%23")}`;
  const workspace = workspacePath?.trim().replace(/\/+$/, "");
  if (workspace && !path.startsWith("../")) {
    return `file://${encodeURI(`${workspace}/${path.replace(/^\.\//, "")}`).replace(/#/g, "%23")}`;
  }
  return undefined;
}

function projectBoardProofArtifactPreviewSrc(
  path: string | undefined,
  kind: ProjectBoardProofEvidenceArtifact["kind"],
  workspacePath?: string,
): string | undefined {
  if (kind !== "screenshot" && !projectBoardProofImagePathLike(path)) return undefined;
  return projectBoardProofScreenshotPreviewSrc(path, workspacePath);
}

function projectBoardProofImagePathLike(path: string | undefined): boolean {
  const value = (path?.trim() ?? "").replace(/:\d+(?::\d+)?$/, "");
  return Boolean(value && (/^data:image\//i.test(value) || /\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i.test(value)));
}

export function projectBoardRunIsActive(run: OrchestrationRun): boolean {
  return ["claimed", "preparing", "prepared", "running", "retry_queued"].includes(run.status);
}

export function projectBoardRunNeedsIntervention(run: OrchestrationRun): boolean {
  return ["failed", "canceled", "stalled", "completed"].includes(run.status);
}

export function projectBoardRunHasReviewableEvidence(run: OrchestrationRun): boolean {
  const proof = run.proofOfWork;
  if (!proof) return false;
  const taskActionRecords = projectBoardTaskActionObjectsFromProof(proof);
  const taskActions = projectBoardTaskActionEvidenceFromProof(proof);
  const changedFiles = [
    ...projectBoardProofArray(proof.changedFiles),
    ...projectBoardTaskActionArray(taskActionRecords, "changedFiles"),
  ].filter(Boolean);
  const commandEvidence = [
    ...projectBoardProofItems(proof.commands),
    ...projectBoardProofItems(proof.testResults),
    ...projectBoardProofItems(proof.testOutput),
    ...projectBoardTaskActionArray(taskActionRecords, "commands"),
    ...projectBoardTaskActionArray(taskActionRecords, "manualChecks"),
  ].filter(Boolean);
  const lastAssistantText = projectBoardProofText(proof.lastAssistantText);
  const reviewableTaskAction = taskActions.some((action) =>
    ["task_complete", "task_report_proof", "task_report_handoff"].includes(action.action),
  );
  return Boolean(changedFiles.length > 0 || commandEvidence.length > 0 || reviewableTaskAction || lastAssistantText);
}

export function projectBoardReadableState(state: string): string {
  return state.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function projectBoardProofArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function projectBoardProofItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return typeof value === "string" && value.trim() ? [value] : [];
}

export function projectBoardProofObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

export function projectBoardProofText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text || undefined;
}

export function projectBoardTaskActionDiagnosticsDetail(proof: Record<string, unknown> | undefined): string | undefined {
  const diagnostics = projectBoardProofObject(proof?.taskActionDiagnostics);
  if (!diagnostics) return undefined;
  const actionCount = projectBoardProofNumber(diagnostics.actionCount);
  const nativeToolActionCount = projectBoardProofNumber(diagnostics.nativeToolActionCount);
  const fallbackJsonActionCount = projectBoardProofNumber(diagnostics.fencedFallbackActionCount);
  const terminalActionCount = projectBoardProofNumber(diagnostics.terminalActionCount);
  if (actionCount === undefined && nativeToolActionCount === undefined && fallbackJsonActionCount === undefined) return undefined;
  return [
    `Native task tools: ${nativeToolActionCount ?? 0}`,
    `fallback JSON: ${fallbackJsonActionCount ?? 0}`,
    terminalActionCount !== undefined ? `terminal: ${terminalActionCount}` : undefined,
  ]
    .filter(Boolean)
    .join("; ");
}

export function projectBoardTaskActionEvidenceFromProof(proof: Record<string, unknown> | undefined): ProjectBoardTaskActionEvidence[] {
  return projectBoardTaskActionObjectsFromProof(proof)
    .map((action, index) => {
      const actionName = projectBoardProofText(action.action) ?? "task_action";
      const id = projectBoardProofText(action.actionId) ?? `${actionName}-${index + 1}`;
      return {
        id,
        action: actionName,
        label: projectBoardTaskActionLabel(actionName),
        summary: projectBoardTaskActionSummary(action),
        createdAt: projectBoardProofText(action.createdAt),
        tone: projectBoardTaskActionTone(actionName),
      };
    })
    .sort((left, right) => (left.createdAt ?? "").localeCompare(right.createdAt ?? "") || left.id.localeCompare(right.id));
}

export function projectBoardTaskActionObjectsFromProof(proof: Record<string, unknown> | undefined): Record<string, unknown>[] {
  if (!proof) return [];
  return [proof.taskToolActions, proof.taskActions, proof.modelTaskActions]
    .flatMap(projectBoardProofArray)
    .map(projectBoardProofObject)
    .filter((action): action is Record<string, unknown> =>
      Boolean(action && typeof action.action === "string" && action.action.startsWith("task_")),
    );
}

export function projectBoardTaskActionArray(actions: Record<string, unknown>[], key: string): unknown[] {
  return actions.flatMap((action) => projectBoardProofArray(action[key]));
}

function projectBoardTaskActionLabel(action: string): string {
  if (action === "task_show") return "Context requested";
  if (action === "task_heartbeat") return "Progress heartbeat";
  if (action === "task_block") return "Task blocked";
  if (action === "task_complete") return "Task completed";
  if (action === "task_create_followup") return "Follow-up requested";
  if (action === "task_report_proof") return "Proof reported";
  if (action === "task_report_handoff") return "Handoff reported";
  return projectBoardReadableState(action);
}

function projectBoardTaskActionSummary(action: Record<string, unknown>): string {
  const actionName = projectBoardProofText(action.action) ?? "task_action";
  if (actionName === "task_show") {
    const requested = projectBoardProofArray(action.requested)
      .map((item) => String(item))
      .filter(Boolean);
    return requested.length > 0 ? `Requested ${requested.join(", ")} context.` : "Requested card context.";
  }
  return (
    projectBoardProofText(action.summary) ??
    projectBoardProofText(action.reason) ??
    projectBoardProofText(action.title) ??
    projectBoardProofArray(action.completed)
      .map((item) => String(item))
      .find(Boolean) ??
    projectBoardTaskActionLabel(actionName)
  );
}

function projectBoardTaskActionTone(action: string): ProjectBoardProofEvidenceTone {
  if (action === "task_block") return "danger";
  if (action === "task_complete" || action === "task_report_proof" || action === "task_report_handoff") return "success";
  if (action === "task_create_followup") return "warning";
  return "neutral";
}

function projectBoardProofArtifactKey(value: unknown): string {
  const record = projectBoardProofObject(value);
  if (record) {
    return (
      projectBoardProofText(record.path) ??
      projectBoardProofText(record.file) ??
      projectBoardProofText(record.url) ??
      projectBoardProofText(record.command) ??
      projectBoardProofText(record.summary) ??
      JSON.stringify(record)
    );
  }
  return String(value);
}
