import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import { resolveAmbientFeatureFlags, type AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type {
  DesktopEvent,
  DesktopState,
} from "../../shared/desktopTypes";
import type {
  AmbientPermissionGrant,
  PermissionMode,
  PermissionRequest,
} from "../../shared/permissionTypes";
import type { ChatMessage } from "../../shared/threadTypes";
import type {
  AnswerWorkflowDiscoveryQuestionInput,
  CancelWorkflowRunInput,
  CompileWorkflowDebugRewriteInput,
  CompileWorkflowPreviewInput,
  CreateWorkflowAgentFolderInput,
  CreateWorkflowAgentThreadInput,
  CreateWorkflowLabRunInput,
  CreateWorkflowRevisionInput,
  InvokeWorkflowNativeToolInput,
  ListWorkflowLabRunsInput,
  MoveWorkflowAgentThreadInput,
  RecoverWorkflowRunInput,
  ResolveWorkflowApprovalInput,
  ResolveWorkflowRevisionInput,
  RestoreWorkflowVersionInput,
  RevalidateWorkflowArtifactInput,
  ReviewWorkflowArtifactInput,
  RunWorkflowArtifactInput,
  SaveSymphonyWorkflowRecipeInput,
  StartWorkflowDiscoveryInput,
  StartWorkflowRevisionDiscoveryInput,
  UpdateWorkflowArtifactSourceInput,
  UpdateWorkflowConnectorGrantInput,
  UpdateWorkflowRevisionInput,
  WorkflowAgentDiscoveryResult,
  WorkflowAgentFolderSummary,
  WorkflowAgentThreadSummary,
  WorkflowDashboard,
  WorkflowDiscoveryCapabilityDescription,
  WorkflowDiscoveryCapabilitySearch,
  WorkflowExplorationTraceSummary,
  WorkflowGraphSnapshot,
  WorkflowLabRun,
  WorkflowNativeToolInvocationResult,
  WorkflowRecordingLibraryDescription,
  WorkflowRecordingLibraryEntry,
  WorkflowRecordingReviewDraftUpdate,
  WorkflowRevisionSummary,
  WorkflowRunDetail,
  WorkflowThreadExplorationResult,
  WorkflowVersionSummary,
} from "../../shared/workflowTypes";
import {
  registerWorkflowAgentCapabilityIpc,
  registerWorkflowAgentDiscoveryAnswerIpc,
  registerWorkflowAgentDiscoveryAccessIpc,
  registerWorkflowAgentDiscoveryStartIpc,
  registerWorkflowAgentExplorationIpc,
  registerWorkflowAgentNativeToolIpc,
  registerWorkflowAgentRevisionDiscoveryStartIpc,
  registerWorkflowAgentRevisionIpc,
  registerWorkflowAgentThreadIpc,
  registerWorkflowAgentTraceIpc,
  registerWorkflowApprovalIpc,
  registerWorkflowArtifactRevalidationIpc,
  registerWorkflowArtifactReviewIpc,
  registerWorkflowArtifactSourceIpc,
  registerWorkflowCancelRunIpc,
  registerWorkflowCompilePreviewIpc,
  registerWorkflowDebugRewriteIpc,
  registerWorkflowConnectorGrantIpc,
  registerWorkflowDashboardIpc,
  registerWorkflowLabIpc,
  registerWorkflowRecoverRunIpc,
  registerWorkflowRecorderIpc,
  registerWorkflowRunArtifactIpc,
  workflowAgentCapabilityIpcChannels,
  workflowAgentDiscoveryAnswerIpcChannels,
  workflowAgentDiscoveryAccessIpcChannels,
  workflowAgentDiscoveryStartIpcChannels,
  workflowAgentExplorationIpcChannels,
  workflowAgentNativeToolIpcChannels,
  workflowAgentRevisionDiscoveryStartIpcChannels,
  workflowAgentRevisionIpcChannels,
  workflowAgentThreadIpcChannels,
  workflowAgentTraceIpcChannels,
  workflowApprovalIpcChannels,
  workflowArtifactRevalidationIpcChannels,
  workflowArtifactReviewIpcChannels,
  workflowArtifactSourceIpcChannels,
  workflowCancelRunIpcChannels,
  workflowCompilePreviewIpcChannels,
  workflowDebugRewriteIpcChannels,
  workflowConnectorGrantIpcChannels,
  workflowDashboardIpcChannels,
  workflowLabIpcChannels,
  workflowRecoverRunIpcChannels,
  workflowRecorderIpcChannels,
  workflowRunArtifactIpcChannels,
  type RegisterWorkflowAgentCapabilityIpcDependencies,
  type RegisterWorkflowAgentDiscoveryAnswerIpcDependencies,
  type RegisterWorkflowAgentDiscoveryAccessIpcDependencies,
  type RegisterWorkflowAgentDiscoveryStartIpcDependencies,
  type RegisterWorkflowAgentExplorationIpcDependencies,
  type RegisterWorkflowAgentNativeToolIpcDependencies,
  type RegisterWorkflowAgentRevisionDiscoveryStartIpcDependencies,
  type RegisterWorkflowAgentRevisionIpcDependencies,
  type RegisterWorkflowAgentThreadIpcDependencies,
  type RegisterWorkflowAgentTraceIpcDependencies,
  type RegisterWorkflowApprovalIpcDependencies,
  type RegisterWorkflowArtifactRevalidationIpcDependencies,
  type RegisterWorkflowArtifactReviewIpcDependencies,
  type RegisterWorkflowArtifactSourceIpcDependencies,
  type RegisterWorkflowCancelRunIpcDependencies,
  type RegisterWorkflowCompilePreviewIpcDependencies,
  type RegisterWorkflowDebugRewriteIpcDependencies,
  type RegisterWorkflowConnectorGrantIpcDependencies,
  type RegisterWorkflowDashboardIpcDependencies,
  type RegisterWorkflowLabIpcDependencies,
  type RegisterWorkflowRecoverRunIpcDependencies,
  type RegisterWorkflowRunArtifactIpcDependencies,
} from "./registerWorkflowIpc";
import type {
  CompileWorkflowArtifactInput,
  RunWorkflowArtifactInput as WorkflowRunArtifactServiceInput,
  WorkflowConnectorDescriptor,
  WorkflowDebugRewriteContext,
  WorkflowDiscoveryPolicyContext,
  WorkflowRecoveryPlan,
} from "./ipcWorkflowFacade";

type IpcListener = Parameters<IpcMain["handle"]>[1];

interface FakeThread {
  id: string;
  workspacePath: string;
  gitWorktree?: { path: string };
}

interface FakeStore {
  getWorkspace: ReturnType<typeof vi.fn<() => { path: string }>>;
  createWorkflowRecordingThread: ReturnType<typeof vi.fn<(input: { goal?: string; workspacePath: string }) => FakeThread>>;
  stopWorkflowRecording: ReturnType<typeof vi.fn<(threadId: string) => void>>;
  updateWorkflowRecordingReviewDraft: ReturnType<typeof vi.fn<(threadId: string, draft: WorkflowRecordingReviewDraftUpdate) => void>>;
  confirmWorkflowRecordingReview: ReturnType<typeof vi.fn<(threadId: string) => void>>;
  applyWorkflowRecordingSummary: ReturnType<typeof vi.fn<(threadId: string, messageId?: string) => void>>;
  describeWorkflowRecording: ReturnType<
    typeof vi.fn<(id: string, options: { includeArchived?: boolean }) => WorkflowRecordingLibraryDescription>
  >;
  setWorkflowRecordingEnabled: ReturnType<typeof vi.fn<(id: string, enabled: boolean) => void>>;
  updateWorkflowRecordingPlaybook: ReturnType<
    typeof vi.fn<
      (
        id: string,
        input: {
          baseVersion: number;
          draft: WorkflowRecordingReviewDraftUpdate;
          title?: string;
        },
      ) => void
    >
  >;
  saveSymphonyWorkflowRecipe: ReturnType<
    typeof vi.fn<
      (
        input: SaveSymphonyWorkflowRecipeInput,
        options: { featureFlagSnapshot: AmbientFeatureFlagSnapshot },
      ) => WorkflowRecordingLibraryDescription
    >
  >;
  archiveWorkflowRecording: ReturnType<
    typeof vi.fn<
      (
        id: string,
        input: {
          baseVersion: number;
          reason?: string;
        },
      ) => void
    >
  >;
  unarchiveWorkflowRecording: ReturnType<typeof vi.fn<(id: string, input: { baseVersion: number }) => void>>;
  restoreWorkflowRecordingVersion: ReturnType<typeof vi.fn<(id: string, version: number) => void>>;
}

interface FakeHost {
  activeThreadId: string;
  runtime: {
    requestWorkflowRecordingReview: ReturnType<typeof vi.fn<(input: { threadId: string; feedback?: string }) => Promise<void>>>;
  };
  store: FakeStore;
}

interface FakeWorkflowLabStore {
  createWorkflowLabRun: ReturnType<typeof vi.fn<(input: CreateWorkflowLabRunInput) => WorkflowLabRun>>;
  listWorkflowLabRuns: ReturnType<typeof vi.fn<(input: ListWorkflowLabRunsInput) => WorkflowLabRun[]>>;
  getWorkflowLabRun: ReturnType<typeof vi.fn<(runId: string) => WorkflowLabRun>>;
  updateWorkflowLabRunStatus: ReturnType<typeof vi.fn<(runId: string, status: "stopped") => WorkflowLabRun>>;
  adoptWorkflowLabVariant: ReturnType<typeof vi.fn<(runId: string, variantId: string) => WorkflowRecordingLibraryDescription>>;
}

interface FakeWorkflowLabHost {
  activeThreadId: string;
  store: FakeWorkflowLabStore;
}

interface FakeWorkflowDashboardStore {
  getWorkspace: ReturnType<typeof vi.fn<() => { path: string }>>;
}

interface FakeWorkflowDashboardHost {
  store: FakeWorkflowDashboardStore;
  workspacePath: string;
}

interface FakeWorkflowCompileStore {
  getWorkspace: ReturnType<typeof vi.fn<() => { statePath: string }>>;
}

interface FakeWorkflowCompileThread {
  model: string;
  permissionMode: PermissionMode;
}

interface FakeWorkflowDebugRewriteWorkflowThread {
  latestVersion?: {
    id?: string;
  };
}

interface FakeWorkflowRunArtifactArtifact {
  id: string;
  status: string;
  workflowThreadId?: string;
}

interface FakeWorkflowRecoverRunHost {
  store: FakeWorkflowCompileStore;
}

interface FakeWorkflowApprovalStore {
  marker: "workflow-approval-store";
}

interface FakeWorkflowApprovalHost {
  store: FakeWorkflowApprovalStore;
  workspacePath: string;
}

interface FakeWorkflowCancelRunStore {
  marker: "workflow-cancel-run-store";
}

interface FakeWorkflowCancelRunHost {
  store: FakeWorkflowCancelRunStore;
  workspacePath: string;
}

interface FakeWorkflowArtifactReviewStore {
  marker: "workflow-artifact-review-store";
}

interface FakeWorkflowArtifactReviewHost {
  store: FakeWorkflowArtifactReviewStore;
  workspacePath: string;
}

interface FakeWorkflowConnectorGrantStore {
  marker: "workflow-connector-grant-store";
}

interface FakeWorkflowConnectorGrantHost {
  store: FakeWorkflowConnectorGrantStore;
  workspacePath: string;
}

interface FakeWorkflowArtifactRevalidationStore {
  marker: "workflow-artifact-revalidation-store";
}

interface FakeWorkflowArtifactRevalidationHost {
  store: FakeWorkflowArtifactRevalidationStore;
  workspacePath: string;
}

interface FakeWorkflowArtifactSourceStore {
  marker: "workflow-artifact-source-store";
}

interface FakeWorkflowArtifactSourceHost {
  store: FakeWorkflowArtifactSourceStore;
  workspacePath: string;
}

interface FakeWorkflowRunAbortController {
  abort: ReturnType<typeof vi.fn<() => void>>;
}

interface FakeWorkflowAgentThreadStore {
  createWorkflowAgentFolder: ReturnType<typeof vi.fn<(input: CreateWorkflowAgentFolderInput) => WorkflowAgentFolderSummary[]>>;
  moveWorkflowAgentThread: ReturnType<typeof vi.fn<(input: MoveWorkflowAgentThreadInput) => WorkflowAgentFolderSummary[]>>;
  createWorkflowAgentThread: ReturnType<typeof vi.fn<(input: CreateWorkflowAgentThreadInput) => WorkflowAgentFolderSummary[]>>;
  ensureWorkflowAgentChatThread: ReturnType<typeof vi.fn<(workflowThreadId: string) => WorkflowAgentThreadSummary>>;
  getWorkflowAgentThreadSummary: ReturnType<typeof vi.fn<(workflowThreadId: string) => WorkflowAgentThreadSummary>>;
  getThread: ReturnType<typeof vi.fn<(threadId: string) => unknown>>;
  listMessages: ReturnType<typeof vi.fn<(threadId: string) => ChatMessage[]>>;
}

interface FakeWorkflowAgentThreadHost {
  store: FakeWorkflowAgentThreadStore;
}

interface FakeWorkflowAgentDiscoveryStartStore {
  marker: "workflow-agent-discovery-start-store";
}

interface FakeWorkflowAgentDiscoveryStartContext {
  targetStore: FakeWorkflowAgentDiscoveryStartStore;
  thread: {
    id: string;
    permissionMode: PermissionMode;
  };
  projectPath: string;
}

interface FakeWorkflowAgentRevisionDiscoveryStartStore {
  marker: "workflow-agent-revision-discovery-start-store";
}

interface FakeWorkflowAgentRevisionDiscoveryStartContext {
  targetStore: FakeWorkflowAgentRevisionDiscoveryStartStore;
  thread: {
    id: string;
    permissionMode: PermissionMode;
  };
  workflowThread: {
    chatThreadId?: string;
  };
  projectPath: string;
}

interface FakeWorkflowAgentDiscoveryAnswerStore {
  marker: "workflow-agent-discovery-answer-store";
}

interface FakeWorkflowAgentDiscoveryAnswerContext {
  targetStore: FakeWorkflowAgentDiscoveryAnswerStore;
  thread: {
    id: string;
    permissionMode: PermissionMode;
  };
  workflowThread: {
    chatThreadId?: string;
  };
  projectPath: string;
}

interface FakeWorkflowAgentTraceStore {
  listWorkflowGraphSnapshots: ReturnType<typeof vi.fn<(workflowThreadId: string) => WorkflowGraphSnapshot[]>>;
  listWorkflowExplorationTraces: ReturnType<typeof vi.fn<(workflowThreadId: string) => WorkflowExplorationTraceSummary[]>>;
}

interface FakeWorkflowAgentTraceHost {
  store: FakeWorkflowAgentTraceStore;
}

interface FakeWorkflowAgentCapabilityContext {
  kind: "project" | "workflow";
  projectPath?: string;
  workflowThreadId?: string;
}

interface FakeWorkflowAgentNativeToolStore {
  marker: "workflow-agent-native-tool-store";
}

interface FakeWorkflowAgentNativeToolContext {
  targetStore: FakeWorkflowAgentNativeToolStore;
  kind: "project" | "workflow";
  projectPath: string;
  workflowThreadId?: string;
}

interface FakeWorkflowAgentExplorationStore {
  listWorkflowAgentFolders: ReturnType<typeof vi.fn<() => WorkflowAgentFolderSummary[]>>;
}

interface FakeWorkflowAgentExplorationContext {
  targetStore: FakeWorkflowAgentExplorationStore;
  projectPath: string;
}

interface FakeWorkflowAgentDiscoveryAccessStore {
  listPermissionGrants: ReturnType<typeof vi.fn<() => AmbientPermissionGrant[]>>;
}

interface FakeWorkflowAgentDiscoveryAccessContext {
  targetStore: FakeWorkflowAgentDiscoveryAccessStore;
  thread: {
    id: string;
    permissionMode: PermissionMode;
  };
  workflowThread: {
    chatThreadId?: string;
  };
  projectPath: string;
}

interface FakeWorkflowAgentRevisionStore {
  listWorkflowRevisions: ReturnType<typeof vi.fn<(workflowThreadId: string) => WorkflowRevisionSummary[]>>;
  listWorkflowVersions: ReturnType<typeof vi.fn<(workflowThreadId: string) => WorkflowVersionSummary[]>>;
  createWorkflowRevision: ReturnType<typeof vi.fn<(input: CreateWorkflowRevisionInput) => WorkflowRevisionSummary>>;
  getWorkflowRevision: ReturnType<typeof vi.fn<(revisionId: string) => WorkflowRevisionSummary>>;
  updateWorkflowRevision: ReturnType<typeof vi.fn<(input: UpdateWorkflowRevisionInput) => WorkflowRevisionSummary>>;
  resolveWorkflowRevision: ReturnType<typeof vi.fn<(input: ResolveWorkflowRevisionInput) => WorkflowRevisionSummary>>;
}

interface FakeWorkflowAgentRevisionHost {
  store: FakeWorkflowAgentRevisionStore;
  workspacePath: string;
}

const state = { marker: "desktop-state" } as unknown as DesktopState;
const thread = { id: "thread-1", workspacePath: "/workspace" } satisfies FakeThread;
const preparedThread = {
  ...thread,
  gitWorktree: { path: "/workspace/.ambient/worktrees/thread-1" },
} satisfies FakeThread;

const reviewDraft = {
  intent: "Summarize weekly customer updates",
  inputs: ["A workspace with exported CRM notes"],
  successfulExamples: [
    {
      toolName: "workspace:read-file",
      inputPreview: "notes.md",
      resultPreview: "Read the notes",
      artifactPath: ".ambient/workflows/notes.md",
    },
  ],
  doNot: [
    {
      toolName: "browser:search",
      status: "skipped",
      reason: "Do not search the web for private customer notes.",
    },
  ],
  validation: ["Summary cites each customer"],
  outputShape: ["Markdown summary"],
} satisfies WorkflowRecordingReviewDraftUpdate;

const libraryEntry = {
  id: "workflow-1",
  title: "Customer update summary",
  version: 2,
  enabled: true,
  savedAt: "2026-01-01T00:00:00.000Z",
  manifestPath: "/workspace/.ambient/workflows/workflow-1/manifest.json",
  markdownPath: "/workspace/.ambient/workflows/workflow-1/playbook.md",
  sidecarPath: "/workspace/.ambient/workflows/workflow-1/sidecar.json",
  transcriptPath: "/workspace/.ambient/workflows/workflow-1/transcript.jsonl",
  summary: "Summarize customer updates.",
  toolNames: ["workspace:read-file"],
  outputShape: ["Markdown summary"],
  versions: [],
} satisfies WorkflowRecordingLibraryEntry;

const libraryDescription = {
  ...libraryEntry,
  markdownPreview: "# Customer update summary",
} satisfies WorkflowRecordingLibraryDescription;

const labRun = {
  id: "lab-run-1",
  workflowId: "workflow-1",
  workflowTitle: "Customer update summary",
  baseVersion: 2,
  goal: "Improve robustness",
  metricEmphasis: "reliability",
  attemptBudget: 3,
  plateauThreshold: 0.8,
  heldOutEnabled: true,
  status: "draft",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  artifactPath: "/workspace/.ambient/workflow-lab/lab-run-1.json",
  evaluationCases: [],
  variants: [],
  audit: [],
} satisfies WorkflowLabRun;

const runningLabRun = {
  ...labRun,
  status: "running",
} satisfies WorkflowLabRun;

const stoppedLabRun = {
  ...labRun,
  status: "stopped",
} satisfies WorkflowLabRun;

const workflowAgentThread = {
  id: "workflow-thread-1",
  folderId: "folder-1",
  chatThreadId: "chat-thread-1",
  projectName: "Ambient",
  projectPath: "/workspace",
  title: "Weekly customer summary",
  phase: "request",
  initialRequest: "Summarize weekly customer notes.",
  preview: "Summarize weekly customer notes.",
  status: "Ready",
  traceMode: "production",
  discoveryQuestions: [],
  badges: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} satisfies WorkflowAgentThreadSummary;

const workflowAgentThreadWithoutChat = {
  ...workflowAgentThread,
  id: "workflow-thread-no-chat",
  chatThreadId: undefined,
} satisfies WorkflowAgentThreadSummary;

const workflowAgentFolders = [
  {
    id: "folder-1",
    name: "Review",
    kind: "custom",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    threads: [workflowAgentThread],
  },
] satisfies WorkflowAgentFolderSummary[];

const workflowAgentMessages = [
  {
    id: "message-1",
    threadId: "chat-thread-1",
    role: "user",
    content: "Summarize this week.",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
] satisfies ChatMessage[];

const workflowGraphSnapshot = {
  id: "graph-snapshot-1",
  workflowThreadId: "workflow-thread-1",
  version: 1,
  source: "exploration",
  nodes: [],
  edges: [],
  summary: "Explored the retry path.",
  createdAt: "2026-01-01T00:00:00.000Z",
} satisfies WorkflowGraphSnapshot;

const workflowExplorationTrace = {
  id: "exploration-trace-1",
  workflowThreadId: "workflow-thread-1",
  explorationId: "exploration-1",
  explorationNodeId: "node-1",
  request: "Inspect the retry path.",
  model: "ambient-test",
  capabilityManifest: {},
  observations: [],
  events: [],
  distillation: {},
  status: "succeeded",
  graphSnapshotId: "graph-snapshot-1",
  createdAt: "2026-01-01T00:00:00.000Z",
} satisfies WorkflowExplorationTraceSummary;

const workflowDiscoveryPolicyContext = {
  projectPath: "/workspace",
  workspacePath: "/workspace",
  permissionMode: "workspace",
  stage: "initial_discovery",
  workflowThreadId: "workflow-thread-1",
  threadId: "thread-1",
  scannedAt: "2026-01-01T00:00:00.000Z",
  files: [],
  skippedPaths: [],
  contentExcerpts: [],
  accessDecisions: [],
  contextEvidence: [],
  connectors: [],
  pluginTools: [],
  ambientCliCapabilities: [],
  policyNotes: [],
} satisfies WorkflowDiscoveryPolicyContext;

const workflowCapabilitySearch = {
  query: "gmail",
  policy: "Metadata only.",
  results: [
    {
      id: "connector:google.gmail",
      kind: "connector",
      label: "Gmail",
      description: "Search Gmail metadata.",
      status: "requires_grant",
      recommendation: "available",
      reason: "The request mentions Gmail.",
      matchedTerms: ["gmail"],
      connectorId: "google.gmail",
    },
  ],
  totalCandidateCount: 1,
  omittedCandidateCount: 0,
} satisfies WorkflowDiscoveryCapabilitySearch;

const workflowCapabilityDescription = {
  id: "connector:google.gmail",
  kind: "connector",
  label: "Gmail",
  description: "Search Gmail metadata.",
  status: "requires_grant",
  recommendation: "available",
  policy: "Requires connector approval before content access.",
  mutationClass: "read_only",
  examples: [],
  warnings: [],
} satisfies WorkflowDiscoveryCapabilityDescription;

const workflowNativeToolResult = {
  toolName: "workflow_get_artifact",
  text: "Workflow artifact details.",
  data: { artifactId: "artifact-1" },
} satisfies WorkflowNativeToolInvocationResult;

const workflowThreadExplorationResult = {
  folders: workflowAgentFolders,
  thread: workflowAgentThread,
  trace: workflowExplorationTrace,
  graphSnapshot: workflowGraphSnapshot,
} satisfies WorkflowThreadExplorationResult;

const workflowDiscoveryResult = {
  folders: workflowAgentFolders,
  thread: workflowAgentThread,
} satisfies WorkflowAgentDiscoveryResult;

const workflowDiscoveryPermissionGrant = {
  id: "permission-grant-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  createdBy: "system",
  permissionModeAtCreation: "workspace",
  scopeKind: "workflow_thread",
  workflowThreadId: "workflow-thread-1",
  actionKind: "connector_content_read",
  targetKind: "connector_account",
  targetHash: "connector-account-hash",
  targetLabel: "Gmail account",
  source: "workflow_review",
  reason: "Allowed workflow discovery context.",
} satisfies AmbientPermissionGrant;

const workflowVersion = {
  id: "version-1",
  workflowThreadId: "workflow-thread-1",
  artifactId: "artifact-1",
  version: 3,
  sourcePath: "/workspace/WORKFLOW.md",
  repoPath: "WORKFLOW.md",
  status: "approved",
  createdBy: "compiler",
  createdAt: "2026-01-01T00:00:00.000Z",
} satisfies WorkflowVersionSummary;

const workflowRevision = {
  id: "revision-1",
  workflowThreadId: "workflow-thread-1",
  baseVersionId: "version-1",
  requestedChange: "Make retries clearer.",
  status: "proposed",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} satisfies WorkflowRevisionSummary;

const appliedWorkflowRevision = {
  ...workflowRevision,
  status: "applied",
} satisfies WorkflowRevisionSummary;

const workflowDashboard = {
  artifacts: [],
  runs: [],
} satisfies WorkflowDashboard;
const workflowConnectorDescriptors = [] satisfies WorkflowConnectorDescriptor[];
const workflowCompileProgress = {
  compileId: "compile-1",
  phase: "model",
  status: "running",
  message: "Compiling workflow",
  current: 1,
  total: 3,
  createdAt: "2026-01-01T00:00:00.000Z",
} satisfies Parameters<NonNullable<CompileWorkflowArtifactInput["onProgress"]>>[0];
const workflowPluginRegistry = { marker: "workflow-plugin-registry" };
const workflowPluginRegistrations: NonNullable<CompileWorkflowArtifactInput["pluginRegistrations"]> = [];
const workflowToolDescriptors: CompileWorkflowArtifactInput["toolDescriptors"] = [];
const workflowSearchRoutingSettings = {} satisfies NonNullable<CompileWorkflowArtifactInput["searchRoutingSettings"]>;
const workflowRunPluginRegistry = {
  plugins: [],
  capabilities: [],
  sources: [],
  errors: [],
  sourceNotes: [],
} satisfies NonNullable<WorkflowRunArtifactServiceInput["pluginRegistry"]>;
const workflowRunPluginRegistration = { marker: "workflow-plugin-registration" } as unknown as NonNullable<
  WorkflowRunArtifactServiceInput["pluginRegistrations"]
>[number];
const workflowRunPluginRegistrations = [workflowRunPluginRegistration] satisfies NonNullable<
  WorkflowRunArtifactServiceInput["pluginRegistrations"]
>;
const workflowRunConnectorRegistrations = [] satisfies NonNullable<WorkflowRunArtifactServiceInput["connectorRegistrations"]>;
const workflowRunBrowser = { marker: "workflow-browser" } as unknown as NonNullable<WorkflowRunArtifactServiceInput["browser"]>;
const workflowRunArtifact = {
  id: "artifact-1",
  status: "approved",
  workflowThreadId: "workflow-thread-1",
} satisfies FakeWorkflowRunArtifactArtifact;
const workflowRecoveryPlan = {
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
const workflowPermissionRequest = {
  threadId: "thread-1",
  toolName: "workflow:test",
  title: "Allow workflow test",
  message: "Allow the workflow test tool.",
  risk: "workspace-command",
} satisfies Omit<PermissionRequest, "id">;
const workflowDebugContext = {
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
const workflowDebugWorkflowThread = {
  latestVersion: {
    id: "version-1",
  },
} satisfies FakeWorkflowDebugRewriteWorkflowThread;
const workflowDebugRequestedChange = "Debug and rewrite the customer workflow.";
const workflowDebugPromptSection = "Workflow debug rewrite context.";

const workflowRunDetail = {
  marker: "workflow-run-detail",
} as unknown as WorkflowRunDetail;

describe("registerWorkflowRecorderIpc", () => {
  it("registers the workflow recorder channels", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowRecorderIpcChannels]);
  });

  it("starts a recording thread and prepares a worktree for the workspace root", async () => {
    const { deps, host, invoke, store } = registerWithFakes();

    await expect(invoke("workflow-recorder:start", { goal: " Record a summary ", workspacePath: "/workspace" })).resolves.toBe(state);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(store.createWorkflowRecordingThread).toHaveBeenCalledWith({
      goal: "Record a summary",
      workspacePath: "/workspace",
    });
    expect(deps.prepareWorktreeForThread).toHaveBeenCalledWith(thread, store);
    expect(deps.setProjectHostActiveThreadId).toHaveBeenCalledWith(host, "thread-1");
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host, "thread-1");
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host, "thread-1");
  });

  it("stops a recording through the project host for the thread action", async () => {
    const { deps, host, invoke, store } = registerWithFakes();

    await expect(invoke("workflow-recorder:stop", { threadId: "thread-1", projectId: "project-1" })).resolves.toBe(state);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.requireProjectRuntimeHostForThreadAction).toHaveBeenCalledWith(
      { threadId: "thread-1", projectId: "project-1" },
      host,
    );
    expect(store.stopWorkflowRecording).toHaveBeenCalledWith("thread-1");
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host, "thread-1");
  });

  it("requests review with trimmed feedback", async () => {
    const { host, invoke, store } = registerWithFakes();

    await expect(invoke("workflow-recorder:request-review", { threadId: "thread-1", feedback: " Tighten this " })).resolves.toBeUndefined();

    expect(store.stopWorkflowRecording).not.toHaveBeenCalled();
    expect(host.runtime.requestWorkflowRecordingReview).toHaveBeenCalledWith({
      threadId: "thread-1",
      feedback: "Tighten this",
    });
  });

  it("searches the global workflow recording library with parsed filters", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(
      invoke("workflow-recorder:search", {
        query: " customer ",
        includeDisabled: true,
        includeArchived: true,
        limit: 5,
      }),
    ).resolves.toEqual([libraryEntry]);

    expect(deps.listGlobalWorkflowRecordingLibrary).toHaveBeenCalledWith({
      query: "customer",
      includeDisabled: true,
      includeArchived: true,
      limit: 5,
    });
  });

  it("updates a saved playbook and emits library state changes", async () => {
    const { deps, host, invoke, store } = registerWithFakes();

    await expect(
      invoke("workflow-recorder:update-playbook", {
        id: "workflow-1",
        baseVersion: 2,
        title: " Updated customer summary ",
        draft: reviewDraft,
      }),
    ).resolves.toBe(state);

    expect(deps.requireProjectRuntimeHostForWorkflowRecording).toHaveBeenCalledWith("workflow-1");
    expect(store.updateWorkflowRecordingPlaybook).toHaveBeenCalledWith("workflow-1", {
      baseVersion: 2,
      title: "Updated customer summary",
      draft: reviewDraft,
    });
    expect(deps.emitWorkflowRecordingLibraryStateChanged).toHaveBeenCalledWith(host, "thread-1");
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host, "thread-1");
  });

  it("saves a Symphony recipe through the active thread host when subagents are enabled", async () => {
    const { deps, host, invoke, store } = registerWithFakes();

    await expect(
      invoke("workflow-recorder:save-symphony-recipe", {
        threadId: "thread-1",
        projectId: "project-1",
        patternId: "map_reduce",
        goal: "  Compare all workflow docs  ",
        blocking: true,
        stepAnswers: {
          "pattern-scope": {
            choiceId: "files",
            customText: "  Focus on implementation plans  ",
          },
        },
        metricCustomizations: {
          "map_reduce-metric": "  Every file is cited exactly once  ",
        },
      }),
    ).resolves.toBe(state);

    const expectedInput = {
      threadId: "thread-1",
      projectId: "project-1",
      patternId: "map_reduce",
      goal: "Compare all workflow docs",
      blocking: true,
      stepAnswers: {
        "pattern-scope": {
          choiceId: "files",
          customText: "Focus on implementation plans",
        },
      },
      metricCustomizations: {
        "map_reduce-metric": "Every file is cited exactly once",
      },
    };
    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.requireProjectRuntimeHostForThreadAction).toHaveBeenCalledWith(expectedInput, host);
    expect(deps.getFeatureFlagSnapshot).toHaveBeenCalledWith(store);
    expect(store.saveSymphonyWorkflowRecipe).toHaveBeenCalledWith(expectedInput, {
      featureFlagSnapshot: resolveAmbientFeatureFlags({
        settings: { subagents: true },
        generatedAt: "2026-06-07T18:00:00.000Z",
      }),
    });
    expect(deps.emitWorkflowRecordingLibraryStateChanged).toHaveBeenCalledWith(host, "thread-1");
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host, "thread-1");
  });

  it("rejects Symphony recipe saves before touching the store when subagents are disabled", async () => {
    const { deps, invoke, store } = registerWithFakes({ subagentsEnabled: false });

    await expect(
      invoke("workflow-recorder:save-symphony-recipe", {
        threadId: "thread-1",
        patternId: "map_reduce",
        goal: "Compare all workflow docs",
        metricCustomizations: {
          "map_reduce-metric": "Every file is cited exactly once.",
        },
      }),
    ).rejects.toThrow("ambient.subagents is off");

    expect(deps.getFeatureFlagSnapshot).toHaveBeenCalledWith(store);
    expect(store.saveSymphonyWorkflowRecipe).not.toHaveBeenCalled();
    expect(deps.emitWorkflowRecordingLibraryStateChanged).not.toHaveBeenCalled();
  });

  it("rejects incomplete Symphony recipe criteria before touching the store", async () => {
    const { deps, invoke, store } = registerWithFakes();

    await expect(
      invoke("workflow-recorder:save-symphony-recipe", {
        threadId: "thread-1",
        patternId: "imitate_and_verify",
        goal: "Create verifier recipe",
      }),
    ).rejects.toThrow("Complete required verifier criteria before saving the Symphony recipe.");

    expect(deps.requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(store.saveSymphonyWorkflowRecipe).not.toHaveBeenCalled();
    expect(deps.emitWorkflowRecordingLibraryStateChanged).not.toHaveBeenCalled();
  });

  it("rejects invalid thread-action input before resolving hosts", async () => {
    const { deps, invoke, store } = registerWithFakes();

    await expect(invoke("workflow-recorder:stop", { threadId: "" })).rejects.toThrow();

    expect(deps.requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(deps.requireProjectRuntimeHostForThreadAction).not.toHaveBeenCalled();
    expect(store.stopWorkflowRecording).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowAgentRevisionIpc", () => {
  it("registers the workflow-agent revision channels", () => {
    const { handlers } = registerRevisionWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowAgentRevisionIpcChannels]);
  });

  it("lists revisions through the workflow thread host", async () => {
    const { deps, invoke, store } = registerRevisionWithFakes();

    await expect(invoke("workflow-agents:list-revisions", { workflowThreadId: "workflow-thread-1" })).resolves.toEqual([workflowRevision]);

    expect(deps.requireProjectRuntimeHostForWorkflowThread).toHaveBeenCalledWith("workflow-thread-1");
    expect(store.listWorkflowRevisions).toHaveBeenCalledWith("workflow-thread-1");
  });

  it("restores versions and emits workflow updates", async () => {
    const { deps, host, invoke } = registerRevisionWithFakes();

    await expect(invoke("workflow-agents:restore-version", { versionId: "version-1", approveRestored: true })).resolves.toBe(workflowDashboard);

    expect(deps.requireProjectRuntimeHostForWorkflowVersion).toHaveBeenCalledWith("version-1");
    expect(deps.restoreWorkflowVersion).toHaveBeenCalledWith(host, { versionId: "version-1", approveRestored: true });
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith("/workspace");
  });

  it("creates and updates revisions through the owning hosts", async () => {
    const { deps, invoke, store } = registerRevisionWithFakes();

    await expect(
      invoke("workflow-agents:create-revision", {
        workflowThreadId: "workflow-thread-1",
        requestedChange: "Make retries clearer.",
        baseVersionId: "version-1",
        status: "proposed",
      }),
    ).resolves.toBe(workflowRevision);

    expect(deps.requireProjectRuntimeHostForWorkflowThread).toHaveBeenCalledWith("workflow-thread-1");
    expect(store.createWorkflowRevision).toHaveBeenCalledWith({
      workflowThreadId: "workflow-thread-1",
      requestedChange: "Make retries clearer.",
      baseVersionId: "version-1",
      status: "proposed",
    });

    await expect(invoke("workflow-agents:update-revision", { id: "revision-1", status: "draft" })).resolves.toBe(workflowRevision);

    expect(deps.requireProjectRuntimeHostForWorkflowRevision).toHaveBeenCalledWith("revision-1");
    expect(store.updateWorkflowRevision).toHaveBeenCalledWith({ id: "revision-1", status: "draft" });
  });

  it("records revision decisions only when the status changes", async () => {
    const changed = registerRevisionWithFakes();

    await expect(changed.invoke("workflow-agents:resolve-revision", { id: "revision-1", decision: "applied" })).resolves.toBe(appliedWorkflowRevision);

    expect(changed.store.getWorkflowRevision).toHaveBeenCalledWith("revision-1");
    expect(changed.store.resolveWorkflowRevision).toHaveBeenCalledWith({ id: "revision-1", decision: "applied" });
    expect(changed.deps.recordWorkflowRevisionDecisionInChat).toHaveBeenCalledWith(appliedWorkflowRevision, "applied", changed.store);

    const unchanged = registerRevisionWithFakes({
      beforeRevision: appliedWorkflowRevision,
      resolvedRevision: appliedWorkflowRevision,
    });

    await expect(unchanged.invoke("workflow-agents:resolve-revision", { id: "revision-1", decision: "applied" })).resolves.toBe(appliedWorkflowRevision);
    expect(unchanged.deps.recordWorkflowRevisionDecisionInChat).not.toHaveBeenCalled();
  });

  it("rejects invalid revision input before resolving hosts", async () => {
    const { deps, invoke, store } = registerRevisionWithFakes();

    await expect(invoke("workflow-agents:list-versions", { workflowThreadId: "" })).rejects.toThrow();

    expect(deps.requireProjectRuntimeHostForWorkflowThread).not.toHaveBeenCalled();
    expect(store.listWorkflowVersions).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowAgentTraceIpc", () => {
  it("registers the workflow-agent trace channels", () => {
    const { handlers } = registerAgentTraceWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowAgentTraceIpcChannels]);
  });

  it("lists graph snapshots through the workflow thread host", async () => {
    const { deps, invoke, store } = registerAgentTraceWithFakes();

    await expect(invoke("workflow-agents:list-graph-snapshots", { workflowThreadId: "workflow-thread-1" })).resolves.toEqual([
      workflowGraphSnapshot,
    ]);

    expect(deps.requireProjectRuntimeHostForWorkflowThread).toHaveBeenCalledWith("workflow-thread-1");
    expect(store.listWorkflowGraphSnapshots).toHaveBeenCalledWith("workflow-thread-1");
  });

  it("lists exploration traces through the workflow thread host", async () => {
    const { deps, invoke, store } = registerAgentTraceWithFakes();

    await expect(invoke("workflow-agents:list-exploration-traces", { workflowThreadId: "workflow-thread-1" })).resolves.toEqual([
      workflowExplorationTrace,
    ]);

    expect(deps.requireProjectRuntimeHostForWorkflowThread).toHaveBeenCalledWith("workflow-thread-1");
    expect(store.listWorkflowExplorationTraces).toHaveBeenCalledWith("workflow-thread-1");
  });

  it("rejects invalid trace input before resolving hosts", async () => {
    const { deps, invoke, store } = registerAgentTraceWithFakes();

    await expect(invoke("workflow-agents:list-graph-snapshots", { workflowThreadId: "" })).rejects.toThrow();

    expect(deps.requireProjectRuntimeHostForWorkflowThread).not.toHaveBeenCalled();
    expect(store.listWorkflowGraphSnapshots).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowAgentCapabilityIpc", () => {
  it("registers the workflow-agent capability channels", () => {
    const { handlers } = registerAgentCapabilityWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowAgentCapabilityIpcChannels]);
  });

  it("searches capabilities with the workflow thread context", async () => {
    const { deps, invoke } = registerAgentCapabilityWithFakes();

    await expect(
      invoke("workflow-agents:search-capabilities", {
        workflowThreadId: "workflow-thread-1",
        query: "gmail",
        limit: 3,
      }),
    ).resolves.toBe(workflowCapabilitySearch);

    expect(deps.workflowAgentIpcContextForWorkflowThread).toHaveBeenCalledWith("workflow-thread-1");
    expect(deps.workflowProjectIpcContext).not.toHaveBeenCalled();
    expect(deps.workflowDiscoveryPolicyContextForCapabilityLookup).toHaveBeenCalledWith(
      { workflowThreadId: "workflow-thread-1", query: "gmail", limit: 3 },
      { kind: "workflow", workflowThreadId: "workflow-thread-1" },
    );
    expect(deps.searchWorkflowDiscoveryCapabilities).toHaveBeenCalledWith({
      query: "gmail",
      context: workflowDiscoveryPolicyContext,
      limit: 3,
    });
  });

  it("describes capabilities with the project context", async () => {
    const { deps, invoke } = registerAgentCapabilityWithFakes();

    await expect(
      invoke("workflow-agents:describe-capability", {
        projectPath: "/workspace",
        capabilityId: "connector:google.gmail",
        query: "gmail",
      }),
    ).resolves.toBe(workflowCapabilityDescription);

    expect(deps.workflowProjectIpcContext).toHaveBeenCalledWith({
      projectPath: "/workspace",
      capabilityId: "connector:google.gmail",
      query: "gmail",
    });
    expect(deps.workflowAgentIpcContextForWorkflowThread).not.toHaveBeenCalled();
    expect(deps.workflowDiscoveryPolicyContextForCapabilityLookup).toHaveBeenCalledWith(
      { projectPath: "/workspace", capabilityId: "connector:google.gmail", query: "gmail" },
      { kind: "project", projectPath: "/workspace" },
    );
    expect(deps.describeWorkflowDiscoveryCapability).toHaveBeenCalledWith({
      capabilityId: "connector:google.gmail",
      query: "gmail",
      context: workflowDiscoveryPolicyContext,
    });
  });

  it("throws when a capability cannot be described", async () => {
    const { invoke } = registerAgentCapabilityWithFakes({ description: undefined });

    await expect(
      invoke("workflow-agents:describe-capability", {
        capabilityId: "missing-capability",
      }),
    ).rejects.toThrow("Workflow capability was not found: missing-capability");
  });

  it("rejects invalid capability input before resolving contexts", async () => {
    const { deps, invoke } = registerAgentCapabilityWithFakes();

    await expect(invoke("workflow-agents:search-capabilities", { query: "" })).rejects.toThrow();

    expect(deps.workflowAgentIpcContextForWorkflowThread).not.toHaveBeenCalled();
    expect(deps.workflowProjectIpcContext).not.toHaveBeenCalled();
    expect(deps.workflowDiscoveryPolicyContextForCapabilityLookup).not.toHaveBeenCalled();
    expect(deps.searchWorkflowDiscoveryCapabilities).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowAgentNativeToolIpc", () => {
  it("registers the workflow-agent native tool channel", () => {
    const { handlers } = registerAgentNativeToolWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowAgentNativeToolIpcChannels]);
  });

  it("invokes native tools through the workflow thread context when arguments include a workflow thread id", async () => {
    const { deps, invoke, workflowContext } = registerAgentNativeToolWithFakes();

    const raw = {
      toolName: "workflow_get_artifact",
      arguments: {
        workflowThreadId: " workflow-thread-1 ",
        artifactId: "artifact-1",
        ignored: true,
      },
    } satisfies InvokeWorkflowNativeToolInput;

    await expect(invoke("workflow-agents:invoke-native-tool", raw)).resolves.toBe(workflowNativeToolResult);

    expect(deps.workflowAgentIpcContextForWorkflowThread).toHaveBeenCalledWith("workflow-thread-1");
    expect(deps.workflowProjectIpcContext).not.toHaveBeenCalled();
    expect(deps.invokeWorkflowNativeTool).toHaveBeenCalledWith(workflowContext, raw);
  });

  it("falls back to the active project context when no workflow thread id is provided", async () => {
    const { deps, invoke, projectContext } = registerAgentNativeToolWithFakes();

    const raw = {
      toolName: "workflow_current_context",
      arguments: {
        projectPath: "/ignored-by-native-tool-ipc",
      },
    } satisfies InvokeWorkflowNativeToolInput;

    await expect(invoke("workflow-agents:invoke-native-tool", raw)).resolves.toBe(workflowNativeToolResult);

    expect(deps.workflowAgentIpcContextForWorkflowThread).not.toHaveBeenCalled();
    expect(deps.workflowProjectIpcContext).toHaveBeenCalledWith({});
    expect(deps.invokeWorkflowNativeTool).toHaveBeenCalledWith(projectContext, raw);
  });

  it("rejects invalid native tool input before resolving context", async () => {
    const { deps, invoke } = registerAgentNativeToolWithFakes();

    await expect(invoke("workflow-agents:invoke-native-tool", { toolName: "workflow_unknown_tool" })).rejects.toThrow();

    expect(deps.workflowAgentIpcContextForWorkflowThread).not.toHaveBeenCalled();
    expect(deps.workflowProjectIpcContext).not.toHaveBeenCalled();
    expect(deps.invokeWorkflowNativeTool).not.toHaveBeenCalled();
  });

  it("propagates native tool invocation failures", async () => {
    const error = new Error("native tool failed");
    const { deps, invoke } = registerAgentNativeToolWithFakes({ error });

    await expect(
      invoke("workflow-agents:invoke-native-tool", {
        toolName: "workflow_get_artifact",
        arguments: { workflowThreadId: "workflow-thread-1" },
      }),
    ).rejects.toThrow(error);

    expect(deps.invokeWorkflowNativeTool).toHaveBeenCalledOnce();
  });
});

