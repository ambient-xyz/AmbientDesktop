import type { WorkflowAgentThreadSummary, WorkflowArtifactSummary, WorkflowCompileProgress, WorkflowRunDetail, WorkflowRunEvent, WorkflowRunSummary } from "../../shared/workflowTypes";
import { workflowRunLiveness } from "../../shared/workflowRunLiveness";

export type WorkflowPersistentStatusTone = "blocked" | "warning" | "running" | "ready";

export type WorkflowPersistentStatusTarget =
  | "discovery"
  | "compile"
  | "overview"
  | "permissions"
  | "runs-live"
  | "runs-input"
  | "schedules-overview"
  | "schedules-grants"
  | "versions";

export interface WorkflowPersistentStatusAction {
  label: string;
  title: string;
  target: WorkflowPersistentStatusTarget;
}

export interface WorkflowPersistentStatusModel {
  tone: WorkflowPersistentStatusTone;
  title: string;
  detail: string;
  badges: string[];
  action?: WorkflowPersistentStatusAction;
}

export interface WorkflowPersistentStatusInput {
  thread: Pick<WorkflowAgentThreadSummary, "phase" | "discoveryQuestions" | "latestVersion" | "activeArtifactId">;
  artifact?: Pick<WorkflowArtifactSummary, "status" | "manifest">;
  latestRun?: Pick<WorkflowRunSummary, "status" | "updatedAt" | "providerHealth" | "error">;
  detail?: Pick<WorkflowRunDetail, "events">;
  compileActive?: boolean;
  compileProgress?: WorkflowCompileProgress[];
  discoveryBusy?: string;
  scheduleBlockReason?: string;
}

