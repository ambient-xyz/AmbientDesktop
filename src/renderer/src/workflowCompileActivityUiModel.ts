import type { WorkflowCompileProgress } from "../../shared/workflowTypes";

export interface WorkflowCompileActivityMetric {
  label: string;
  value: string;
}

export interface WorkflowCompileActivityStep {
  id: string;
  message: string;
  detail?: string;
  state: "active" | "done" | "failed";
}

export interface WorkflowCompileActivityAction {
  id: "retry_same_context" | "open_diagnostics" | "edit_request" | "report_unsupported";
  label: string;
  title: string;
  tone: "default" | "primary" | "danger";
  disabled?: boolean;
  disabledReason?: string;
}

export interface WorkflowCompileActivityModel {
  title: string;
  subtitle: string;
  tone: "active" | "completed" | "failed";
  percent: number;
  metrics: WorkflowCompileActivityMetric[];
  steps: WorkflowCompileActivityStep[];
  actions: WorkflowCompileActivityAction[];
  failureArtifactPath?: string;
  failureReportText?: string;
}

export function workflowCompileActivityModel(input: {
  active: boolean;
  progress: WorkflowCompileProgress[];
  nowMs?: number;
}): WorkflowCompileActivityModel | undefined {
  if (!input.active && input.progress.length === 0) return undefined;
  const nowMs = input.nowMs ?? Date.now();
  const latest = input.progress.at(-1);
  const failed = latest?.status === "failed";
  const completed = latest?.phase === "completed";
  const tone: WorkflowCompileActivityModel["tone"] = failed ? "failed" : completed ? "completed" : "active";
  const percent = failed
    ? 100
    : latest
      ? Math.min(100, Math.max(6, Math.round((latest.current / latest.total) * 100)))
      : input.active
        ? 6
        : 100;
  const title = failed ? "Compile failed" : completed ? "Preview ready" : "Compiling preview";
  const subtitle = compileSubtitle(input.active, input.progress, nowMs);
  const steps = compileSteps(input.progress);
  const failureActionModel = failed ? compileFailureActionModel(input.progress) : undefined;

  if (input.progress.length === 0) {
    steps.push({
      id: "starting",
      message: "Starting compile request.",
      state: "active",
    });
  }

  return {
    title,
    subtitle,
    tone,
    percent,
    metrics: compileMetrics(input.progress, nowMs),
    steps,
    actions: failureActionModel?.actions ?? [],
    failureArtifactPath: failureActionModel?.failureArtifactPath,
    failureReportText: failureActionModel?.failureReportText,
  };
}

export function workflowCompileProgressDetail(progress: WorkflowCompileProgress): string | undefined {
  const metrics = progress.metrics ? Object.entries(progress.metrics).map(([key, value]) => formatWorkflowCompileMetric(key, value)) : [];
  const details = [progress.detail, ...metrics, progress.error].filter(Boolean);
  return details.length > 0 ? details.join(" · ") : undefined;
}

function compileSubtitle(active: boolean, progress: WorkflowCompileProgress[], nowMs: number): string {
  const latest = progress.at(-1);
  if (!latest) return "Starting the workflow compiler. Stream counters will appear when Pi starts responding.";
  if (latest.status === "failed") return failureSubtitle(progress, latest);
  const modelProgress = latestModelProgress(progress);
  if (active && modelProgress?.status === "running") {
    const idleTimeoutMs = numberMetric(modelProgress, "idleTimeoutMs");
    const lastUpdateMs = progressAgeMs(modelProgress, nowMs);
    if (idleTimeoutMs !== undefined && lastUpdateMs !== undefined) {
      return `${modelProgress.message} Last stream update ${formatDurationMs(lastUpdateMs)} ago; idle timeout is ${formatDurationMs(idleTimeoutMs)}.`;
    }
  }
  return latest.message;
}