describe("registerWorkflowAgentExplorationIpc", () => {
  it("registers the workflow-agent exploration channel", () => {
    const { handlers } = registerAgentExplorationWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowAgentExplorationIpcChannels]);
  });

  it("runs exploration through the workflow thread context and refreshes the returned thread", async () => {
    const refreshedThread = {
      ...workflowAgentThread,
      status: "Explored",
    } satisfies WorkflowAgentThreadSummary;
    const refreshedFolders = [
      {
        ...workflowAgentFolders[0],
        threads: [refreshedThread],
      },
    ] satisfies WorkflowAgentFolderSummary[];
    const { context, deps, invoke, store } = registerAgentExplorationWithFakes({ folders: refreshedFolders });

    await expect(
      invoke("workflow-agents:run-exploration", {
        workflowThreadId: "workflow-thread-1",
        maxModelTurns: 4,
        maxToolCalls: 7,
        maxConnectorCalls: 11,
        maxAmbientCalls: 3,
        maxElapsedMs: 120_000,
        ignored: true,
      }),
    ).resolves.toEqual({
      ...workflowThreadExplorationResult,
      folders: refreshedFolders,
      thread: refreshedThread,
    });

    expect(deps.workflowAgentIpcContextForWorkflowThread).toHaveBeenCalledWith("workflow-thread-1");
    expect(deps.runWorkflowThreadExploration).toHaveBeenCalledWith(context, {
      workflowThreadId: "workflow-thread-1",
      maxModelTurns: 4,
      maxToolCalls: 7,
      maxConnectorCalls: 11,
      maxAmbientCalls: 3,
      maxElapsedMs: 120_000,
    });
    expect(store.listWorkflowAgentFolders).toHaveBeenCalledOnce();
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith("/workspace");
  });

  it("falls back to the exploration result thread when refreshed folders do not include the workflow", async () => {
    const emptyFolders = [
      {
        ...workflowAgentFolders[0],
        threads: [],
      },
    ] satisfies WorkflowAgentFolderSummary[];
    const { invoke } = registerAgentExplorationWithFakes({ folders: emptyFolders });

    await expect(invoke("workflow-agents:run-exploration", { workflowThreadId: "workflow-thread-1" })).resolves.toEqual({
      ...workflowThreadExplorationResult,
      folders: emptyFolders,
      thread: workflowAgentThread,
    });
  });

  it("rejects invalid exploration input before resolving context", async () => {
    const { deps, invoke, store } = registerAgentExplorationWithFakes();

    await expect(invoke("workflow-agents:run-exploration", { workflowThreadId: "", maxModelTurns: 4 })).rejects.toThrow();

    expect(deps.workflowAgentIpcContextForWorkflowThread).not.toHaveBeenCalled();
    expect(deps.runWorkflowThreadExploration).not.toHaveBeenCalled();
    expect(store.listWorkflowAgentFolders).not.toHaveBeenCalled();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });

  it("propagates exploration failures without emitting workflow updates", async () => {
    const error = new Error("exploration failed");
    const { deps, invoke, store } = registerAgentExplorationWithFakes({ error });

    await expect(invoke("workflow-agents:run-exploration", { workflowThreadId: "workflow-thread-1" })).rejects.toThrow(error);

    expect(deps.runWorkflowThreadExploration).toHaveBeenCalledOnce();
    expect(store.listWorkflowAgentFolders).not.toHaveBeenCalled();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowAgentDiscoveryAccessIpc", () => {
  it("registers the workflow-agent discovery access channels", () => {
    const { handlers } = registerAgentDiscoveryAccessWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowAgentDiscoveryAccessIpcChannels]);
  });

  it("resolves access requests through the discovery question context and emits new grants", async () => {
    const { deps, invoke, store } = registerAgentDiscoveryAccessWithFakes();

    await expect(
      invoke("workflow-agents:resolve-discovery-access-request", {
        questionId: "question-1",
        accessRequestId: "access-request-1",
        response: "always_workflow",
      }),
    ).resolves.toBe(workflowDiscoveryResult);

    expect(deps.workflowAgentIpcContextForDiscoveryQuestion).toHaveBeenCalledWith("question-1");
    expect(store.listPermissionGrants).toHaveBeenCalledTimes(2);
    expect(deps.connectorDescriptors).toHaveBeenCalledOnce();
    expect(deps.resolveWorkflowDiscoveryAccessRequest).toHaveBeenCalledWith(
      store,
      {
        questionId: "question-1",
        accessRequestId: "access-request-1",
        response: "always_workflow",
      },
      {
        connectorDescriptors: [],
        permissionMode: "workspace",
        permissionAuditThreadId: "chat-thread-1",
        workspacePath: "/workspace",
      },
    );
    expect(deps.emitPermissionGrantCreated).toHaveBeenCalledWith(workflowDiscoveryPermissionGrant, "/workspace");
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith("/workspace");
  });

  it("falls back to the thread id when the workflow has no chat thread", async () => {
    const { deps, invoke } = registerAgentDiscoveryAccessWithFakes({ workflowThread: {} });

    await expect(
      invoke("workflow-agents:resolve-discovery-access-request", {
        questionId: "question-1",
        accessRequestId: "access-request-1",
        response: "allow_once",
      }),
    ).resolves.toBe(workflowDiscoveryResult);

    expect(deps.resolveWorkflowDiscoveryAccessRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ response: "allow_once" }),
      expect.objectContaining({ permissionAuditThreadId: "thread-1" }),
    );
  });

  it("rejects invalid access input before resolving contexts", async () => {
    const { deps, invoke, store } = registerAgentDiscoveryAccessWithFakes();

    await expect(
      invoke("workflow-agents:resolve-discovery-access-request", {
        questionId: "",
        accessRequestId: "access-request-1",
        response: "always_workflow",
      }),
    ).rejects.toThrow();

    expect(deps.workflowAgentIpcContextForDiscoveryQuestion).not.toHaveBeenCalled();
    expect(store.listPermissionGrants).not.toHaveBeenCalled();
    expect(deps.resolveWorkflowDiscoveryAccessRequest).not.toHaveBeenCalled();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowDashboardIpc", () => {
  it("registers the workflow dashboard channels", () => {
    const { handlers } = registerDashboardWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowDashboardIpcChannels]);
  });

  it("lists the dashboard through the active project host", async () => {
    const { deps, invoke, store } = registerDashboardWithFakes();

    await expect(invoke("workflow:list-dashboard")).resolves.toBe(workflowDashboard);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.readWorkflowDashboard).toHaveBeenCalledWith(store);
  });

  it("reads run detail through the run owner host", async () => {
    const { deps, invoke, store } = registerDashboardWithFakes();

    await expect(invoke("workflow:run-detail", { runId: "run-1" })).resolves.toBe(workflowRunDetail);

    expect(deps.requireProjectRuntimeHostForWorkflowRun).toHaveBeenCalledWith("run-1");
    expect(deps.readWorkflowRunDetail).toHaveBeenCalledWith(store, "run-1");
  });

  it("creates sample artifacts with the store workspace and emits workflow updates", async () => {
    const { deps, host, invoke, store } = registerDashboardWithFakes();

    await expect(invoke("workflow:create-sample")).resolves.toBe(workflowDashboard);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(store.getWorkspace).toHaveBeenCalledOnce();
    expect(deps.createWorkflowSampleArtifact).toHaveBeenCalledWith(store, "/workspace");
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith(host.workspacePath);
  });

  it("rejects invalid run-detail input before resolving hosts", async () => {
    const { deps, invoke } = registerDashboardWithFakes();

    await expect(invoke("workflow:run-detail", { runId: "" })).rejects.toThrow();

    expect(deps.requireProjectRuntimeHostForWorkflowRun).not.toHaveBeenCalled();
    expect(deps.readWorkflowRunDetail).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowCompilePreviewIpc", () => {
  it("registers the workflow compile-preview channels", () => {
    const { handlers } = registerCompilePreviewWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowCompilePreviewIpcChannels]);
  });

  it("compiles previews through context, provider, plugins, and emits workflow updates", async () => {
    const { compileWorkflowArtifact, deps, invoke, store, thread } = registerCompilePreviewWithFakes();
    const input = {
      userRequest: "Build a workflow",
      workflowThreadId: "workflow-thread-1",
      revisionId: "revision-1",
    };

    await expect(invoke("workflow:compile-preview", input)).resolves.toBe(workflowDashboard);

    expect(deps.workflowCompileIpcContext).toHaveBeenCalledWith(input);
    expect(deps.workspaceStateForThread).toHaveBeenCalledWith(thread, store);
    expect(deps.getAmbientProviderStatus).toHaveBeenCalledWith("model-1");
    expect(deps.pluginMcpRegistrationsForThread).toHaveBeenCalledWith(thread, store);
    expect(deps.listPluginRegistry).toHaveBeenCalledWith("/workspace", store);
    expect(deps.workflowToolDescriptorsFromPluginRegistry).toHaveBeenCalledWith(workflowPluginRegistry, workflowPluginRegistrations);
    expect(deps.connectorDescriptors).toHaveBeenCalledOnce();
    expect(deps.readSearchRoutingSettings).toHaveBeenCalledOnce();
    expect(deps.ambientRetryPolicyFromCurrentSettings).toHaveBeenCalledWith(store);
    expect(compileWorkflowArtifact).toHaveBeenCalledOnce();

    const compileInput = compileWorkflowArtifact.mock.calls[0][0];
    expect(compileInput).toEqual(
      expect.objectContaining({
        store,
        userRequest: "Build a workflow",
        workflowThreadId: "workflow-thread-1",
        revisionId: "revision-1",
        workspaceSummary: ["Workspace: Active workspace", "Path: /workspace", "Permission mode: workspace"].join("\n"),
        toolDescriptors: workflowToolDescriptors,
        pluginRegistrations: workflowPluginRegistrations,
        connectorDescriptors: workflowConnectorDescriptors,
        stateRoot: "/state",
        model: "model-1",
        permissionMode: "workspace",
        searchRoutingSettings: workflowSearchRoutingSettings,
        baseUrl: "https://provider.example",
      }),
    );
    expect(compileInput.retryPolicy).toBeUndefined();

    compileInput.onProgress?.(workflowCompileProgress);

    expect(deps.emitWorkflowEvent).toHaveBeenCalledWith(
      { type: "workflow-compile-progress", progress: workflowCompileProgress },
      "/workspace",
    );
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith("/workspace");
  });

  it("rejects invalid compile input before resolving context", async () => {
    const { compileWorkflowArtifact, deps, invoke } = registerCompilePreviewWithFakes();

    await expect(invoke("workflow:compile-preview", { userRequest: "" })).rejects.toThrow();

    expect(deps.workflowCompileIpcContext).not.toHaveBeenCalled();
    expect(deps.workspaceStateForThread).not.toHaveBeenCalled();
    expect(compileWorkflowArtifact).not.toHaveBeenCalled();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowDebugRewriteIpc", () => {
  it("registers the workflow debug-rewrite channels", () => {
    const { handlers } = registerDebugRewriteWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowDebugRewriteIpcChannels]);
  });

  it("routes visual e2e rewrite requests without resolving runtime context", async () => {
    const { compileWorkflowArtifact, deps, invoke } = registerDebugRewriteWithFakes({ e2eEnabled: true });
    const input = {
      runId: "visual-run-1",
      eventId: "event-1",
      userNotes: " Capture visual state ",
    };

    await expect(invoke("workflow:debug-rewrite", input)).resolves.toBe(workflowDashboard);

    expect(deps.emitE2eWorkflowDebugRewriteInput).toHaveBeenCalledWith({
      runId: "visual-run-1",
      eventId: "event-1",
      userNotes: "Capture visual state",
    });
    expect(deps.readE2eWorkflowDashboard).toHaveBeenCalledOnce();
    expect(deps.workflowDebugRewriteIpcContext).not.toHaveBeenCalled();
    expect(compileWorkflowArtifact).not.toHaveBeenCalled();
  });

  it("compiles debug rewrites through context, provider, plugins, and records a revision", async () => {
    const { compileWorkflowArtifact, deps, invoke, store, thread } = registerDebugRewriteWithFakes();
    const input = {
      runId: "run-1",
      eventId: "event-1",
      userNotes: " Fix retry ",
    };

    await expect(invoke("workflow:debug-rewrite", input)).resolves.toBe(workflowDashboard);

    expect(deps.readE2eEnabled).toHaveBeenCalledOnce();
    expect(deps.workflowDebugRewriteIpcContext).toHaveBeenCalledWith({
      runId: "run-1",
      eventId: "event-1",
      userNotes: "Fix retry",
    });
    expect(deps.workflowDebugRewriteUserRequest).toHaveBeenCalledWith(workflowDebugContext);
    expect(deps.workspaceStateForThread).toHaveBeenCalledWith(thread, store);
    expect(deps.getAmbientProviderStatus).toHaveBeenCalledWith("model-1");
    expect(deps.pluginMcpRegistrationsForThread).toHaveBeenCalledWith(thread, store);
    expect(deps.listPluginRegistry).toHaveBeenCalledWith("/workspace", store);
    expect(deps.workflowToolDescriptorsFromPluginRegistry).toHaveBeenCalledWith(workflowPluginRegistry, workflowPluginRegistrations);
    expect(deps.connectorDescriptors).toHaveBeenCalledOnce();
    expect(deps.readSearchRoutingSettings).toHaveBeenCalledOnce();
    expect(deps.ambientRetryPolicyFromCurrentSettings).toHaveBeenCalledWith(store);
    expect(deps.buildWorkflowDebugRewritePromptSection).toHaveBeenCalledWith(workflowDebugContext);
    expect(compileWorkflowArtifact).toHaveBeenCalledOnce();

    const compileInput = compileWorkflowArtifact.mock.calls[0][0];
    expect(compileInput).toEqual(
      expect.objectContaining({
        store,
        userRequest: workflowDebugRequestedChange,
        workflowThreadId: "workflow-thread-1",
        workspaceSummary: [
          "Workspace: Active workspace",
          "Path: /workspace",
          "Permission mode: workspace",
          "Debug rewrite failed run: run-1",
        ].join("\n"),
        toolDescriptors: workflowToolDescriptors,
        pluginRegistrations: workflowPluginRegistrations,
        connectorDescriptors: workflowConnectorDescriptors,
        stateRoot: "/state",
        model: "model-1",
        permissionMode: "workspace",
        searchRoutingSettings: workflowSearchRoutingSettings,
        baseUrl: "https://provider.example",
        debugRewriteContext: workflowDebugPromptSection,
      }),
    );
    expect(compileInput.retryPolicy).toBeUndefined();

    compileInput.onProgress?.(workflowCompileProgress);

    expect(deps.emitWorkflowEvent).toHaveBeenCalledWith(
      { type: "workflow-compile-progress", progress: workflowCompileProgress },
      "/workspace",
    );
    expect(deps.createWorkflowDebugRewriteRevision).toHaveBeenCalledWith(store, workflowDebugContext, {
      baseVersionId: "version-1",
      requestedChange: workflowDebugRequestedChange,
    });
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith("/workspace");
  });

  it("rejects invalid debug input before resolving context", async () => {
    const { compileWorkflowArtifact, deps, invoke } = registerDebugRewriteWithFakes();

    await expect(invoke("workflow:debug-rewrite", { runId: "" })).rejects.toThrow();

    expect(deps.readE2eEnabled).not.toHaveBeenCalled();
    expect(deps.workflowDebugRewriteIpcContext).not.toHaveBeenCalled();
    expect(compileWorkflowArtifact).not.toHaveBeenCalled();
    expect(deps.createWorkflowDebugRewriteRevision).not.toHaveBeenCalled();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowApprovalIpc", () => {
  it("registers the workflow approval channels", () => {
    const { handlers } = registerApprovalWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowApprovalIpcChannels]);
  });

  it("resolves approvals through the run owner host and emits workflow updates", async () => {
    const { deps, host, invoke, store } = registerApprovalWithFakes();

    await expect(
      invoke("workflow:resolve-approval", {
        runId: "run-1",
        approvalId: "approval-1",
        decision: "approved",
      }),
    ).resolves.toBe(workflowRunDetail);

    expect(deps.requireProjectRuntimeHostForWorkflowRun).toHaveBeenCalledWith("run-1");
    expect(deps.resolveWorkflowApproval).toHaveBeenCalledWith(store, {
      runId: "run-1",
      approvalId: "approval-1",
      decision: "approved",
    });
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith(host.workspacePath);
  });

  it("rejects invalid approval input before resolving hosts", async () => {
    const { deps, invoke } = registerApprovalWithFakes();

    await expect(
      invoke("workflow:resolve-approval", {
        runId: "",
        approvalId: "approval-1",
        decision: "approved",
      }),
    ).rejects.toThrow();

    expect(deps.requireProjectRuntimeHostForWorkflowRun).not.toHaveBeenCalled();
    expect(deps.resolveWorkflowApproval).not.toHaveBeenCalled();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowCancelRunIpc", () => {
  it("registers the workflow cancel-run channels", () => {
    const { handlers } = registerCancelRunWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowCancelRunIpcChannels]);
  });

  it("aborts active workflow runs and emits workflow updates", async () => {
    const { controller, deps, host, invoke, store } = registerCancelRunWithFakes();

    await expect(invoke("workflow:cancel-run", { runId: "run-1" })).resolves.toBe(workflowDashboard);

    expect(deps.projectRuntimeHostForWorkflowRun).toHaveBeenCalledWith("run-1");
    expect(deps.activeWorkflowRunHost).not.toHaveBeenCalled();
    expect(deps.activeWorkflowRunController).toHaveBeenCalledWith("run-1");
    expect(controller?.abort).toHaveBeenCalledOnce();
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith(host.workspacePath);
    expect(deps.readWorkflowDashboard).toHaveBeenCalledWith(store);
  });

  it("returns the dashboard without emitting when no active controller is available", async () => {
    const { deps, invoke, store } = registerCancelRunWithFakes({ controller: null });

    await expect(invoke("workflow:cancel-run", { runId: "run-1" })).resolves.toBe(workflowDashboard);

    expect(deps.activeWorkflowRunController).toHaveBeenCalledWith("run-1");
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
    expect(deps.readWorkflowDashboard).toHaveBeenCalledWith(store);
  });

  it("falls back to the active run host when the project run host is unavailable", async () => {
    const { deps, host, invoke } = registerCancelRunWithFakes({ projectHost: null });

    await expect(invoke("workflow:cancel-run", { runId: "run-1" })).resolves.toBe(workflowDashboard);

    expect(deps.projectRuntimeHostForWorkflowRun).toHaveBeenCalledWith("run-1");
    expect(deps.activeWorkflowRunHost).toHaveBeenCalledWith("run-1");
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith(host.workspacePath);
  });

  it("rejects invalid cancel input before resolving hosts", async () => {
    const { deps, invoke } = registerCancelRunWithFakes();

    await expect(invoke("workflow:cancel-run", { runId: "" })).rejects.toThrow();

    expect(deps.projectRuntimeHostForWorkflowRun).not.toHaveBeenCalled();
    expect(deps.activeWorkflowRunHost).not.toHaveBeenCalled();
    expect(deps.activeWorkflowRunController).not.toHaveBeenCalled();
    expect(deps.readWorkflowDashboard).not.toHaveBeenCalled();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowArtifactReviewIpc", () => {
  it("registers the workflow artifact review channels", () => {
    const { handlers } = registerArtifactReviewWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowArtifactReviewIpcChannels]);
  });

  it("reviews artifacts through the artifact owner host and emits workflow updates", async () => {
    const { deps, host, invoke, store } = registerArtifactReviewWithFakes();

    await expect(
      invoke("workflow:review-artifact", {
        artifactId: "artifact-1",
        decision: "approved",
      }),
    ).resolves.toBe(workflowDashboard);

    expect(deps.requireProjectRuntimeHostForWorkflowArtifact).toHaveBeenCalledWith("artifact-1");
    expect(deps.reviewWorkflowArtifact).toHaveBeenCalledWith(store, {
      artifactId: "artifact-1",
      decision: "approved",
    });
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith(host.workspacePath);
  });

  it("rejects invalid review input before resolving hosts", async () => {
    const { deps, invoke } = registerArtifactReviewWithFakes();

    await expect(
      invoke("workflow:review-artifact", {
        artifactId: "",
        decision: "approved",
      }),
    ).rejects.toThrow();

    expect(deps.requireProjectRuntimeHostForWorkflowArtifact).not.toHaveBeenCalled();
    expect(deps.reviewWorkflowArtifact).not.toHaveBeenCalled();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowConnectorGrantIpc", () => {
  it("registers the workflow connector grant channels", () => {
    const { handlers } = registerConnectorGrantWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowConnectorGrantIpcChannels]);
  });

  it("updates connector grants through the artifact owner host and emits workflow updates", async () => {
    const { deps, host, invoke, store } = registerConnectorGrantWithFakes();

    await expect(
      invoke("workflow:update-connector-grant", {
        artifactId: "artifact-1",
        connectorId: "gmail",
        accountId: "account-1",
        dataRetention: "redacted_audit",
      }),
    ).resolves.toBe(workflowDashboard);

    expect(deps.requireProjectRuntimeHostForWorkflowArtifact).toHaveBeenCalledWith("artifact-1");
    expect(deps.updateWorkflowConnectorGrant).toHaveBeenCalledWith(store, {
      artifactId: "artifact-1",
      connectorId: "gmail",
      accountId: "account-1",
      dataRetention: "redacted_audit",
    });
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith(host.workspacePath);
  });

  it("rejects invalid connector grant input before resolving hosts", async () => {
    const { deps, invoke } = registerConnectorGrantWithFakes();

    await expect(
      invoke("workflow:update-connector-grant", {
        artifactId: "artifact-1",
        connectorId: "gmail",
      }),
    ).rejects.toThrow();

    expect(deps.requireProjectRuntimeHostForWorkflowArtifact).not.toHaveBeenCalled();
    expect(deps.updateWorkflowConnectorGrant).not.toHaveBeenCalled();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowArtifactRevalidationIpc", () => {
  it("registers the workflow artifact revalidation channels", () => {
    const { handlers } = registerArtifactRevalidationWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowArtifactRevalidationIpcChannels]);
  });

  it("revalidates artifacts through the artifact owner host and connector descriptors", async () => {
    const { deps, host, invoke, store } = registerArtifactRevalidationWithFakes();

    await expect(invoke("workflow:revalidate-artifact", { artifactId: "artifact-1" })).resolves.toBe(workflowDashboard);

    expect(deps.requireProjectRuntimeHostForWorkflowArtifact).toHaveBeenCalledWith("artifact-1");
    expect(deps.connectorDescriptors).toHaveBeenCalledOnce();
    expect(deps.revalidateWorkflowArtifact).toHaveBeenCalledWith(store, { artifactId: "artifact-1" }, {
      connectorDescriptors: workflowConnectorDescriptors,
    });
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith(host.workspacePath);
  });

  it("rejects invalid revalidation input before resolving hosts", async () => {
    const { deps, invoke } = registerArtifactRevalidationWithFakes();

    await expect(invoke("workflow:revalidate-artifact", { artifactId: "" })).rejects.toThrow();

    expect(deps.requireProjectRuntimeHostForWorkflowArtifact).not.toHaveBeenCalled();
    expect(deps.connectorDescriptors).not.toHaveBeenCalled();
    expect(deps.revalidateWorkflowArtifact).not.toHaveBeenCalled();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowArtifactSourceIpc", () => {
  it("registers the workflow artifact source channels", () => {
    const { handlers } = registerArtifactSourceWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowArtifactSourceIpcChannels]);
  });

  it("updates artifact source through the artifact owner host and connector descriptors", async () => {
    const { deps, host, invoke, store } = registerArtifactSourceWithFakes();

    await expect(
      invoke("workflow:update-artifact-source", {
        artifactId: "artifact-1",
        source: "steps:\n  - inspect workspace",
      }),
    ).resolves.toBe(workflowDashboard);

    expect(deps.requireProjectRuntimeHostForWorkflowArtifact).toHaveBeenCalledWith("artifact-1");
    expect(deps.connectorDescriptors).toHaveBeenCalledOnce();
    expect(deps.updateWorkflowArtifactSource).toHaveBeenCalledWith(
      store,
      {
        artifactId: "artifact-1",
        source: "steps:\n  - inspect workspace",
      },
      {
        connectorDescriptors: workflowConnectorDescriptors,
      },
    );
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith(host.workspacePath);
  });

  it("rejects invalid source input before resolving hosts", async () => {
    const { deps, invoke } = registerArtifactSourceWithFakes();

    await expect(
      invoke("workflow:update-artifact-source", {
        artifactId: "artifact-1",
        source: "",
      }),
    ).rejects.toThrow();

    expect(deps.requireProjectRuntimeHostForWorkflowArtifact).not.toHaveBeenCalled();
    expect(deps.connectorDescriptors).not.toHaveBeenCalled();
    expect(deps.updateWorkflowArtifactSource).not.toHaveBeenCalled();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowRunArtifactIpc", () => {
  it("registers the workflow run-artifact channels", () => {
    const { handlers } = registerRunArtifactWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowRunArtifactIpcChannels]);
  });

  it("runs approved artifacts through plugins, connectors, permissions, and run lifecycle callbacks", async () => {
    const { deps, invoke, runWorkflowArtifact, store, thread } = registerRunArtifactWithFakes();
    const input = {
      artifactId: "artifact-1",
      mode: "execute",
      runtime: "workflow",
      runLimits: { idleTimeoutMs: 1000, maxRunMs: null },
      userInputs: [{ requestId: "input-1", choiceId: "choice-1", text: "Use option one", data: { selected: true } }],
    } satisfies RunWorkflowArtifactInput;

    runWorkflowArtifact.mockImplementationOnce(async (runInput) => {
      await expect(runInput.requestPermission?.(workflowPermissionRequest)).resolves.toBe(true);
      await expect(runInput.ensurePluginTrusted?.(workflowRunPluginRegistration)).resolves.toBe(true);
      runInput.onRunStarted?.("workflow-run-1");
      runInput.onEvent?.();
      return workflowDashboard;
    });

    await expect(invoke("workflow:run-artifact", input)).resolves.toBe(workflowDashboard);

    expect(deps.workflowArtifactIpcContext).toHaveBeenCalledWith("artifact-1");
    expect(deps.getAmbientProviderStatus).toHaveBeenCalledWith("model-1");
    expect(deps.pluginMcpRegistrationsForThread).toHaveBeenCalledWith(thread, store);
    expect(deps.listPluginRegistry).toHaveBeenCalledWith("/workspace", store);
    expect(deps.connectorRegistrations).toHaveBeenCalledOnce();
    expect(deps.connectorAccountAuthorizer).toHaveBeenCalledOnce();
    expect(runWorkflowArtifact).toHaveBeenCalledOnce();

    const runInput = runWorkflowArtifact.mock.calls[0][0];
    expect(runInput).toEqual(
      expect.objectContaining({
        store,
        artifactId: "artifact-1",
        workspacePath: "/workspace",
        permissionMode: "workspace",
        browser: workflowRunBrowser,
        pluginRegistrations: workflowRunPluginRegistrations,
        pluginRegistry: workflowRunPluginRegistry,
        pluginCaller: deps.pluginCaller,
        connectorRegistrations: workflowRunConnectorRegistrations,
        connectorAccountAuthorizer: undefined,
        model: "model-1",
        baseUrl: "https://provider.example",
        mode: "execute",
        runtime: "workflow",
        runLimits: { idleTimeoutMs: 1000, maxRunMs: null },
        userInputs: [{ requestId: "input-1", choiceId: "choice-1", text: "Use option one", data: { selected: true } }],
      }),
    );
    expect(runInput.abortSignal).toBeInstanceOf(AbortSignal);
    expect(deps.requestPermissionWithGrantRegistry).toHaveBeenCalledWith(workflowPermissionRequest, {
      thread,
      permissionMode: "workspace",
      workspacePath: "/workspace",
      workflowThreadId: "workflow-thread-1",
      store,
    });
    expect(deps.ensureWorkflowPluginTrusted).toHaveBeenCalledWith(thread, workflowRunPluginRegistration, store);
    expect(deps.rememberActiveWorkflowRun).toHaveBeenCalledWith("workflow-run-1", expect.any(AbortController), "/workspace");
    expect(deps.emitWorkflowEvent).toHaveBeenCalledWith(
      {
        type: "workflow-run-started",
        runId: "workflow-run-1",
        artifactId: "artifact-1",
        workflowThreadId: "workflow-thread-1",
      },
      "/workspace",
    );
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledTimes(3);
    expect(deps.forgetActiveWorkflowRunsForController).toHaveBeenCalledWith(vi.mocked(deps.rememberActiveWorkflowRun).mock.calls[0][1]);
  });

  it("rejects unapproved execute runs before resolving provider and plugins", async () => {
    const { deps, invoke, runWorkflowArtifact } = registerRunArtifactWithFakes({
      artifact: { ...workflowRunArtifact, status: "ready_for_preview" },
    });

    await expect(invoke("workflow:run-artifact", { artifactId: "artifact-1" })).rejects.toThrow(
      "Approve this workflow preview before running it",
    );

    expect(deps.getAmbientProviderStatus).not.toHaveBeenCalled();
    expect(deps.pluginMcpRegistrationsForThread).not.toHaveBeenCalled();
    expect(runWorkflowArtifact).not.toHaveBeenCalled();
  });

  it("rejects invalid run input before resolving artifact context", async () => {
    const { deps, invoke, runWorkflowArtifact } = registerRunArtifactWithFakes();

    await expect(invoke("workflow:run-artifact", { artifactId: "", runLimits: { idleTimeoutMs: -1 } })).rejects.toThrow();

    expect(deps.workflowArtifactIpcContext).not.toHaveBeenCalled();
    expect(runWorkflowArtifact).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowRecoverRunIpc", () => {
  it("registers the workflow recover-run channels", () => {
    const { handlers } = registerRecoverRunWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowRecoverRunIpcChannels]);
  });

  it("recovers runs through the recovery plan, stale marker, plugins, permissions, and lifecycle callbacks", async () => {
    const { deps, host, invoke, runWorkflowArtifact, store, thread } = registerRecoverRunWithFakes();
    const input = {
      runId: "run-1",
      eventId: "event-1",
      action: "retry_step",
      graphNodeId: "node-1",
    } satisfies RecoverWorkflowRunInput;

    runWorkflowArtifact.mockImplementationOnce(async (runInput) => {
      await expect(runInput.requestPermission?.(workflowPermissionRequest)).resolves.toBe(true);
      await expect(runInput.ensurePluginTrusted?.(workflowRunPluginRegistration)).resolves.toBe(true);
      runInput.onRunStarted?.("workflow-run-1");
      runInput.onEvent?.();
      return workflowDashboard;
    });

    await expect(invoke("workflow:recover-run", input)).resolves.toBe(workflowDashboard);

    expect(deps.requireProjectRuntimeHostForWorkflowRun).toHaveBeenCalledWith("run-1");
    expect(deps.buildWorkflowRecoveryPlan).toHaveBeenCalledWith(store, input);
    expect(deps.workflowArtifactIpcContextForHost).toHaveBeenCalledWith(host, "artifact-1");
    expect(deps.markStaleWorkflowRunForRecoveryIfNeeded).toHaveBeenCalledWith(store, "run-1", {
      recoveryAction: "retry_step",
      sourceEventId: "event-1",
      reason: "Desktop recovery run started.",
    });
    expect(deps.getAmbientProviderStatus).toHaveBeenCalledWith("model-1");
    expect(deps.pluginMcpRegistrationsForThread).toHaveBeenCalledWith(thread, store);
    expect(deps.listPluginRegistry).toHaveBeenCalledWith("/workspace", store);
    expect(deps.connectorRegistrations).toHaveBeenCalledOnce();
    expect(deps.connectorAccountAuthorizer).toHaveBeenCalledOnce();
    expect(runWorkflowArtifact).toHaveBeenCalledOnce();

    const runInput = runWorkflowArtifact.mock.calls[0][0];
    expect(runInput).toEqual(
      expect.objectContaining({
        store,
        artifactId: "artifact-1",
        workspacePath: "/workspace",
        permissionMode: "workspace",
        browser: workflowRunBrowser,
        pluginRegistrations: workflowRunPluginRegistrations,
        pluginRegistry: workflowRunPluginRegistry,
        pluginCaller: deps.pluginCaller,
        connectorRegistrations: workflowRunConnectorRegistrations,
        connectorAccountAuthorizer: undefined,
        model: "model-1",
        baseUrl: "https://provider.example",
        mode: "execute",
        runtime: "automation",
        resumeFromRunId: "run-1",
        recovery: workflowRecoveryPlan.recovery,
      }),
    );
    expect(runInput.abortSignal).toBeInstanceOf(AbortSignal);
    expect(deps.requestPermissionWithGrantRegistry).toHaveBeenCalledWith(workflowPermissionRequest, {
      thread,
      permissionMode: "workspace",
      workspacePath: "/workspace",
      workflowThreadId: "workflow-thread-1",
      store,
    });
    expect(deps.ensureWorkflowPluginTrusted).toHaveBeenCalledWith(thread, workflowRunPluginRegistration, store);
    expect(deps.rememberActiveWorkflowRun).toHaveBeenCalledWith("workflow-run-1", expect.any(AbortController), "/workspace");
    expect(deps.emitWorkflowEvent).toHaveBeenCalledWith(
      {
        type: "workflow-run-started",
        runId: "workflow-run-1",
        artifactId: "artifact-1",
        workflowThreadId: "workflow-thread-1",
      },
      "/workspace",
    );
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledTimes(3);
    expect(deps.forgetActiveWorkflowRunsForController).toHaveBeenCalledWith(vi.mocked(deps.rememberActiveWorkflowRun).mock.calls[0][1]);
  });

  it("rejects unapproved recovery before marking stale or resolving provider and plugins", async () => {
    const { deps, invoke, runWorkflowArtifact } = registerRecoverRunWithFakes({
      artifact: { ...workflowRunArtifact, status: "ready_for_preview" },
    });

    await expect(invoke("workflow:recover-run", { runId: "run-1", eventId: "event-1", action: "retry_step" })).rejects.toThrow(
      "Approve this workflow before recovering it",
    );

    expect(deps.markStaleWorkflowRunForRecoveryIfNeeded).not.toHaveBeenCalled();
    expect(deps.getAmbientProviderStatus).not.toHaveBeenCalled();
    expect(deps.pluginMcpRegistrationsForThread).not.toHaveBeenCalled();
    expect(runWorkflowArtifact).not.toHaveBeenCalled();
  });

  it("rejects invalid recover input before resolving the run host", async () => {
    const { deps, invoke, runWorkflowArtifact } = registerRecoverRunWithFakes();

    await expect(invoke("workflow:recover-run", { runId: "", eventId: "event-1", action: "retry_step" })).rejects.toThrow();

    expect(deps.requireProjectRuntimeHostForWorkflowRun).not.toHaveBeenCalled();
    expect(deps.buildWorkflowRecoveryPlan).not.toHaveBeenCalled();
    expect(runWorkflowArtifact).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowAgentThreadIpc", () => {
  it("registers the workflow-agent thread channels", () => {
    const { handlers } = registerAgentThreadWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowAgentThreadIpcChannels]);
  });

  it("creates workflow-agent folders and returns the global folder list", async () => {
    const { deps, invoke, store } = registerAgentThreadWithFakes();

    await expect(invoke("workflow-agents:create-folder", { name: "Review" })).resolves.toEqual(workflowAgentFolders);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(store.createWorkflowAgentFolder).toHaveBeenCalledWith({ name: "Review" });
    expect(deps.listGlobalWorkflowAgentFolders).toHaveBeenCalledOnce();
  });

  it("moves workflow-agent threads through the owning host", async () => {
    const { deps, invoke, store } = registerAgentThreadWithFakes();

    await expect(invoke("workflow-agents:move-thread", { threadId: "workflow-thread-1", folderId: "folder-2" })).resolves.toEqual(workflowAgentFolders);

    expect(deps.requireProjectRuntimeHostForWorkflowThread).toHaveBeenCalledWith("workflow-thread-1");
    expect(store.moveWorkflowAgentThread).toHaveBeenCalledWith({ threadId: "workflow-thread-1", folderId: "folder-2" });
    expect(deps.listGlobalWorkflowAgentFolders).toHaveBeenCalledOnce();
  });

  it("creates workflow-agent threads using the project IPC context path", async () => {
    const { deps, invoke, store } = registerAgentThreadWithFakes();

    await expect(
      invoke("workflow-agents:create-thread", {
        title: "Weekly summary",
        initialRequest: "Summarize weekly customer notes.",
        projectPath: "/requested-workspace",
        folderId: "folder-1",
        traceMode: "debug",
        phase: "discovery",
      }),
    ).resolves.toEqual(workflowAgentFolders);

    expect(deps.workflowProjectIpcContext).toHaveBeenCalledWith({
      title: "Weekly summary",
      initialRequest: "Summarize weekly customer notes.",
      projectPath: "/requested-workspace",
      folderId: "folder-1",
      traceMode: "debug",
      phase: "discovery",
    });
    expect(store.createWorkflowAgentThread).toHaveBeenCalledWith({
      title: "Weekly summary",
      initialRequest: "Summarize weekly customer notes.",
      projectPath: "/normalized-workspace",
      folderId: "folder-1",
      traceMode: "debug",
      phase: "discovery",
    });
  });

  it("ensures chat threads through the owning workflow host", async () => {
    const { deps, invoke, store } = registerAgentThreadWithFakes();

    await expect(invoke("workflow-agents:ensure-chat-thread", { workflowThreadId: "workflow-thread-1" })).resolves.toBe(workflowAgentThread);

    expect(deps.requireProjectRuntimeHostForWorkflowThread).toHaveBeenCalledWith("workflow-thread-1");
    expect(store.ensureWorkflowAgentChatThread).toHaveBeenCalledWith("workflow-thread-1");
  });

  it("lists chat messages only when the workflow has a chat thread", async () => {
    const withChat = registerAgentThreadWithFakes();

    await expect(withChat.invoke("workflow-agents:list-chat-messages", { workflowThreadId: "workflow-thread-1" })).resolves.toEqual(workflowAgentMessages);
    expect(withChat.store.getWorkflowAgentThreadSummary).toHaveBeenCalledWith("workflow-thread-1");
    expect(withChat.store.getThread).toHaveBeenCalledWith("chat-thread-1");
    expect(withChat.store.listMessages).toHaveBeenCalledWith("chat-thread-1");

    const withoutChat = registerAgentThreadWithFakes({ threadSummary: workflowAgentThreadWithoutChat });

    await expect(withoutChat.invoke("workflow-agents:list-chat-messages", { workflowThreadId: "workflow-thread-no-chat" })).resolves.toEqual([]);
    expect(withoutChat.store.getThread).not.toHaveBeenCalled();
    expect(withoutChat.store.listMessages).not.toHaveBeenCalled();
  });

  it("rejects invalid thread input before resolving hosts", async () => {
    const { deps, invoke, store } = registerAgentThreadWithFakes();

    await expect(invoke("workflow-agents:move-thread", { threadId: "", folderId: "folder-1" })).rejects.toThrow();

    expect(deps.requireProjectRuntimeHostForWorkflowThread).not.toHaveBeenCalled();
    expect(store.moveWorkflowAgentThread).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowAgentDiscoveryStartIpc", () => {
  it("registers the workflow-agent discovery start channel", () => {
    const { handlers } = registerAgentDiscoveryStartWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowAgentDiscoveryStartIpcChannels]);
  });

  it("starts discovery with the project IPC context path", async () => {
    const { context, deps, invoke } = registerAgentDiscoveryStartWithFakes();

    await expect(
      invoke("workflow-agents:start-discovery", {
        title: "Weekly summary",
        initialRequest: "Summarize weekly customer notes.",
        projectPath: "/requested-workspace",
        folderId: "folder-1",
        traceMode: "debug",
        ignored: true,
      }),
    ).resolves.toEqual(workflowDiscoveryResult);

    expect(deps.workflowProjectIpcContext).toHaveBeenCalledWith({
      title: "Weekly summary",
      initialRequest: "Summarize weekly customer notes.",
      projectPath: "/requested-workspace",
      folderId: "folder-1",
      traceMode: "debug",
    });
    expect(deps.startWorkflowDiscovery).toHaveBeenCalledWith(context, {
      title: "Weekly summary",
      initialRequest: "Summarize weekly customer notes.",
      projectPath: "/normalized-workspace",
      folderId: "folder-1",
      traceMode: "debug",
    });
  });

  it("rejects invalid start input before resolving the project context", async () => {
    const { deps, invoke } = registerAgentDiscoveryStartWithFakes();

    await expect(invoke("workflow-agents:start-discovery", { initialRequest: "" })).rejects.toThrow();

    expect(deps.workflowProjectIpcContext).not.toHaveBeenCalled();
    expect(deps.startWorkflowDiscovery).not.toHaveBeenCalled();
  });

  it("propagates discovery start failures", async () => {
    const error = new Error("provider unavailable");
    const { deps, invoke } = registerAgentDiscoveryStartWithFakes({ error });

    await expect(invoke("workflow-agents:start-discovery", { initialRequest: "Draft a workflow." })).rejects.toThrow(error);

    expect(deps.startWorkflowDiscovery).toHaveBeenCalledOnce();
  });
});

