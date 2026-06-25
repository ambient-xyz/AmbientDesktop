import { vi } from "vitest";

import type { PermissionMode, PermissionRequest } from "../../shared/permissionTypes";
import type { WorkflowDashboard, WorkflowRunDetail } from "../../shared/workflowTypes";
import type {
  CompileWorkflowArtifactInput,
  RunWorkflowArtifactInput as WorkflowRunArtifactServiceInput,
  WorkflowConnectorDescriptor,
  WorkflowDebugRewriteContext,
  WorkflowRecoveryPlan,
} from "./ipcWorkflowFacade";

export interface FakeWorkflowCompileStore {
  getWorkspace: ReturnType<typeof vi.fn<() => { statePath: string }>>;
}

export interface FakeWorkflowCompileThread {
  model: string;
  permissionMode: PermissionMode;
}

export interface FakeWorkflowDebugRewriteWorkflowThread {
  latestVersion?: {
    id?: string;
  };
}

export interface FakeWorkflowRunArtifactArtifact {
  id: string;
  status: string;
  workflowThreadId?: string;
}

export interface FakeWorkflowRecoverRunHost {
  store: FakeWorkflowCompileStore;
}

export interface FakeWorkflowApprovalStore {
  marker: "workflow-approval-store";
}

export interface FakeWorkflowApprovalHost {
  store: FakeWorkflowApprovalStore;
  workspacePath: string;
}

export interface FakeWorkflowCancelRunStore {
  marker: "workflow-cancel-run-store";
}

export interface FakeWorkflowCancelRunHost {
  store: FakeWorkflowCancelRunStore;
  workspacePath: string;
}

export interface FakeWorkflowArtifactReviewStore {
  marker: "workflow-artifact-review-store";
}

export interface FakeWorkflowArtifactReviewHost {
  store: FakeWorkflowArtifactReviewStore;
  workspacePath: string;
}

export interface FakeWorkflowConnectorGrantStore {
  marker: "workflow-connector-grant-store";
}

export interface FakeWorkflowConnectorGrantHost {
  store: FakeWorkflowConnectorGrantStore;
  workspacePath: string;
}

export interface FakeWorkflowArtifactRevalidationStore {
  marker: "workflow-artifact-revalidation-store";
}

export interface FakeWorkflowArtifactRevalidationHost {
  store: FakeWorkflowArtifactRevalidationStore;
  workspacePath: string;
}

export interface FakeWorkflowArtifactSourceStore {
  marker: "workflow-artifact-source-store";
}

export interface FakeWorkflowArtifactSourceHost {
  store: FakeWorkflowArtifactSourceStore;
  workspacePath: string;
}

export interface FakeWorkflowRunAbortController {
  abort: ReturnType<typeof vi.fn<() => void>>;
}

export const workflowDashboard = {
  artifacts: [],
  runs: [],
} satisfies WorkflowDashboard;
export const workflowConnectorDescriptors = [] satisfies WorkflowConnectorDescriptor[];
export const workflowCompileProgress = {
  compileId: "compile-1",
  phase: "model",
  status: "running",
  message: "Compiling workflow",
  current: 1,
  total: 3,
  createdAt: "2026-01-01T00:00:00.000Z",
} satisfies Parameters<NonNullable<CompileWorkflowArtifactInput["onProgress"]>>[0];
export const workflowPluginRegistry = { marker: "workflow-plugin-registry" };
export const workflowPluginRegistrations: NonNullable<CompileWorkflowArtifactInput["pluginRegistrations"]> = [];
export const workflowToolDescriptors: CompileWorkflowArtifactInput["toolDescriptors"] = [];
export const workflowSearchRoutingSettings = {} satisfies NonNullable<CompileWorkflowArtifactInput["searchRoutingSettings"]>;
export const workflowRunPluginRegistry = {
  plugins: [],
  capabilities: [],
  sources: [],
  errors: [],
  sourceNotes: [],
} satisfies NonNullable<WorkflowRunArtifactServiceInput["pluginRegistry"]>;
export const workflowRunPluginRegistration = { marker: "workflow-plugin-registration" } as unknown as NonNullable<
  WorkflowRunArtifactServiceInput["pluginRegistrations"]
>[number];
export const workflowRunPluginRegistrations = [workflowRunPluginRegistration] satisfies NonNullable<
  WorkflowRunArtifactServiceInput["pluginRegistrations"]
>;
export const workflowRunConnectorRegistrations = [] satisfies NonNullable<WorkflowRunArtifactServiceInput["connectorRegistrations"]>;
export const workflowRunBrowser = { marker: "workflow-browser" } as unknown as NonNullable<WorkflowRunArtifactServiceInput["browser"]>;
export const workflowRunArtifact = {
  id: "artifact-1",
  status: "approved",
  workflowThreadId: "workflow-thread-1",
} satisfies FakeWorkflowRunArtifactArtifact;
export const workflowRecoveryPlan = {
  artifactId: "artifact-1",
  resumeFromRunId: "run-1",
  recovery: {
    action: "retry_step",
    sourceRunId: "run-1",
    sourceEventId: "event-1",
    targetGraphNodeId: "node-1",
    reason: "Retry selected graph node.",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
} satisfies WorkflowRecoveryPlan;
export const workflowPermissionRequest = {
  threadId: "thread-1",
  toolName: "workflow:test",
  title: "Allow workflow test",
  message: "Allow the workflow test tool.",
  risk: "workspace-command",
} satisfies Omit<PermissionRequest, "id">;
export const workflowDebugContext = {
  runId: "run-1",
  artifactId: "artifact-1",
  workflowThreadId: "workflow-thread-1",
  title: "Customer workflow",
  goal: "Summarize customer notes",
  userNotes: "Fix retry",
  recentEvents: [],
  modelCalls: [],
  checkpointKeys: [],
  source: "export async function main() {}",
  auditReport: "Audit failed on retry.",
} satisfies WorkflowDebugRewriteContext;
export const workflowDebugWorkflowThread = {
  latestVersion: {
    id: "version-1",
  },
} satisfies FakeWorkflowDebugRewriteWorkflowThread;
export const workflowDebugRequestedChange = "Debug and rewrite the customer workflow.";
export const workflowDebugPromptSection = "Workflow debug rewrite context.";

export const workflowRunDetail = {
  marker: "workflow-run-detail",
} as unknown as WorkflowRunDetail;