function compileMetrics(progress: WorkflowCompileProgress[], nowMs: number): WorkflowCompileActivityMetric[] {
  const prompt = latestProgressWithAnyMetric(progress, ["promptChars", "stablePrefixTokens", "mutableSuffixTokens"]);
  const model = latestModelProgress(progress);
  const failure = latestProgressWithAnyMetric(progress, [
    "compilerFailurePhase",
    "failureDiagnosticCode",
    "failureNodeId",
    "failureSourceNodeId",
    "failureInvalidOutputPath",
    "failureValidAlternatives",
    "failureProducerOutputContract",
    "failureDiagnosticPath",
    "failureValidatorId",
    "failureRepairHint",
    "failureArtifactPath",
    "repairFailureClass",
    "repairRetryable",
    "repairAlternatives",
    "repairPatchValidationRetriesUsed",
    "compilerDiagnosticCount",
    "compilerTotalMs",
    "parseAndNormalizeMs",
    "staticValidationMs",
    "loweringMs",
    "codegenMs",
    "outputValidationMs",
    "dryRunMs",
  ]);
  const context = latestProgressWithAnyMetric(progress, [
    "toolCount",
    "availableToolCount",
    "selectedToolCount",
    "capabilityQueryCount",
    "requiredToolNameCount",
    "capabilityDiscoveryFallback",
    "compilerMode",
    "componentBatchSize",
    "componentConcurrency",
    "componentCount",
    "componentIndex",
    "componentLevel",
    "connectorCount",
    "connectorGrantCount",
    "dryRunCallCount",
    "pluginRegistrationCount",
    "explorationTraceCount",
    "patchOperationCount",
    "repairAttempt",
    "repairAttemptCount",
    "repairDiagnosticCount",
    "compilerFailurePhase",
    "compilerDiagnosticCount",
    "incrementalValidationCacheHits",
    "incrementalValidationCacheMisses",
    "incrementalValidationConcurrency",
    "incrementalValidationLevelCount",
    "incrementalValidationMaxLevelWidth",
    "incrementalValidationNodeCount",
    "loweredOperationCount",
    "loweringCacheHits",
    "loweringCacheMisses",
  ]);
  const latestWithArtifact = latestProgressWithAnyMetric(progress, ["artifactId", "runId"]);
  const metrics: Array<WorkflowCompileActivityMetric | undefined> = [
    metricFromProgress(failure, "compilerFailurePhase", "Failed phase"),
    metricFromProgress(failure, "failureDiagnosticCode", "Diagnostic"),
    metricFromProgress(failure, "failureNodeId", "Node"),
    metricFromProgress(failure, "failureSourceNodeId", "Source node"),
    metricFromProgress(failure, "failureInvalidOutputPath", "Invalid path"),
    metricFromProgress(failure, "failureValidAlternatives", "Valid alternatives"),
    metricFromProgress(failure, "failureProducerOutputContract", "Producer output"),
    metricFromProgress(failure, "repairFailureClass", "Repair failure"),
    metricFromProgress(failure, "repairRetryable", "Repair retryable"),
    metricFromProgress(failure, "repairAlternatives", "Repair alternatives"),
    metricFromProgress(failure, "compilerTotalMs", "Compiler total"),
    metricFromProgress(failure, "staticValidationMs", "Static validation"),
    metricFromProgress(failure, "loweringMs", "Lowering"),
    metricFromProgress(failure, "codegenMs", "Codegen"),
    metricFromProgress(failure, "outputValidationMs", "Output validation"),
    metricFromProgress(failure, "dryRunMs", "Dry-run"),
    metricFromProgress(failure, "failureArtifactPath", "Failure artifact"),
    metricFromProgress(model, "rawResponseChars", "Response"),
    metricFromProgress(model, "thinkingChars", "Thinking"),
    metricFromProgress(model, "providerElapsedMs", "Elapsed"),
    streamIdleMetric(model, nowMs),
    metricFromProgress(model, "timeoutMode", "Timeout mode"),
    metricFromProgress(prompt, "stablePrefixTokens", "Stable prefix"),
    metricFromProgress(prompt, "mutableSuffixTokens", "Mutable suffix"),
    metricFromProgress(prompt, "promptChars", "Prompt"),
    metricFromProgress(context, "toolCount", "Tools"),
    metricFromProgress(context, "availableToolCount", "Available tools"),
    metricFromProgress(context, "selectedToolCount", "Selected tools"),
    metricFromProgress(context, "capabilityQueryCount", "Capability queries"),
    metricFromProgress(context, "compilerMode", "Compiler"),
    metricFromProgress(context, "componentCount", "Legacy components"),
    metricFromProgress(context, "componentConcurrency", "Legacy concurrency"),
    metricFromProgress(context, "connectorCount", "Connectors"),
    metricFromProgress(context, "connectorGrantCount", "Connector grants"),
    metricFromProgress(context, "dryRunCallCount", "Dry-run calls"),
    metricFromProgress(context, "repairAttemptCount", "IR repairs"),
    metricFromProgress(context, "patchOperationCount", "Patch ops"),
    metricFromProgress(context, "incrementalValidationCacheHits", "IR cache hits"),
    metricFromProgress(context, "incrementalValidationCacheMisses", "IR cache misses"),
    metricFromProgress(context, "incrementalValidationLevelCount", "IR levels"),
    metricFromProgress(context, "incrementalValidationConcurrency", "IR concurrency"),
    metricFromProgress(context, "loweredOperationCount", "Lower ops"),
    metricFromProgress(context, "loweringCacheHits", "Lower cache hits"),
    metricFromProgress(context, "loweringCacheMisses", "Lower cache misses"),
    metricFromProgress(context, "compilerDiagnosticCount", "Diagnostics"),
    metricFromProgress(context, "pluginRegistrationCount", "Plugin tools"),
    metricFromProgress(context, "explorationTraceCount", "Exploration traces"),
    metricFromProgress(latestWithArtifact, "artifactId", "Artifact"),
    metricFromProgress(latestWithArtifact, "runId", "Run"),
  ];
  return dedupeMetrics(metrics.filter((metric): metric is WorkflowCompileActivityMetric => Boolean(metric)));
}

