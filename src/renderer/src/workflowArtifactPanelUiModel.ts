import type { WorkflowArtifactSummary, WorkflowRunDetail, WorkflowRunEvent, WorkflowRunSummary } from "../../shared/workflowTypes";
import { workflowRunLiveness } from "../../shared/workflowRunLiveness";

export type WorkflowArtifactPanelId = "diagram" | "run_console" | "runtime_input" | "source" | "manifest" | "permissions" | "discovery" | "exploration" | "outputs" | "versions";
export type WorkflowBuildPanelId = "build-overview" | "build-discovery" | "build-exploration" | "build-source" | "build-manifest" | "build-permissions" | "build-versions";

export interface WorkflowArtifactPanelTab {
  id: WorkflowArtifactPanelId;
  label: string;
  detail: string;
  badge?: string;
  disabled?: boolean;
}

export interface WorkflowArtifactPanelTabsInput {
  artifact?: Pick<WorkflowArtifactSummary, "manifest" | "sourcePath">;
  detail?: Pick<WorkflowRunDetail, "run" | "events" | "modelCalls" | "sourceContent" | "sourceReadError">;
  latestRun?: Pick<WorkflowRunSummary, "status" | "updatedAt" | "providerHealth">;
  selectedNodeId?: string;
  questionCount?: number;
  answeredQuestionCount?: number;
  explorationTraceCount?: number;
  explorationStateLabel?: string;
  versionCount?: number;
  outputCount?: number;
}

export interface WorkflowBuildPanelTab {
  id: WorkflowBuildPanelId;
  label: string;
  detail: string;
  badge?: string;
  disabled?: boolean;
  artifactPanelId?: WorkflowArtifactPanelId;
}

export function workflowArtifactPanelTabs(input: WorkflowArtifactPanelTabsInput): WorkflowArtifactPanelTab[] {
  const artifactLoaded = Boolean(input.artifact);
  const sourceLoaded = Boolean(input.detail?.sourceContent);
  const sourceBlocked = artifactLoaded && !sourceLoaded && Boolean(input.detail?.sourceReadError);
  const runStatus = workflowPanelRunStatus(input.detail?.run ?? input.latestRun, input.detail?.events ?? []);
  return [
    {
      id: "diagram",
      label: "Diagram",
      detail: "Inspect the executable workflow graph and mapped runtime events.",
    },
    {
      id: "run_console",
      label: "Run Console",
      detail: input.detail ? "Inspect the loaded run event stream, model calls, checkpoints, approvals, and audit report." : "Open a workflow run to inspect events, model calls, checkpoints, approvals, and audit output.",
      badge: runStatus === "stale" ? "Stale" : input.detail ? `${input.detail.events.length} events` : runStatus ? formatPanelStatus(runStatus) : undefined,
      disabled: !artifactLoaded,
    },
    {
      id: "runtime_input",
      label: "Needs Input",
      detail: input.detail ? "Answer pending runtime prompts with the run context beside the workflow thread." : "Open a workflow run that is waiting for user input.",
      badge: input.latestRun?.status === "needs_input" ? "Needs Input" : undefined,
      disabled: !artifactLoaded,
    },
    {
      id: "source",
      label: "Program",
      detail: sourceLoaded
        ? "Inspect the generated program and selected graph-node program mappings."
        : sourceBlocked
          ? "The generated program could not be loaded for this run."
          : "Open the latest audit to load the generated program for inspection.",
      badge: input.selectedNodeId ? "mapped node" : sourceLoaded ? `${input.detail!.sourceContent!.length.toLocaleString()} chars` : sourceBlocked ? "read error" : undefined,
      disabled: !artifactLoaded,
    },
    {
      id: "manifest",
      label: "Manifest + Limits",
      detail: artifactLoaded ? "Review tools, connectors, plugin requirements, mutation policy, and run limits." : "Compile or load a workflow artifact to inspect its manifest and run limits.",
      badge: artifactLoaded ? `${input.artifact!.manifest.tools.length} tools` : undefined,
      disabled: !artifactLoaded,
    },
    {
      id: "permissions",
      label: "Permissions",
      detail: artifactLoaded ? "Review connector grants, plugin requirements, Ambient CLI capabilities, persistent grants, and Full Access receipts." : "Compile or load a workflow artifact to inspect permission requirements.",
      badge: artifactLoaded ? permissionBadge(input.artifact!.manifest) : undefined,
      disabled: !artifactLoaded,
    },
    {
      id: "discovery",
      label: "Discovery",
      detail: "Inspect workflow request answers, discovery activity, policy context, and context-access decisions.",
      badge: input.questionCount !== undefined ? `${input.answeredQuestionCount ?? 0}/${input.questionCount}` : undefined,
    },
    {
      id: "exploration",
      label: "Exploration",
      detail: "Inspect exploratory traces, observed calls, required grants, data shapes, and deterministic source strategy.",
      badge: input.explorationStateLabel ?? (input.explorationTraceCount ? `${input.explorationTraceCount} traces` : undefined),
    },
    {
      id: "outputs",
      label: "Outputs",
      detail: input.detail ? "Inspect retained run outputs, reports, checkpoints, and output-shaped runtime events." : "Open a workflow run to inspect retained outputs, reports, checkpoints, and output-shaped runtime events.",
      badge: input.outputCount ? `${input.outputCount} items` : undefined,
      disabled: !artifactLoaded,
    },
    {
      id: "versions",
      label: "Versions",
      detail: artifactLoaded ? "Inspect approved versions, drafts, restore targets, and version diffs." : "Compile or load a workflow artifact to inspect version history.",
      badge: input.versionCount ? `${input.versionCount} versions` : undefined,
      disabled: !artifactLoaded,
    },
  ];
}