export function workflowPersistentStatusModel(input: WorkflowPersistentStatusInput): WorkflowPersistentStatusModel {
  const compileFailure = latestCompileFailure(input.compileProgress ?? []);
  if (compileFailure) {
    return {
      tone: "blocked",
      title: "Compile is blocked",
      detail: compileFailure,
      badges: ["Compile failed", "Diagnostics retained"],
      action: {
        label: "Open compile",
        title: "Open the compile activity and retained diagnostic actions.",
        target: "compile",
      },
    };
  }

  const pendingAccessCount = pendingDiscoveryAccessCount(input.thread.discoveryQuestions);
  if (pendingAccessCount > 0) {
    return {
      tone: "blocked",
      title: "Discovery needs an access decision",
      detail: `${pendingAccessCount} context access request${pendingAccessCount === 1 ? "" : "s"} must be allowed or denied before the workflow can keep planning safely.`,
      badges: [`${pendingAccessCount} access pending`, "User decision"],
      action: {
        label: "Open discovery",
        title: "Open the discovery questions and resolve access requests.",
        target: "discovery",
      },
    };
  }

  const unansweredQuestionCount = input.thread.discoveryQuestions.filter((question) => !question.answer).length;
  if (unansweredQuestionCount > 0 && !input.artifact) {
    return {
      tone: "blocked",
      title: "Discovery questions block compile",
      detail: `Answer ${unansweredQuestionCount} remaining discovery question${unansweredQuestionCount === 1 ? "" : "s"} before compiling a reviewable workflow.`,
      badges: [`${unansweredQuestionCount} unanswered`, formatThreadPhase(input.thread.phase)],
      action: {
        label: "Answer questions",
        title: "Open the discovery question queue.",
        target: "discovery",
      },
    };
  }

  if (input.discoveryBusy) {
    return {
      tone: "running",
      title: "Discovery is running",
      detail: "Pi is updating workflow discovery. Compile and run actions wait until the active discovery step finishes.",
      badges: ["Discovery active", formatThreadPhase(input.thread.phase)],
      action: {
        label: "View discovery",
        title: "Open discovery progress and questions.",
        target: "discovery",
      },
    };
  }

  if (activeCompileStatusIsCurrent(input)) {
    const latest = input.compileProgress?.at(-1);
    return {
      tone: "running",
      title: "Compile is running",
      detail: latest?.message ?? "Pi is compiling a workflow preview. Run and schedule actions wait until the preview is retained.",
      badges: ["Compile active", latest?.phase ? formatThreadPhase(latest.phase) : "Preview pending"],
      action: {
        label: "View compile",
        title: "Open compile activity.",
        target: "compile",
      },
    };
  }

  if (!input.artifact) {
    return {
      tone: "blocked",
      title: "No executable workflow preview yet",
      detail: "This thread has no retained workflow artifact. Compile the answered discovery context before review, runs, or schedules can proceed.",
      badges: [formatThreadPhase(input.thread.phase), input.thread.latestVersion ? `Version ${input.thread.latestVersion.version}` : "No version"],
      action: {
        label: "Open compile",
        title: "Open the workflow overview and compile controls.",
        target: "overview",
      },
    };
  }

  if (input.artifact.status === "rejected") {
    return {
      tone: "blocked",
      title: "Workflow artifact is rejected",
      detail: "Rejected workflow artifacts cannot run or be scheduled. Apply a revision or restore an approved version.",
      badges: ["Rejected", versionBadge(input.thread)],
      action: {
        label: "Open versions",
        title: "Open version history and restore options.",
        target: "versions",
      },
    };
  }

  if (input.scheduleBlockReason) {
    return {
      tone: "blocked",
      title: "Schedule cannot dispatch",
      detail: input.scheduleBlockReason,
      badges: ["Schedule blocked", formatArtifactStatus(input.artifact.status)],
      action: {
        label: "Open schedule",
        title: "Open the schedule configuration that is currently blocked.",
        target: input.scheduleBlockReason.toLowerCase().includes("grant") ? "schedules-grants" : "schedules-overview",
      },
    };
  }

  if (input.artifact.status !== "approved") {
    return {
      tone: "warning",
      title: "Workflow preview needs approval",
      detail: "Review and approve the generated workflow before normal unattended runs or schedules can use it.",
      badges: [formatArtifactStatus(input.artifact.status), versionBadge(input.thread)],
      action: {
        label: "Open review",
        title: "Open the workflow review overview.",
        target: "overview",
      },
    };
  }

  const runStatus = workflowRunStatusModel(input.latestRun, input.detail?.events ?? []);
  if (runStatus) return runStatus;

  const permissionCount = workflowPermissionRequirementCount(input.artifact.manifest);
  return {
    tone: "ready",
    title: "Workflow is ready",
    detail: permissionCount > 0
      ? "The approved workflow can run. Review persistent grants before unattended schedules use connector, plugin, or Ambient CLI capabilities."
      : "The approved workflow can run. No connector, plugin, or Ambient CLI grants are declared by the manifest.",
    badges: ["Approved", permissionCount > 0 ? `${permissionCount} capability requirement${permissionCount === 1 ? "" : "s"}` : "No grants required"],
    action: permissionCount > 0
      ? {
          label: "Open permissions",
          title: "Open declared capability requirements and persistent grants.",
          target: "permissions",
        }
      : undefined,
  };
}

function latestCompileFailure(progress: WorkflowCompileProgress[]): string | undefined {
  const latest = progress.at(-1);
  if (latest?.status !== "failed") return undefined;
  return latest.error || latest.detail || latest.message || "The last compile failed. Use retained diagnostics before retrying the same context.";
}

function pendingDiscoveryAccessCount(questions: Pick<WorkflowAgentThreadSummary, "discoveryQuestions">["discoveryQuestions"]): number {
  return questions.reduce((count, question) => count + (question.accessRequests?.filter((request) => request.status === "pending").length ?? 0), 0);
}