function compileSteps(progress: WorkflowCompileProgress[]): WorkflowCompileActivityStep[] {
  return progress.slice(-12).map((item, index, items) => {
    const isLatest = index === items.length - 1;
    const state = item.status === "failed" ? "failed" : item.status === "running" && isLatest ? "active" : "done";
    return {
      id: `${item.compileId}-${item.phase}-${item.status}-${item.createdAt}-${index}`,
      message: item.message,
      detail: workflowCompileProgressDetail(item),
      state,
    };
  });
}

function failureSubtitle(progress: WorkflowCompileProgress[], latest: WorkflowCompileProgress): string {
  const failure = latestProgressWithAnyMetric(progress, [
    "compilerFailurePhase",
    "failureDiagnosticCode",
    "failureNodeId",
    "failureSourceNodeId",
    "failureInvalidOutputPath",
    "repairFailureClass",
    "failureProducerOutputContract",
  ]);
  const repairFailureClass = stringMetric(failure, "repairFailureClass");
  if (repairFailureClass) {
    return `Workflow repair failed deterministically: ${formatRepairFailureClass(repairFailureClass)}. Diagnostics were retained.`;
  }
  const phase = stringMetric(failure, "compilerFailurePhase");
  const diagnosticCode = stringMetric(failure, "failureDiagnosticCode");
  const nodeId = stringMetric(failure, "failureNodeId");
  const sourceNodeId = stringMetric(failure, "failureSourceNodeId");
  const invalidOutputPath = stringMetric(failure, "failureInvalidOutputPath");
  if (phase || diagnosticCode || nodeId || sourceNodeId || invalidOutputPath) {
    const parts = [
      phase ? `failed during ${formatCompilerFailurePhase(phase)}` : undefined,
      diagnosticCode ? diagnosticCode : undefined,
      nodeId ? `node ${nodeId}` : undefined,
      sourceNodeId && invalidOutputPath ? `${sourceNodeId}.${invalidOutputPath}` : sourceNodeId ? `source ${sourceNodeId}` : invalidOutputPath ? `path ${invalidOutputPath}` : undefined,
    ].filter(Boolean);
    return `Workflow compile ${parts.join(" · ")}.`;
  }
  return latest.error ?? latest.message;
}