describe("registerWorkflowAgentRevisionDiscoveryStartIpc", () => {
  it("registers the workflow-agent revision discovery start channel", () => {
    const { handlers } = registerAgentRevisionDiscoveryStartWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowAgentRevisionDiscoveryStartIpcChannels]);
  });

  it("starts revision discovery through the workflow thread context", async () => {
    const { context, deps, invoke } = registerAgentRevisionDiscoveryStartWithFakes();

    await expect(
      invoke("workflow-agents:start-revision-discovery", {
        workflowThreadId: "workflow-thread-1",
        artifactId: "artifact-1",
        requestedChange: "  Make the report more concise.  ",
        ignored: true,
      }),
    ).resolves.toEqual(workflowDiscoveryResult);

    expect(deps.workflowAgentIpcContextForWorkflowThread).toHaveBeenCalledWith("workflow-thread-1");
    expect(deps.startWorkflowRevisionDiscovery).toHaveBeenCalledWith(context, {
      workflowThreadId: "workflow-thread-1",
      artifactId: "artifact-1",
      requestedChange: "Make the report more concise.",
    });
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith("/normalized-workspace");
  });

  it("rejects invalid revision discovery input before resolving the workflow context", async () => {
    const { deps, invoke } = registerAgentRevisionDiscoveryStartWithFakes();

    await expect(invoke("workflow-agents:start-revision-discovery", { workflowThreadId: "", artifactId: "artifact-1" })).rejects.toThrow();

    expect(deps.workflowAgentIpcContextForWorkflowThread).not.toHaveBeenCalled();
    expect(deps.startWorkflowRevisionDiscovery).not.toHaveBeenCalled();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });

  it("propagates revision discovery start failures without emitting updates", async () => {
    const error = new Error("provider unavailable");
    const { deps, invoke } = registerAgentRevisionDiscoveryStartWithFakes({ error });

    await expect(
      invoke("workflow-agents:start-revision-discovery", {
        workflowThreadId: "workflow-thread-1",
        artifactId: "artifact-1",
      }),
    ).rejects.toThrow(error);

    expect(deps.startWorkflowRevisionDiscovery).toHaveBeenCalledOnce();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowAgentDiscoveryAnswerIpc", () => {
  it("registers the workflow-agent discovery answer channel", () => {
    const { handlers } = registerAgentDiscoveryAnswerWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowAgentDiscoveryAnswerIpcChannels]);
  });

  it("answers discovery questions through the owning question context", async () => {
    const { context, deps, invoke } = registerAgentDiscoveryAnswerWithFakes();

    await expect(
      invoke("workflow-agents:answer-discovery-question", {
        questionId: "question-1",
        choiceId: "choice-1",
        freeform: "Use the compact report path.",
        ignored: true,
      }),
    ).resolves.toEqual(workflowDiscoveryResult);

    expect(deps.workflowAgentIpcContextForDiscoveryQuestion).toHaveBeenCalledWith("question-1");
    expect(deps.answerWorkflowDiscoveryQuestion).toHaveBeenCalledWith(context, {
      questionId: "question-1",
      choiceId: "choice-1",
      freeform: "Use the compact report path.",
    });
  });

  it("rejects invalid answer input before resolving the question context", async () => {
    const { deps, invoke } = registerAgentDiscoveryAnswerWithFakes();

    await expect(invoke("workflow-agents:answer-discovery-question", { questionId: "" })).rejects.toThrow();

    expect(deps.workflowAgentIpcContextForDiscoveryQuestion).not.toHaveBeenCalled();
    expect(deps.answerWorkflowDiscoveryQuestion).not.toHaveBeenCalled();
  });

  it("propagates discovery answer failures", async () => {
    const error = new Error("provider unavailable");
    const { deps, invoke } = registerAgentDiscoveryAnswerWithFakes({ error });

    await expect(
      invoke("workflow-agents:answer-discovery-question", { questionId: "question-1", choiceId: "choice-1" }),
    ).rejects.toThrow(error);

    expect(deps.answerWorkflowDiscoveryQuestion).toHaveBeenCalledOnce();
  });
});