function workflowRunStatusModel(
  latestRun: Pick<WorkflowRunSummary, "status" | "updatedAt" | "providerHealth" | "error"> | undefined,
  events: Pick<WorkflowRunEvent, "createdAt" | "type">[],
): WorkflowPersistentStatusModel | undefined {
  if (!latestRun) return undefined;
  const liveness = workflowRunLiveness(latestRun, events);
  if (liveness.stale) {
    return {
      tone: "blocked",
      title: "Latest run appears stale",
      detail: "The run has not emitted recent liveness events. Open the run console to inspect recovery, resume, or failure context.",
      badges: ["Run stale", formatArtifactStatus(latestRun.status)],
      action: {
        label: "Open run",
        title: "Open the latest run console.",
        target: "runs-live",
      },
    };
  }
  if (latestRun.status === "needs_input") {
    return {
      tone: "blocked",
      title: "Latest run needs input",
      detail: "Answer the pending runtime prompt before the workflow can continue.",
      badges: ["Needs input", providerHealthBadge(latestRun)],
      action: {
        label: "Answer input",
        title: "Open pending runtime input for this run.",
        target: "runs-input",
      },
    };
  }
  if (latestRun.status === "paused") {
    return {
      tone: "warning",
      title: "Latest run is paused",
      detail: "Resume from the retained checkpoint, inspect recovery decisions, or start a new run after reviewing the pause reason.",
      badges: ["Paused", providerHealthBadge(latestRun)],
      action: {
        label: "Open run",
        title: "Open the paused run console.",
        target: "runs-live",
      },
    };
  }
  if (latestRun.status === "failed") {
    return {
      tone: "blocked",
      title: "Latest run failed",
      detail: latestRun.error || "Open the run console for failure events, recovery actions, and retained diagnostics.",
      badges: ["Run failed", providerHealthBadge(latestRun)],
      action: {
        label: "Open run",
        title: "Open the failed run console.",
        target: "runs-live",
      },
    };
  }
  if (latestRun.status === "running" || latestRun.status === "created" || latestRun.status === "previewed") {
    return {
      tone: "running",
      title: "Workflow run is active",
      detail: "The latest run is in progress. Use the run console for live events, model calls, checkpoints, and recovery decisions.",
      badges: [formatArtifactStatus(latestRun.status), providerHealthBadge(latestRun)],
      action: {
        label: "Open run",
        title: "Open the active run console.",
        target: "runs-live",
      },
    };
  }
  if (latestRun.providerHealth?.status === "provider_degraded" || latestRun.providerHealth?.status === "product_failed") {
    return {
      tone: "warning",
      title: "Provider health needs review",
      detail: latestRun.providerHealth.error || "The latest run recorded degraded provider health. Inspect run diagnostics before relying on unattended schedules.",
      badges: [providerHealthBadge(latestRun), formatArtifactStatus(latestRun.status)],
      action: {
        label: "Open run",
        title: "Open run provider-health diagnostics.",
        target: "runs-live",
      },
    };
  }
  return undefined;
}

function activeCompileStatusIsCurrent(input: Pick<WorkflowPersistentStatusInput, "compileActive" | "compileProgress" | "latestRun">): boolean {
  if (!input.compileActive) return false;
  if (!input.latestRun) return true;
  const latest = input.compileProgress?.at(-1);
  if (!latest) return true;
  if (latest.status !== "running") return false;
  const runUpdatedAt = Date.parse(input.latestRun.updatedAt);
  const compileCreatedAt = Date.parse(latest.createdAt);
  if (Number.isFinite(runUpdatedAt) && Number.isFinite(compileCreatedAt) && runUpdatedAt >= compileCreatedAt) return false;
  return true;
}

function workflowPermissionRequirementCount(manifest: Pick<WorkflowArtifactSummary["manifest"], "connectors" | "pluginCapabilities" | "ambientCliCapabilities" | "googleWorkspaceMethods">): number {
  return (
    (manifest.connectors?.length ?? 0) +
    (manifest.pluginCapabilities?.length ?? 0) +
    (manifest.ambientCliCapabilities?.length ?? 0) +
    (manifest.googleWorkspaceMethods?.length ?? 0)
  );
}

function providerHealthBadge(run: Pick<WorkflowRunSummary, "providerHealth">): string {
  const status = run.providerHealth?.status;
  if (!status || status === "unknown") return "Provider unknown";
  if (status === "ok") return "Provider ok";
  return formatArtifactStatus(status);
}

function versionBadge(thread: Pick<WorkflowAgentThreadSummary, "latestVersion">): string {
  return thread.latestVersion ? `Version ${thread.latestVersion.version}` : "No approved version";
}

function formatThreadPhase(value: string): string {
  return formatArtifactStatus(value);
}

function formatArtifactStatus(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