function compileFailureActionModel(progress: WorkflowCompileProgress[]): Pick<WorkflowCompileActivityModel, "actions" | "failureArtifactPath" | "failureReportText"> {
  const latest = progress.at(-1);
  const failure = latestProgressWithAnyMetric(progress, [
    "repairFailureClass",
    "repairRetryable",
    "repairAlternatives",
    "failureArtifactPath",
    "compilerFailurePhase",
    "failureDiagnosticCode",
    "failureDiagnosticPath",
    "failureNodeId",
    "failureSourceNodeId",
    "failureInvalidOutputPath",
    "failureValidAlternatives",
    "failureProducerOutputContract",
    "failureRepairHint",
  ]);
  const repairRetryable = booleanMetric(failure, "repairRetryable");
  const repairFailureClass = stringMetric(failure, "repairFailureClass");
  const failureArtifactPath = stringMetric(failure, "failureArtifactPath");
  const retryDisabled = repairRetryable === false;
  const retryDisabledReason = retryDisabled
    ? "This repair failure is deterministic for the same context. Edit the request, inspect diagnostics, or report the unsupported family."
    : undefined;
  return {
    actions: [
      {
        id: "retry_same_context",
        label: "Retry same context",
        title: retryDisabledReason ?? "Run the compiler again with the same request, discovery answers, selected capabilities, and context.",
        tone: "primary",
        disabled: retryDisabled,
        disabledReason: retryDisabledReason,
      },
      {
        id: "open_diagnostics",
        label: "Open diagnostics",
        title: failureArtifactPath
          ? `Open the retained compiler failure artifact: ${failureArtifactPath}`
          : "Diagnostics are available only after the compiler writes a failure artifact.",
        tone: "default",
        disabled: !failureArtifactPath,
        disabledReason: failureArtifactPath ? undefined : "No failure artifact path was emitted for this compile.",
      },
      {
        id: "edit_request",
        label: "Edit request",
        title: "Move focus back to the workflow request so the user can narrow scope or clarify an unsupported requirement.",
        tone: "default",
      },
      {
        id: "report_unsupported",
        label: "Copy report",
        title: repairFailureClass
          ? "Copy a compact unsupported-workflow report with the deterministic repair class and retained diagnostic path."
          : "Copy a compact compiler failure report for triage.",
        tone: "danger",
      },
    ],
    failureArtifactPath,
    failureReportText: compileFailureReportText(progress, latest, failure),
  };
}

function latestModelProgress(progress: WorkflowCompileProgress[]): WorkflowCompileProgress | undefined {
  return [...progress]
    .reverse()
    .find((item) => item.phase === "model" && (item.status === "running" || item.status === "completed"));
}

function latestProgressWithAnyMetric(progress: WorkflowCompileProgress[], keys: string[]): WorkflowCompileProgress | undefined {
  return [...progress].reverse().find((item) => keys.some((key) => item.metrics?.[key] !== undefined));
}

function metricFromProgress(progress: WorkflowCompileProgress | undefined, key: string, label: string): WorkflowCompileActivityMetric | undefined {
  const value = progress?.metrics?.[key];
  if (value === undefined) return undefined;
  return { label, value: formatWorkflowCompileMetricValue(key, value) };
}

function streamIdleMetric(progress: WorkflowCompileProgress | undefined, nowMs: number): WorkflowCompileActivityMetric | undefined {
  const idleTimeoutMs = numberMetric(progress, "idleTimeoutMs");
  if (progress?.status !== "running" || idleTimeoutMs === undefined) return undefined;
  const lastUpdateMs = progressAgeMs(progress, nowMs);
  if (lastUpdateMs === undefined) return undefined;
  return { label: "No stream update", value: `${formatDurationMs(lastUpdateMs)} / ${formatDurationMs(idleTimeoutMs)}` };
}