describe("registerWorkflowLabIpc", () => {
  it("registers the workflow lab channels", () => {
    const { handlers } = registerLabWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowLabIpcChannels]);
  });

  it("creates lab runs through the workflow recording host", async () => {
    const { deps, invoke, store } = registerLabWithFakes();

    await expect(
      invoke("workflow-lab:create-run", {
        workflowId: " workflow-1 ",
        goal: " Improve robustness ",
        metricEmphasis: "reliability",
        attemptBudget: 3,
        plateauThreshold: 0.8,
        heldOutEnabled: true,
      }),
    ).resolves.toBe(labRun);

    expect(deps.requireProjectRuntimeHostForWorkflowRecording).toHaveBeenCalledWith("workflow-1");
    expect(store.createWorkflowLabRun).toHaveBeenCalledWith({
      workflowId: "workflow-1",
      goal: "Improve robustness",
      metricEmphasis: "reliability",
      attemptBudget: 3,
      plateauThreshold: 0.8,
      heldOutEnabled: true,
    });
  });

  it("lists workflow-specific lab runs through the owning workflow host", async () => {
    const { deps, invoke, store } = registerLabWithFakes();

    await expect(invoke("workflow-lab:list-runs", { workflowId: " workflow-1 ", limit: 5 })).resolves.toEqual([labRun]);

    expect(deps.requireProjectRuntimeHostForWorkflowRecording).toHaveBeenCalledWith("workflow-1");
    expect(deps.requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(store.listWorkflowLabRuns).toHaveBeenCalledWith({ workflowId: "workflow-1", limit: 5 });
  });

  it("starts lab runs through the injected runner and emits state", async () => {
    const { deps, host, invoke } = registerLabWithFakes();

    await expect(invoke("workflow-lab:start-run", { runId: " lab-run-1 " })).resolves.toBe(runningLabRun);

    expect(deps.requireProjectRuntimeHostForWorkflowLabRun).toHaveBeenCalledWith("lab-run-1");
    expect(deps.startWorkflowLabRun).toHaveBeenCalledWith(host, { runId: "lab-run-1" });
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host, "thread-1");
  });

  it("adopts lab variants and emits workflow library state", async () => {
    const { deps, host, invoke, store } = registerLabWithFakes();

    await expect(invoke("workflow-lab:adopt-variant", { runId: " lab-run-1 ", variantId: " variant-1 " })).resolves.toBe(state);

    expect(deps.requireProjectRuntimeHostForWorkflowLabRun).toHaveBeenCalledWith("lab-run-1");
    expect(store.adoptWorkflowLabVariant).toHaveBeenCalledWith("lab-run-1", "variant-1");
    expect(deps.emitWorkflowRecordingLibraryStateChanged).toHaveBeenCalledWith(host, "thread-1");
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host, "thread-1");
  });

  it("rejects invalid lab run input before resolving hosts", async () => {
    const { deps, invoke, store } = registerLabWithFakes();

    await expect(invoke("workflow-lab:stop-run", { runId: "" })).rejects.toThrow();

    expect(deps.requireProjectRuntimeHostForWorkflowLabRun).not.toHaveBeenCalled();
    expect(store.updateWorkflowLabRunStatus).not.toHaveBeenCalled();
  });
});