export function workflowBuildPanelTabs(input: WorkflowArtifactPanelTabsInput): WorkflowBuildPanelTab[] {
  const artifactTabs = new Map(workflowArtifactPanelTabs(input).map((tab) => [tab.id, tab]));
  const runStatus = workflowPanelRunStatus(input.detail?.run ?? input.latestRun, input.detail?.events ?? []);
  const buildTab = (id: WorkflowBuildPanelId, artifactPanelId: WorkflowArtifactPanelId): WorkflowBuildPanelTab => {
    const tab = artifactTabs.get(artifactPanelId);
    return {
      id,
      artifactPanelId,
      label: tab?.label ?? id,
      detail: tab?.detail ?? "",
      badge: tab?.badge,
      disabled: tab?.disabled,
    };
  };
  return [
    {
      id: "build-overview",
      label: "Workflow Chat",
      detail: "Conversation, request, review state, workflow actions, runtime prompts, and revision requests.",
      badge: runStatus ? formatPanelStatus(runStatus) : undefined,
    },
    buildTab("build-discovery", "discovery"),
    buildTab("build-exploration", "exploration"),
    buildTab("build-source", "source"),
    buildTab("build-manifest", "manifest"),
    buildTab("build-permissions", "permissions"),
    buildTab("build-versions", "versions"),
  ];
}

export function normalizeWorkflowArtifactPanelId(
  requested: WorkflowArtifactPanelId | undefined,
  tabs: WorkflowArtifactPanelTab[],
): WorkflowArtifactPanelId {
  const fallback = "diagram";
  if (!requested) return fallback;
  return tabs.some((tab) => tab.id === requested && !tab.disabled) ? requested : fallback;
}

export function workflowBuildPanelIdForArtifactPanel(panel: WorkflowArtifactPanelId | undefined): WorkflowBuildPanelId {
  if (panel === "discovery") return "build-discovery";
  if (panel === "exploration") return "build-exploration";
  if (panel === "source") return "build-source";
  if (panel === "manifest") return "build-manifest";
  if (panel === "permissions") return "build-permissions";
  if (panel === "versions") return "build-versions";
  return "build-overview";
}

export function workflowArtifactPanelIdForBuildPanel(panel: WorkflowBuildPanelId): WorkflowArtifactPanelId | undefined {
  if (panel === "build-discovery") return "discovery";
  if (panel === "build-exploration") return "exploration";
  if (panel === "build-source") return "source";
  if (panel === "build-manifest") return "manifest";
  if (panel === "build-permissions") return "permissions";
  if (panel === "build-versions") return "versions";
  return undefined;
}

export function normalizeWorkflowBuildPanelId(
  requested: WorkflowBuildPanelId | undefined,
  tabs: WorkflowBuildPanelTab[],
): WorkflowBuildPanelId {
  const fallback = "build-overview";
  if (!requested) return fallback;
  return tabs.some((tab) => tab.id === requested && !tab.disabled) ? requested : fallback;
}

function formatPanelStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function workflowPanelRunStatus(
  run: Pick<WorkflowRunSummary, "status" | "updatedAt" | "providerHealth"> | undefined,
  events: Pick<WorkflowRunEvent, "createdAt" | "type">[],
): string | undefined {
  if (!run) return undefined;
  return workflowRunLiveness(run, events).stale ? "stale" : run.status;
}

function permissionBadge(manifest: Pick<WorkflowArtifactSummary["manifest"], "connectors" | "pluginCapabilities" | "ambientCliCapabilities">): string | undefined {
  const count = (manifest.connectors?.length ?? 0) + (manifest.pluginCapabilities?.length ?? 0) + (manifest.ambientCliCapabilities?.length ?? 0);
  return count ? `${count} required` : "none";
}