function progressAgeMs(progress: WorkflowCompileProgress, nowMs: number): number | undefined {
  const created = Date.parse(progress.createdAt);
  if (!Number.isFinite(created)) return undefined;
  return Math.max(0, nowMs - created);
}

function numberMetric(progress: WorkflowCompileProgress | undefined, key: string): number | undefined {
  const value = progress?.metrics?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringMetric(progress: WorkflowCompileProgress | undefined, key: string): string | undefined {
  const value = progress?.metrics?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function booleanMetric(progress: WorkflowCompileProgress | undefined, key: string): boolean | undefined {
  const value = progress?.metrics?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function dedupeMetrics(metrics: WorkflowCompileActivityMetric[]): WorkflowCompileActivityMetric[] {
  const seen = new Set<string>();
  const deduped: WorkflowCompileActivityMetric[] = [];
  for (const metric of metrics) {
    if (seen.has(metric.label)) continue;
    seen.add(metric.label);
    deduped.push(metric);
  }
  return deduped.slice(0, 12);
}

function formatWorkflowCompileMetric(key: string, value: string | number | boolean): string {
  const label =
    {
      artifactId: "artifact",
      absoluteTimeoutMs: "hard limit",
      availableToolCount: "available tools",
      capabilityDiscoveryFallback: "capability discovery fallback",
      capabilityDiscoveryResponseChars: "capability discovery response",
      capabilityQueryCount: "capability queries",
      compilerMode: "compiler",
      componentBatchSize: "legacy component batch",
      componentConcurrency: "legacy component concurrency",
      componentCount: "legacy components",
      componentId: "legacy component",
      componentIndex: "legacy component",
      componentLevel: "legacy component level",
      componentPromptChars: "legacy component prompt",
      codegenMs: "codegen",
      connectorCount: "connectors",
      connectorGrantCount: "connector grants",
      compilerDiagnosticCount: "diagnostics",
      compilerFailurePhase: "failed phase",
      compilerTotalMs: "compiler total",
      debugRewrite: "debug rewrite",
      discoveryAnswerCount: "answers",
      dryRunCallCount: "dry-run calls",
      dryRunMs: "dry-run",
      explorationTraceCount: "exploration traces",
      failureDiagnosticCode: "diagnostic",
      failureDiagnosticPath: "diagnostic path",
      failureArtifactPath: "failure artifact",
      failureInvalidOutputPath: "invalid output path",
      failureNodeId: "node",
      failureRepairHint: "repair hint",
      failureSourceNodeId: "source node",
      failureValidAlternatives: "valid alternatives",
      failureProducerOutputContract: "producer output",
      failureValidatorId: "validator",
      graphNodeCount: "graph nodes",
      idleElapsedMs: "idle at event",
      idleTimeoutMs: "idle timeout",
      incrementalValidationCacheHits: "IR cache hits",
      incrementalValidationCacheMisses: "IR cache misses",
      incrementalValidationConcurrency: "IR concurrency",
      incrementalValidationLevelCount: "IR levels",
      incrementalValidationMaxLevelWidth: "IR max level width",
      incrementalValidationNodeCount: "IR nodes",
      loweredOperationCount: "lowered ops",
      loweredPlanBytes: "lowered plan",
      loweringCacheHits: "lower cache hits",
      loweringCacheMisses: "lower cache misses",
      loweringMs: "lowering",
      manifestBytes: "manifest",
      mutableSuffixTokens: "mutable suffix",
      pluginRegistrationCount: "plugin tools",
      patchOperationCount: "patch operations",
      providerElapsedMs: "elapsed",
      providerStage: "stream",
      previewBytes: "preview",
      promptChars: "prompt",
      rawResponseChars: "response",
      repairAlternatives: "repair alternatives",
      repairFailureClass: "repair failure",
      repairPatchValidationRetriesUsed: "repair validation retries",
      repairRetryable: "repair retryable",
      responseChars: "response",
      runId: "run",
      sourceBytes: "program",
      sourceChars: "program",
      specBytes: "spec",
      stablePrefixTokens: "stable prefix",
      selectedToolCount: "selected tools",
      outputValidationMs: "output validation",
      parseAndNormalizeMs: "parse",
      openQuestionCount: "open questions",
      requiredToolNameCount: "required tool names",
      repairAttempt: "repair attempt",
      repairAttemptCount: "repair attempts",
      repairDiagnosticCount: "repair diagnostics",
      repairPromptChars: "repair prompt",
      staticValidationMs: "static validation",
      thinkingChars: "thinking",
      timeoutMode: "timeout mode",
      toolCount: "tools",
    }[key] ?? key;
  return `${label}: ${formatWorkflowCompileMetricValue(key, value)}`;
}

function formatWorkflowCompileMetricValue(key: string, value: string | number | boolean): string {
  if (typeof value === "number" && key.endsWith("Bytes")) return formatBytes(value);
  if (typeof value === "number" && key.endsWith("Ms")) return formatDurationMs(value);
  if (typeof value === "number" && key.endsWith("Chars")) return `${value.toLocaleString()} chars`;
  if (typeof value === "number" && key.endsWith("Tokens")) return `${value.toLocaleString()} tokens`;
  if (typeof value === "number") return value.toLocaleString();
  if (key === "timeoutMode") return formatWorkflowTimeoutMode(String(value));
  if (key === "compilerFailurePhase") return formatCompilerFailurePhase(String(value));
  if (key === "repairFailureClass") return formatRepairFailureClass(String(value));
  return String(value);
}

function compileFailureReportText(
  progress: WorkflowCompileProgress[],
  latest: WorkflowCompileProgress | undefined,
  failure: WorkflowCompileProgress | undefined,
): string {
  const lines = [
    "Workflow compiler failure report",
    `Latest message: ${latest?.message ?? "unknown"}`,
    latest?.error ? `Latest error: ${latest.error}` : undefined,
    metricReportLine(failure, "repairFailureClass", "Repair failure class"),
    metricReportLine(failure, "repairRetryable", "Repair retryable"),
    metricReportLine(failure, "repairAlternatives", "Repair alternatives"),
    metricReportLine(failure, "compilerFailurePhase", "Compiler failure phase"),
    metricReportLine(failure, "failureDiagnosticCode", "Diagnostic code"),
    metricReportLine(failure, "failureDiagnosticPath", "Diagnostic path"),
    metricReportLine(failure, "failureNodeId", "Node id"),
    metricReportLine(failure, "failureSourceNodeId", "Source node id"),
    metricReportLine(failure, "failureInvalidOutputPath", "Invalid output path"),
    metricReportLine(failure, "failureValidAlternatives", "Valid alternatives"),
    metricReportLine(failure, "failureProducerOutputContract", "Producer output contract"),
    metricReportLine(failure, "failureArtifactPath", "Failure artifact"),
    `Progress events: ${progress.length}`,
  ].filter(Boolean);
  return lines.join("\n");
}

function metricReportLine(progress: WorkflowCompileProgress | undefined, key: string, label: string): string | undefined {
  const value = progress?.metrics?.[key];
  if (value === undefined) return undefined;
  return `${label}: ${formatWorkflowCompileMetricValue(key, value)}`;
}

function formatWorkflowTimeoutMode(value: string): string {
  if (value === "idle_watchdog") return "idle watchdog";
  if (value === "elapsed_hard_limit") return "elapsed hard limit";
  return value.replace(/_/g, " ");
}

function formatCompilerFailurePhase(value: string): string {
  return value.replace(/_/g, " ");
}

function formatRepairFailureClass(value: string): string {
  return value.replace(/_/g, " ");
}

function formatDurationMs(value: number): string {
  if (value < 1000) return `${Math.round(value).toLocaleString()} ms`;
  if (value < 60_000) return `${(value / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}s`;
  return `${(value / 60_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}m`;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value.toLocaleString()} B`;
  return `${(value / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB`;
}