function registerWithFakes(options: { createdThread?: FakeThread; subagentsEnabled?: boolean } = {}) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeStore = {
    getWorkspace: vi.fn(() => ({ path: "/workspace" })),
    createWorkflowRecordingThread: vi.fn(() => options.createdThread ?? thread),
    stopWorkflowRecording: vi.fn(),
    updateWorkflowRecordingReviewDraft: vi.fn(),
    confirmWorkflowRecordingReview: vi.fn(),
    applyWorkflowRecordingSummary: vi.fn(),
    describeWorkflowRecording: vi.fn(() => libraryDescription),
    setWorkflowRecordingEnabled: vi.fn(),
    updateWorkflowRecordingPlaybook: vi.fn(),
    saveSymphonyWorkflowRecipe: vi.fn(() => libraryDescription),
    archiveWorkflowRecording: vi.fn(),
    unarchiveWorkflowRecording: vi.fn(),
    restoreWorkflowRecordingVersion: vi.fn(),
  };
  const host: FakeHost = {
    activeThreadId: "thread-1",
    runtime: {
      requestWorkflowRecordingReview: vi.fn(() => Promise.resolve()),
    },
    store,
  };
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    requireProjectRuntimeHostForThreadAction: vi.fn(() => host),
    requireProjectRuntimeHostForWorkflowRecording: vi.fn(() => host),
    prepareWorktreeForThread: vi.fn(() => Promise.resolve(preparedThread)),
    setProjectHostActiveThreadId: vi.fn((targetHost: FakeHost, threadId: string) => {
      targetHost.activeThreadId = threadId;
    }),
    emitProjectStateIfActive: vi.fn(),
    emitWorkflowRecordingLibraryStateChanged: vi.fn(),
    readStateForProjectHostAction: vi.fn(() => state),
    listGlobalWorkflowRecordingLibrary: vi.fn(() => [libraryEntry]),
    getFeatureFlagSnapshot: vi.fn(() =>
      resolveAmbientFeatureFlags({
        settings: { subagents: options.subagentsEnabled ?? true },
        generatedAt: "2026-06-07T18:00:00.000Z",
      })
    ),
  };
  registerWorkflowRecorderIpc(deps);

  return {
    deps,
    handlers,
    host,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerAgentTraceWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowAgentTraceStore = {
    listWorkflowGraphSnapshots: vi.fn(() => [workflowGraphSnapshot]),
    listWorkflowExplorationTraces: vi.fn(() => [workflowExplorationTrace]),
  };
  const host: FakeWorkflowAgentTraceHost = {
    store,
  };
  const deps: RegisterWorkflowAgentTraceIpcDependencies<FakeWorkflowAgentTraceStore, FakeWorkflowAgentTraceHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForWorkflowThread: vi.fn(() => host),
  };
  registerWorkflowAgentTraceIpc(deps);

  return {
    deps,
    handlers,
    host,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerAgentCapabilityWithFakes(options: { description?: WorkflowDiscoveryCapabilityDescription | undefined } = {}) {
  const handlers = new Map<string, IpcListener>();
  const description = "description" in options ? options.description : workflowCapabilityDescription;
  const deps: RegisterWorkflowAgentCapabilityIpcDependencies<FakeWorkflowAgentCapabilityContext> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    workflowAgentIpcContextForWorkflowThread: vi.fn(
      (workflowThreadId: string): FakeWorkflowAgentCapabilityContext => ({ kind: "workflow", workflowThreadId }),
    ),
    workflowProjectIpcContext: vi.fn(
      (input: { projectPath?: string }): FakeWorkflowAgentCapabilityContext => ({ kind: "project", projectPath: input.projectPath }),
    ),
    workflowDiscoveryPolicyContextForCapabilityLookup: vi.fn(() => Promise.resolve(workflowDiscoveryPolicyContext)),
    searchWorkflowDiscoveryCapabilities: vi.fn(() => workflowCapabilitySearch),
    describeWorkflowDiscoveryCapability: vi.fn(() => description),
  };
  registerWorkflowAgentCapabilityIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerAgentNativeToolWithFakes(options: { error?: Error } = {}) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowAgentNativeToolStore = {
    marker: "workflow-agent-native-tool-store",
  };
  const projectContext: FakeWorkflowAgentNativeToolContext = {
    targetStore: store,
    kind: "project",
    projectPath: "/workspace",
  };
  const workflowContext: FakeWorkflowAgentNativeToolContext = {
    targetStore: store,
    kind: "workflow",
    projectPath: "/workspace",
    workflowThreadId: "workflow-thread-1",
  };
  const deps: RegisterWorkflowAgentNativeToolIpcDependencies<
    FakeWorkflowAgentNativeToolStore,
    FakeWorkflowAgentNativeToolContext
  > = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    workflowAgentIpcContextForWorkflowThread: vi.fn(() => workflowContext),
    workflowProjectIpcContext: vi.fn(() => projectContext),
    invokeWorkflowNativeTool: vi.fn(() => {
      if (options.error) throw options.error;
      return workflowNativeToolResult;
    }),
  };
  registerWorkflowAgentNativeToolIpc(deps);

  return {
    deps,
    handlers,
    projectContext,
    workflowContext,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerAgentExplorationWithFakes(
  options: {
    error?: Error;
    folders?: WorkflowAgentFolderSummary[];
  } = {},
) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowAgentExplorationStore = {
    listWorkflowAgentFolders: vi.fn(() => options.folders ?? workflowAgentFolders),
  };
  const context: FakeWorkflowAgentExplorationContext = {
    targetStore: store,
    projectPath: "/workspace",
  };
  const deps: RegisterWorkflowAgentExplorationIpcDependencies<
    FakeWorkflowAgentExplorationStore,
    FakeWorkflowAgentExplorationContext
  > = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    workflowAgentIpcContextForWorkflowThread: vi.fn(() => context),
    runWorkflowThreadExploration: vi.fn((_context, _input) => {
      if (options.error) throw options.error;
      return workflowThreadExplorationResult;
    }),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowAgentExplorationIpc(deps);

  return {
    context,
    deps,
    handlers,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerAgentDiscoveryAccessWithFakes(
  options: {
    grantsAfter?: AmbientPermissionGrant[];
    workflowThread?: FakeWorkflowAgentDiscoveryAccessContext["workflowThread"];
  } = {},
) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowAgentDiscoveryAccessStore = {
    listPermissionGrants: vi.fn<() => AmbientPermissionGrant[]>(),
  };
  store.listPermissionGrants.mockReturnValueOnce([]).mockReturnValue(options.grantsAfter ?? [workflowDiscoveryPermissionGrant]);
  const context: FakeWorkflowAgentDiscoveryAccessContext = {
    targetStore: store,
    thread: {
      id: "thread-1",
      permissionMode: "workspace",
    },
    workflowThread: options.workflowThread ?? {
      chatThreadId: "chat-thread-1",
    },
    projectPath: "/workspace",
  };
  const deps: RegisterWorkflowAgentDiscoveryAccessIpcDependencies<
    FakeWorkflowAgentDiscoveryAccessStore,
    FakeWorkflowAgentDiscoveryAccessContext
  > = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    workflowAgentIpcContextForDiscoveryQuestion: vi.fn(() => context),
    connectorDescriptors: vi.fn(() => []),
    resolveWorkflowDiscoveryAccessRequest: vi.fn(() => Promise.resolve(workflowDiscoveryResult)),
    emitPermissionGrantCreated: vi.fn(),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowAgentDiscoveryAccessIpc(deps);

  return {
    deps,
    handlers,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerDashboardWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowDashboardStore = {
    getWorkspace: vi.fn(() => ({ path: "/workspace" })),
  };
  const host: FakeWorkflowDashboardHost = {
    store,
    workspacePath: "/runtime-workspace",
  };
  const deps: RegisterWorkflowDashboardIpcDependencies<FakeWorkflowDashboardStore, FakeWorkflowDashboardHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    requireProjectRuntimeHostForWorkflowRun: vi.fn(() => host),
    readWorkflowDashboard: vi.fn(() => workflowDashboard),
    readWorkflowRunDetail: vi.fn(() => workflowRunDetail),
    createWorkflowSampleArtifact: vi.fn(() => workflowDashboard),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowDashboardIpc(deps);

  return {
    deps,
    handlers,
    host,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerCompilePreviewWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowCompileStore = {
    getWorkspace: vi.fn(() => ({ statePath: "/state" })),
  };
  const thread: FakeWorkflowCompileThread = {
    model: "model-1",
    permissionMode: "workspace",
  };
  type FakeCompilePreviewDeps = RegisterWorkflowCompilePreviewIpcDependencies<
    FakeWorkflowCompileStore,
    FakeWorkflowCompileThread,
    typeof workflowPluginRegistry,
    typeof workflowPluginRegistrations
  >;
  const compileWorkflowArtifact = vi.fn<FakeCompilePreviewDeps["compileWorkflowArtifact"]>(() => Promise.resolve(workflowDashboard));
  const deps: FakeCompilePreviewDeps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    workflowCompileIpcContext: vi.fn((_input: CompileWorkflowPreviewInput) => ({
      targetStore: store,
      thread,
      projectPath: "/workspace",
    })),
    workspaceStateForThread: vi.fn(() => ({ name: "Active workspace", path: "/workspace" })),
    getAmbientProviderStatus: vi.fn(() => ({ baseUrl: "https://provider.example" })),
    pluginMcpRegistrationsForThread: vi.fn(() => Promise.resolve(workflowPluginRegistrations)),
    listPluginRegistry: vi.fn(() => Promise.resolve(workflowPluginRegistry)),
    workflowToolDescriptorsFromPluginRegistry: vi.fn(() => workflowToolDescriptors),
    connectorDescriptors: vi.fn(() => workflowConnectorDescriptors),
    readSearchRoutingSettings: vi.fn(() => workflowSearchRoutingSettings),
    ambientRetryPolicyFromCurrentSettings: vi.fn(() => undefined),
    compileWorkflowArtifact,
    emitWorkflowEvent: vi.fn((_event: Extract<DesktopEvent, { type: "workflow-compile-progress" }>, _projectPath: string) => undefined),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowCompilePreviewIpc(deps);

  return {
    compileWorkflowArtifact,
    deps,
    handlers,
    store,
    thread,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerDebugRewriteWithFakes(options: { e2eEnabled?: boolean; workflowThread?: FakeWorkflowDebugRewriteWorkflowThread } = {}) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowCompileStore = {
    getWorkspace: vi.fn(() => ({ statePath: "/state" })),
  };
  const thread: FakeWorkflowCompileThread = {
    model: "model-1",
    permissionMode: "workspace",
  };
  type FakeDebugRewriteDeps = RegisterWorkflowDebugRewriteIpcDependencies<
    FakeWorkflowCompileStore,
    FakeWorkflowCompileThread,
    FakeWorkflowDebugRewriteWorkflowThread,
    typeof workflowDebugContext,
    typeof workflowPluginRegistry,
    typeof workflowPluginRegistrations
  >;
  const compileWorkflowArtifact = vi.fn<FakeDebugRewriteDeps["compileWorkflowArtifact"]>(() => Promise.resolve(workflowDashboard));
  const deps: FakeDebugRewriteDeps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    readE2eEnabled: vi.fn(() => options.e2eEnabled ?? false),
    emitE2eWorkflowDebugRewriteInput: vi.fn((_input: CompileWorkflowDebugRewriteInput) => undefined),
    readE2eWorkflowDashboard: vi.fn(() => workflowDashboard),
    workflowDebugRewriteIpcContext: vi.fn((_input: CompileWorkflowDebugRewriteInput) => ({
      targetStore: store,
      thread,
      workflowThread: options.workflowThread ?? workflowDebugWorkflowThread,
      debugContext: workflowDebugContext,
      projectPath: "/workspace",
    })),
    workflowDebugRewriteUserRequest: vi.fn(() => workflowDebugRequestedChange),
    workspaceStateForThread: vi.fn(() => ({ name: "Active workspace", path: "/workspace" })),
    getAmbientProviderStatus: vi.fn(() => ({ baseUrl: "https://provider.example" })),
    pluginMcpRegistrationsForThread: vi.fn(() => Promise.resolve(workflowPluginRegistrations)),
    listPluginRegistry: vi.fn(() => Promise.resolve(workflowPluginRegistry)),
    workflowToolDescriptorsFromPluginRegistry: vi.fn(() => workflowToolDescriptors),
    connectorDescriptors: vi.fn(() => workflowConnectorDescriptors),
    readSearchRoutingSettings: vi.fn(() => workflowSearchRoutingSettings),
    ambientRetryPolicyFromCurrentSettings: vi.fn(() => undefined),
    buildWorkflowDebugRewritePromptSection: vi.fn(() => workflowDebugPromptSection),
    compileWorkflowArtifact,
    createWorkflowDebugRewriteRevision: vi.fn(),
    emitWorkflowEvent: vi.fn((_event: Extract<DesktopEvent, { type: "workflow-compile-progress" }>, _projectPath: string) => undefined),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowDebugRewriteIpc(deps);

  return {
    compileWorkflowArtifact,
    deps,
    handlers,
    store,
    thread,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerApprovalWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowApprovalStore = {
    marker: "workflow-approval-store",
  };
  const host: FakeWorkflowApprovalHost = {
    store,
    workspacePath: "/runtime-workspace",
  };
  const deps: RegisterWorkflowApprovalIpcDependencies<FakeWorkflowApprovalStore, FakeWorkflowApprovalHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForWorkflowRun: vi.fn(() => host),
    resolveWorkflowApproval: vi.fn((_store: FakeWorkflowApprovalStore, _input: ResolveWorkflowApprovalInput) => workflowRunDetail),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowApprovalIpc(deps);

  return {
    deps,
    handlers,
    host,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerCancelRunWithFakes(
  options: {
    projectHost?: FakeWorkflowCancelRunHost | null;
    activeHost?: FakeWorkflowCancelRunHost | null;
    controller?: FakeWorkflowRunAbortController | null;
  } = {},
) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowCancelRunStore = {
    marker: "workflow-cancel-run-store",
  };
  const host: FakeWorkflowCancelRunHost = {
    store,
    workspacePath: "/runtime-workspace",
  };
  const projectHost = options.projectHost === undefined ? host : options.projectHost;
  const activeHost = options.activeHost === undefined ? host : options.activeHost;
  const controller = options.controller === undefined ? { abort: vi.fn() } : options.controller;
  const deps: RegisterWorkflowCancelRunIpcDependencies<FakeWorkflowCancelRunStore, FakeWorkflowCancelRunHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    projectRuntimeHostForWorkflowRun: vi.fn((_runId: string) => projectHost ?? undefined),
    activeWorkflowRunHost: vi.fn((_runId: string) => activeHost ?? undefined),
    activeWorkflowRunController: vi.fn((_runId: string) => controller ?? undefined),
    readWorkflowDashboard: vi.fn((_store: FakeWorkflowCancelRunStore) => workflowDashboard),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowCancelRunIpc(deps);

  return {
    controller,
    deps,
    handlers,
    host,
    store,
    invoke: (channel: string, raw?: CancelWorkflowRunInput | unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerArtifactReviewWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowArtifactReviewStore = {
    marker: "workflow-artifact-review-store",
  };
  const host: FakeWorkflowArtifactReviewHost = {
    store,
    workspacePath: "/runtime-workspace",
  };
  const deps: RegisterWorkflowArtifactReviewIpcDependencies<FakeWorkflowArtifactReviewStore, FakeWorkflowArtifactReviewHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForWorkflowArtifact: vi.fn(() => host),
    reviewWorkflowArtifact: vi.fn((_store: FakeWorkflowArtifactReviewStore, _input: ReviewWorkflowArtifactInput) => workflowDashboard),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowArtifactReviewIpc(deps);

  return {
    deps,
    handlers,
    host,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerConnectorGrantWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowConnectorGrantStore = {
    marker: "workflow-connector-grant-store",
  };
  const host: FakeWorkflowConnectorGrantHost = {
    store,
    workspacePath: "/runtime-workspace",
  };
  const deps: RegisterWorkflowConnectorGrantIpcDependencies<FakeWorkflowConnectorGrantStore, FakeWorkflowConnectorGrantHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForWorkflowArtifact: vi.fn(() => host),
    updateWorkflowConnectorGrant: vi.fn(
      (_store: FakeWorkflowConnectorGrantStore, _input: UpdateWorkflowConnectorGrantInput) => workflowDashboard,
    ),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowConnectorGrantIpc(deps);

  return {
    deps,
    handlers,
    host,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerArtifactRevalidationWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowArtifactRevalidationStore = {
    marker: "workflow-artifact-revalidation-store",
  };
  const host: FakeWorkflowArtifactRevalidationHost = {
    store,
    workspacePath: "/runtime-workspace",
  };
  const deps: RegisterWorkflowArtifactRevalidationIpcDependencies<
    FakeWorkflowArtifactRevalidationStore,
    FakeWorkflowArtifactRevalidationHost
  > = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForWorkflowArtifact: vi.fn(() => host),
    revalidateWorkflowArtifact: vi.fn(
      (
        _store: FakeWorkflowArtifactRevalidationStore,
        _input: RevalidateWorkflowArtifactInput,
        _options: { connectorDescriptors: WorkflowConnectorDescriptor[] },
      ) => workflowDashboard,
    ),
    connectorDescriptors: vi.fn(() => workflowConnectorDescriptors),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowArtifactRevalidationIpc(deps);

  return {
    deps,
    handlers,
    host,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerArtifactSourceWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowArtifactSourceStore = {
    marker: "workflow-artifact-source-store",
  };
  const host: FakeWorkflowArtifactSourceHost = {
    store,
    workspacePath: "/runtime-workspace",
  };
  const deps: RegisterWorkflowArtifactSourceIpcDependencies<FakeWorkflowArtifactSourceStore, FakeWorkflowArtifactSourceHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForWorkflowArtifact: vi.fn(() => host),
    updateWorkflowArtifactSource: vi.fn(
      (
        _store: FakeWorkflowArtifactSourceStore,
        _input: UpdateWorkflowArtifactSourceInput,
        _options: { connectorDescriptors: WorkflowConnectorDescriptor[] },
      ) => workflowDashboard,
    ),
    connectorDescriptors: vi.fn(() => workflowConnectorDescriptors),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowArtifactSourceIpc(deps);

  return {
    deps,
    handlers,
    host,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerRunArtifactWithFakes(options: { artifact?: FakeWorkflowRunArtifactArtifact } = {}) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowCompileStore = {
    getWorkspace: vi.fn(() => ({ statePath: "/state" })),
  };
  const thread: FakeWorkflowCompileThread = {
    model: "model-1",
    permissionMode: "workspace",
  };
  const artifact = options.artifact ?? workflowRunArtifact;
  type FakeRunArtifactDeps = RegisterWorkflowRunArtifactIpcDependencies<
    FakeWorkflowCompileStore,
    FakeWorkflowCompileThread,
    typeof workflowRunBrowser,
    FakeWorkflowRunArtifactArtifact
  >;
  const pluginCaller = vi.fn() as unknown as NonNullable<WorkflowRunArtifactServiceInput["pluginCaller"]>;
  const runWorkflowArtifact = vi.fn<FakeRunArtifactDeps["runWorkflowArtifact"]>(() => Promise.resolve(workflowDashboard));
  const deps: FakeRunArtifactDeps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    workflowArtifactIpcContext: vi.fn((_artifactId: string) => ({
      targetStore: store,
      targetBrowserService: workflowRunBrowser,
      thread,
      artifact,
      projectPath: "/workspace",
    })),
    getAmbientProviderStatus: vi.fn(() => ({ baseUrl: "https://provider.example" })),
    pluginMcpRegistrationsForThread: vi.fn(() => Promise.resolve(workflowRunPluginRegistrations)),
    listPluginRegistry: vi.fn(() => Promise.resolve(workflowRunPluginRegistry)),
    requestPermissionWithGrantRegistry: vi.fn(() => Promise.resolve({ allowed: true })),
    ensureWorkflowPluginTrusted: vi.fn(() => Promise.resolve(true)),
    pluginCaller,
    connectorRegistrations: vi.fn(() => workflowRunConnectorRegistrations),
    connectorAccountAuthorizer: vi.fn(() => undefined),
    runWorkflowArtifact,
    rememberActiveWorkflowRun: vi.fn(),
    forgetActiveWorkflowRunsForController: vi.fn(),
    emitWorkflowEvent: vi.fn(),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowRunArtifactIpc(deps);

  return {
    artifact,
    deps,
    handlers,
    runWorkflowArtifact,
    store,
    thread,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerRecoverRunWithFakes(options: { artifact?: FakeWorkflowRunArtifactArtifact; plan?: WorkflowRecoveryPlan } = {}) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowCompileStore = {
    getWorkspace: vi.fn(() => ({ statePath: "/state" })),
  };
  const host: FakeWorkflowRecoverRunHost = {
    store,
  };
  const thread: FakeWorkflowCompileThread = {
    model: "model-1",
    permissionMode: "workspace",
  };
  const artifact = options.artifact ?? workflowRunArtifact;
  type FakeRecoverRunDeps = RegisterWorkflowRecoverRunIpcDependencies<
    FakeWorkflowCompileStore,
    FakeWorkflowRecoverRunHost,
    FakeWorkflowCompileThread,
    typeof workflowRunBrowser,
    FakeWorkflowRunArtifactArtifact
  >;
  const pluginCaller = vi.fn() as unknown as NonNullable<WorkflowRunArtifactServiceInput["pluginCaller"]>;
  const runWorkflowArtifact = vi.fn<FakeRecoverRunDeps["runWorkflowArtifact"]>(() => Promise.resolve(workflowDashboard));
  const deps: FakeRecoverRunDeps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForWorkflowRun: vi.fn((_runId: string) => host),
    buildWorkflowRecoveryPlan: vi.fn(() => options.plan ?? workflowRecoveryPlan),
    workflowArtifactIpcContextForHost: vi.fn((_host: FakeWorkflowRecoverRunHost, _artifactId: string) => ({
      targetStore: store,
      targetBrowserService: workflowRunBrowser,
      thread,
      artifact,
      projectPath: "/workspace",
    })),
    markStaleWorkflowRunForRecoveryIfNeeded: vi.fn(),
    getAmbientProviderStatus: vi.fn(() => ({ baseUrl: "https://provider.example" })),
    pluginMcpRegistrationsForThread: vi.fn(() => Promise.resolve(workflowRunPluginRegistrations)),
    listPluginRegistry: vi.fn(() => Promise.resolve(workflowRunPluginRegistry)),
    requestPermissionWithGrantRegistry: vi.fn(() => Promise.resolve({ allowed: true })),
    ensureWorkflowPluginTrusted: vi.fn(() => Promise.resolve(true)),
    pluginCaller,
    connectorRegistrations: vi.fn(() => workflowRunConnectorRegistrations),
    connectorAccountAuthorizer: vi.fn(() => undefined),
    runWorkflowArtifact,
    rememberActiveWorkflowRun: vi.fn(),
    forgetActiveWorkflowRunsForController: vi.fn(),
    emitWorkflowEvent: vi.fn(),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowRecoverRunIpc(deps);

  return {
    artifact,
    deps,
    handlers,
    host,
    runWorkflowArtifact,
    store,
    thread,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerRevisionWithFakes(
  options: {
    beforeRevision?: WorkflowRevisionSummary;
    resolvedRevision?: WorkflowRevisionSummary;
  } = {},
) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowAgentRevisionStore = {
    listWorkflowRevisions: vi.fn(() => [workflowRevision]),
    listWorkflowVersions: vi.fn(() => [workflowVersion]),
    createWorkflowRevision: vi.fn(() => workflowRevision),
    getWorkflowRevision: vi.fn(() => options.beforeRevision ?? workflowRevision),
    updateWorkflowRevision: vi.fn(() => workflowRevision),
    resolveWorkflowRevision: vi.fn(() => options.resolvedRevision ?? appliedWorkflowRevision),
  };
  const host: FakeWorkflowAgentRevisionHost = {
    store,
    workspacePath: "/workspace",
  };
  const deps: RegisterWorkflowAgentRevisionIpcDependencies<FakeWorkflowAgentRevisionStore, FakeWorkflowAgentRevisionHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForWorkflowThread: vi.fn(() => host),
    requireProjectRuntimeHostForWorkflowVersion: vi.fn(() => host),
    requireProjectRuntimeHostForWorkflowRevision: vi.fn(() => host),
    restoreWorkflowVersion: vi.fn((_host: FakeWorkflowAgentRevisionHost, _input: RestoreWorkflowVersionInput) => Promise.resolve(workflowDashboard)),
    emitWorkflowUpdated: vi.fn(),
    recordWorkflowRevisionDecisionInChat: vi.fn(),
  };
  registerWorkflowAgentRevisionIpc(deps);

  return {
    deps,
    handlers,
    host,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerAgentThreadWithFakes(options: { threadSummary?: WorkflowAgentThreadSummary } = {}) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowAgentThreadStore = {
    createWorkflowAgentFolder: vi.fn(() => workflowAgentFolders),
    moveWorkflowAgentThread: vi.fn(() => workflowAgentFolders),
    createWorkflowAgentThread: vi.fn(() => workflowAgentFolders),
    ensureWorkflowAgentChatThread: vi.fn(() => workflowAgentThread),
    getWorkflowAgentThreadSummary: vi.fn(() => options.threadSummary ?? workflowAgentThread),
    getThread: vi.fn(() => ({ id: "chat-thread-1" })),
    listMessages: vi.fn(() => workflowAgentMessages),
  };
  const host: FakeWorkflowAgentThreadHost = {
    store,
  };
  const deps: RegisterWorkflowAgentThreadIpcDependencies<FakeWorkflowAgentThreadStore, FakeWorkflowAgentThreadHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    requireProjectRuntimeHostForWorkflowThread: vi.fn(() => host),
    workflowProjectIpcContext: vi.fn(() => ({ targetStore: store, projectPath: "/normalized-workspace" })),
    listGlobalWorkflowAgentFolders: vi.fn(() => workflowAgentFolders),
  };
  registerWorkflowAgentThreadIpc(deps);

  return {
    deps,
    handlers,
    host,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerAgentDiscoveryStartWithFakes(
  options: {
    error?: Error;
    projectPath?: string;
    result?: WorkflowAgentDiscoveryResult;
  } = {},
) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowAgentDiscoveryStartStore = {
    marker: "workflow-agent-discovery-start-store",
  };
  const context: FakeWorkflowAgentDiscoveryStartContext = {
    targetStore: store,
    thread: {
      id: "thread-1",
      permissionMode: "workspace",
    },
    projectPath: options.projectPath ?? "/normalized-workspace",
  };
  const deps: RegisterWorkflowAgentDiscoveryStartIpcDependencies<
    FakeWorkflowAgentDiscoveryStartStore,
    FakeWorkflowAgentDiscoveryStartContext
  > = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    workflowProjectIpcContext: vi.fn(() => context),
    startWorkflowDiscovery: vi.fn(
      (_context: FakeWorkflowAgentDiscoveryStartContext, _input: StartWorkflowDiscoveryInput & { projectPath: string }) => {
        if (options.error) throw options.error;
        return options.result ?? workflowDiscoveryResult;
      },
    ),
  };
  registerWorkflowAgentDiscoveryStartIpc(deps);

  return {
    context,
    deps,
    handlers,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerAgentRevisionDiscoveryStartWithFakes(
  options: {
    error?: Error;
    projectPath?: string;
    result?: WorkflowAgentDiscoveryResult;
  } = {},
) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowAgentRevisionDiscoveryStartStore = {
    marker: "workflow-agent-revision-discovery-start-store",
  };
  const context: FakeWorkflowAgentRevisionDiscoveryStartContext = {
    targetStore: store,
    thread: {
      id: "thread-1",
      permissionMode: "workspace",
    },
    workflowThread: {
      chatThreadId: "chat-thread-1",
    },
    projectPath: options.projectPath ?? "/normalized-workspace",
  };
  const deps: RegisterWorkflowAgentRevisionDiscoveryStartIpcDependencies<
    FakeWorkflowAgentRevisionDiscoveryStartStore,
    FakeWorkflowAgentRevisionDiscoveryStartContext
  > = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    workflowAgentIpcContextForWorkflowThread: vi.fn(() => context),
    startWorkflowRevisionDiscovery: vi.fn(
      (_context: FakeWorkflowAgentRevisionDiscoveryStartContext, _input: StartWorkflowRevisionDiscoveryInput) => {
        if (options.error) throw options.error;
        return options.result ?? workflowDiscoveryResult;
      },
    ),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowAgentRevisionDiscoveryStartIpc(deps);

  return {
    context,
    deps,
    handlers,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerAgentDiscoveryAnswerWithFakes(
  options: {
    error?: Error;
    projectPath?: string;
    result?: WorkflowAgentDiscoveryResult;
  } = {},
) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowAgentDiscoveryAnswerStore = {
    marker: "workflow-agent-discovery-answer-store",
  };
  const context: FakeWorkflowAgentDiscoveryAnswerContext = {
    targetStore: store,
    thread: {
      id: "thread-1",
      permissionMode: "workspace",
    },
    workflowThread: {
      chatThreadId: "chat-thread-1",
    },
    projectPath: options.projectPath ?? "/normalized-workspace",
  };
  const deps: RegisterWorkflowAgentDiscoveryAnswerIpcDependencies<
    FakeWorkflowAgentDiscoveryAnswerStore,
    FakeWorkflowAgentDiscoveryAnswerContext
  > = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    workflowAgentIpcContextForDiscoveryQuestion: vi.fn(() => context),
    answerWorkflowDiscoveryQuestion: vi.fn(
      (_context: FakeWorkflowAgentDiscoveryAnswerContext, _input: AnswerWorkflowDiscoveryQuestionInput) => {
        if (options.error) throw options.error;
        return options.result ?? workflowDiscoveryResult;
      },
    ),
  };
  registerWorkflowAgentDiscoveryAnswerIpc(deps);

  return {
    context,
    deps,
    handlers,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerLabWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowLabStore = {
    createWorkflowLabRun: vi.fn(() => labRun),
    listWorkflowLabRuns: vi.fn(() => [labRun]),
    getWorkflowLabRun: vi.fn(() => labRun),
    updateWorkflowLabRunStatus: vi.fn(() => stoppedLabRun),
    adoptWorkflowLabVariant: vi.fn(() => libraryDescription),
  };
  const host: FakeWorkflowLabHost = {
    activeThreadId: "thread-1",
    store,
  };
  const deps: RegisterWorkflowLabIpcDependencies<FakeWorkflowLabStore, FakeWorkflowLabHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    requireProjectRuntimeHostForWorkflowRecording: vi.fn(() => host),
    requireProjectRuntimeHostForWorkflowLabRun: vi.fn(() => host),
    emitProjectStateIfActive: vi.fn(),
    emitWorkflowRecordingLibraryStateChanged: vi.fn(),
    readStateForProjectHostAction: vi.fn(() => state),
    startWorkflowLabRun: vi.fn(() => Promise.resolve(runningLabRun)),
  };
  registerWorkflowLabIpc(deps);

  return {
    deps,
    handlers,
    host,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}
