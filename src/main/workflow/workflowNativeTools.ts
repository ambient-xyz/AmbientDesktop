import type { InvokeWorkflowNativeToolInput, WorkflowNativeToolInvocationResult, WorkflowNativeToolName } from "../../shared/workflowTypes";
import { workflowApplyRevision } from "./workflowNativeToolActions";
import {
  workflowExplainRevisionDiff,
  workflowProposeManifestRevision,
  workflowProposeRevision,
  workflowValidateRevision,
} from "./workflowNativeToolRevisionActions";
import { workflowRestoreVersion, workflowRunPreview, workflowRunVersion, workflowUpdateRunSettings } from "./workflowNativeToolRunActions";
import {
  workflowArtifactContext,
  workflowCapabilityDescribe,
  workflowCapabilitySearch,
  workflowCurrentContext,
  workflowRunTraceContext,
  workflowSourceContext,
  workflowVersionsContext,
} from "./workflowNativeToolReadTools";
import { type WorkflowNativeToolRuntime, isRecord, requireWorkflowThreadId } from "./workflowNativeToolShared";

export type { WorkflowNativeRunArtifactInput, WorkflowNativeToolRuntime } from "./workflowNativeToolShared";

const workflowNativeToolNames: WorkflowNativeToolName[] = [
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
  "workflow_apply_revision",
  "workflow_update_run_settings",
  "workflow_restore_version",
  "workflow_run_preview",
  "workflow_run_version",
];

export { workflowNativeToolDescriptors } from "./workflowNativeToolDescriptors";

export async function invokeWorkflowNativeTool(
  runtime: WorkflowNativeToolRuntime,
  input: InvokeWorkflowNativeToolInput,
): Promise<WorkflowNativeToolInvocationResult> {
  if (!workflowNativeToolNames.includes(input.toolName)) throw new Error(`Unknown workflow-native tool: ${input.toolName}`);
  const args = workflowToolArgsWithDefaultThread(input.arguments ?? {}, runtime.defaultWorkflowThreadId);
  const data = await workflowNativeToolData(runtime, input.toolName, args);
  return {
    toolName: input.toolName,
    data,
    text: workflowNativeToolText(input.toolName, data),
  };
}

function workflowToolArgsWithDefaultThread(
  args: Record<string, unknown>,
  defaultWorkflowThreadId: string | undefined,
): Record<string, unknown> {
  if (!defaultWorkflowThreadId || (typeof args.workflowThreadId === "string" && args.workflowThreadId.trim())) return args;
  return { ...args, workflowThreadId: defaultWorkflowThreadId };
}

async function workflowNativeToolData(
  runtime: WorkflowNativeToolRuntime,
  toolName: WorkflowNativeToolName,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (toolName) {
    case "workflow_current_context":
      return workflowCurrentContext(runtime, requireWorkflowThreadId(args));
    case "workflow_get_artifact":
      return workflowArtifactContext(runtime, args);
    case "workflow_get_source":
      return workflowSourceContext(runtime, args);
    case "workflow_get_run_trace":
      return workflowRunTraceContext(runtime, args);
    case "workflow_get_versions":
      return workflowVersionsContext(runtime, args);
    case "workflow_capability_search":
      return workflowCapabilitySearch(runtime, args);
    case "workflow_capability_describe":
      return workflowCapabilityDescribe(runtime, args);
    case "workflow_propose_manifest_revision":
      return workflowProposeManifestRevision(runtime, args);
    case "workflow_propose_revision":
      return workflowProposeRevision(runtime, args);
    case "workflow_validate_revision":
      return workflowValidateRevision(runtime, args);
    case "workflow_explain_revision_diff":
      return workflowExplainRevisionDiff(runtime, args);
    case "workflow_apply_revision":
      return workflowApplyRevision(runtime, args);
    case "workflow_update_run_settings":
      return workflowUpdateRunSettings(runtime, args);
    case "workflow_restore_version":
      return workflowRestoreVersion(runtime, args);
    case "workflow_run_preview":
      return workflowRunPreview(runtime, args);
    case "workflow_run_version":
      return workflowRunVersion(runtime, args);
  }
}

function workflowNativeToolText(toolName: WorkflowNativeToolName, data: unknown): string {
  const summary = toolTextSummary(toolName, data);
  return `${summary}\n\n${JSON.stringify(data, null, 2)}`;
}

function toolTextSummary(toolName: WorkflowNativeToolName, data: unknown): string {
  if (toolName === "workflow_capability_search" && isRecord(data)) {
    const results = Array.isArray(data.results) ? data.results : [];
    return `Workflow capability search returned ${results.length} result${results.length === 1 ? "" : "s"}.`;
  }
  if (toolName === "workflow_get_source" && isRecord(data)) {
    return `Workflow source ${data.truncated ? "preview" : "content"} returned ${String(data.returnedChars ?? 0)} of ${String(data.chars ?? 0)} chars.`;
  }
  if (toolName === "workflow_get_run_trace" && isRecord(data)) {
    return `Workflow run trace returned ${String(data.returnedEventCount ?? 0)} of ${String(data.eventCount ?? 0)} events.`;
  }
  if (toolName === "workflow_get_versions" && isRecord(data)) {
    return `Workflow versions returned ${String(data.returnedVersions ?? 0)} of ${String(data.totalVersions ?? 0)} versions.`;
  }
  if (toolName === "workflow_propose_manifest_revision" && isRecord(data)) {
    return data.created
      ? `Workflow manifest-only revision proposal created: ${String((data.revision as { id?: string } | undefined)?.id ?? "unknown")}. Next, validate and explain this same revision id; do not call workflow_propose_revision for the same manifest-only edit.`
      : "Workflow manifest-only revision proposal was rejected by validation.";
  }
  if (toolName === "workflow_propose_revision" && isRecord(data)) {
    return data.created
      ? `Workflow revision proposal created: ${String((data.revision as { id?: string } | undefined)?.id ?? "unknown")}.`
      : "Workflow revision proposal was rejected by validation.";
  }
  if (toolName === "workflow_validate_revision" && isRecord(data)) {
    return `Workflow revision validation ${data.valid ? "passed" : "failed"} with ${Array.isArray(data.errors) ? data.errors.length : 0} error${Array.isArray(data.errors) && data.errors.length === 1 ? "" : "s"}.`;
  }
  if (toolName === "workflow_explain_revision_diff" && isRecord(data)) {
    return `Workflow revision diff explained: ${String(data.graphSummary ?? "no graph diff")}; ${String(data.sourceSummary ?? "no source diff")}`;
  }
  if (toolName === "workflow_apply_revision" && isRecord(data)) {
    return data.applied
      ? `Workflow revision applied: ${String((data.revision as { id?: string } | undefined)?.id ?? "unknown")}.`
      : `Workflow revision was not applied: ${String(data.reason ?? "see validation details")}`;
  }
  if (toolName === "workflow_update_run_settings" && isRecord(data)) {
    const action = typeof data.action === "string" ? data.action : "unknown";
    if (data.updated) return `Workflow run settings updated with ${action}.`;
    if (isRecord(data.revision)) return `Workflow run settings revision proposed: ${String(data.revision.id ?? "unknown")}.`;
    return `Workflow run settings ${action} completed.`;
  }
  if (toolName === "workflow_restore_version" && isRecord(data)) {
    if (data.restored) {
      const restoredVersion = isRecord(data.restoredVersion) ? data.restoredVersion.version : "unknown";
      return `Workflow version restored as v${String(restoredVersion)}.`;
    }
    return `Workflow version was not restored: ${String(data.reason ?? "see details")}`;
  }
  if (toolName === "workflow_run_preview" && isRecord(data)) {
    if (data.previewed) {
      const run = isRecord(data.run) ? String(data.run.id ?? "unknown") : "unknown";
      return `Workflow run preview completed: ${run}.`;
    }
    return `Workflow run preview was not started: ${String(data.reason ?? "see details")}`;
  }
  if (toolName === "workflow_run_version" && isRecord(data)) {
    if (data.ran) {
      const run = isRecord(data.run) ? String(data.run.id ?? "unknown") : "unknown";
      return `Workflow version run completed: ${run}.`;
    }
    return `Workflow version run was not started: ${String(data.reason ?? "see details")}`;
  }
  return `${toolName} completed.`;
}
