import type { IpcMain } from "electron";
import { vi } from "vitest";

import type { AmbientPermissionGrant, PermissionMode } from "../../shared/permissionTypes";
import type { ChatMessage } from "../../shared/threadTypes";
import type {
  CreateWorkflowAgentFolderInput,
  CreateWorkflowAgentThreadInput,
  CreateWorkflowRevisionInput,
  MoveWorkflowAgentThreadInput,
  ResolveWorkflowRevisionInput,
  UpdateWorkflowRevisionInput,
  WorkflowAgentDiscoveryResult,
  WorkflowAgentFolderSummary,
  WorkflowAgentThreadSummary,
  WorkflowDashboard,
  WorkflowDiscoveryCapabilityDescription,
  WorkflowDiscoveryCapabilitySearch,
  WorkflowExplorationTraceSummary,
  WorkflowGraphSnapshot,
  WorkflowNativeToolInvocationResult,
  WorkflowRevisionSummary,
  WorkflowThreadExplorationResult,
  WorkflowVersionSummary,
} from "../../shared/workflowTypes";
import type { WorkflowDiscoveryPolicyContext } from "./ipcWorkflowFacade";

export type IpcListener = Parameters<IpcMain["handle"]>[1];

export interface FakeWorkflowAgentThreadStore {
  createWorkflowAgentFolder: ReturnType<typeof vi.fn<(input: CreateWorkflowAgentFolderInput) => WorkflowAgentFolderSummary[]>>;
  moveWorkflowAgentThread: ReturnType<typeof vi.fn<(input: MoveWorkflowAgentThreadInput) => WorkflowAgentFolderSummary[]>>;
  createWorkflowAgentThread: ReturnType<typeof vi.fn<(input: CreateWorkflowAgentThreadInput) => WorkflowAgentFolderSummary[]>>;
  ensureWorkflowAgentChatThread: ReturnType<typeof vi.fn<(workflowThreadId: string) => WorkflowAgentThreadSummary>>;
  getWorkflowAgentThreadSummary: ReturnType<typeof vi.fn<(workflowThreadId: string) => WorkflowAgentThreadSummary>>;
  getThread: ReturnType<typeof vi.fn<(threadId: string) => unknown>>;
  listMessages: ReturnType<typeof vi.fn<(threadId: string) => ChatMessage[]>>;
}

export interface FakeWorkflowAgentThreadHost {
  store: FakeWorkflowAgentThreadStore;
}

export interface FakeWorkflowAgentDiscoveryStartStore {
  marker: "workflow-agent-discovery-start-store";
}

export interface FakeWorkflowAgentDiscoveryStartContext {
  targetStore: FakeWorkflowAgentDiscoveryStartStore;
  thread: {
    id: string;
    permissionMode: PermissionMode;
  };
  projectPath: string;
}

export interface FakeWorkflowAgentRevisionDiscoveryStartStore {
  marker: "workflow-agent-revision-discovery-start-store";
}

export interface FakeWorkflowAgentRevisionDiscoveryStartContext {
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

export interface FakeWorkflowAgentDiscoveryAnswerStore {
  marker: "workflow-agent-discovery-answer-store";
}

export interface FakeWorkflowAgentDiscoveryAnswerContext {
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

export interface FakeWorkflowAgentTraceStore {
  listWorkflowGraphSnapshots: ReturnType<typeof vi.fn<(workflowThreadId: string) => WorkflowGraphSnapshot[]>>;
  listWorkflowExplorationTraces: ReturnType<typeof vi.fn<(workflowThreadId: string) => WorkflowExplorationTraceSummary[]>>;
}

export interface FakeWorkflowAgentTraceHost {
  store: FakeWorkflowAgentTraceStore;
}

export interface FakeWorkflowAgentCapabilityContext {
  kind: "project" | "workflow";
  projectPath?: string;
  workflowThreadId?: string;
}

export interface FakeWorkflowAgentNativeToolStore {
  marker: "workflow-agent-native-tool-store";
}

export interface FakeWorkflowAgentNativeToolContext {
  targetStore: FakeWorkflowAgentNativeToolStore;
  kind: "project" | "workflow";
  projectPath: string;
  workflowThreadId?: string;
}

export interface FakeWorkflowAgentExplorationStore {
  listWorkflowAgentFolders: ReturnType<typeof vi.fn<() => WorkflowAgentFolderSummary[]>>;
}

export interface FakeWorkflowAgentExplorationContext {
  targetStore: FakeWorkflowAgentExplorationStore;
  projectPath: string;
}

export interface FakeWorkflowAgentDiscoveryAccessStore {
  listPermissionGrants: ReturnType<typeof vi.fn<() => AmbientPermissionGrant[]>>;
}

export interface FakeWorkflowAgentDiscoveryAccessContext {
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

export interface FakeWorkflowAgentRevisionStore {
  listWorkflowRevisions: ReturnType<typeof vi.fn<(workflowThreadId: string) => WorkflowRevisionSummary[]>>;
  listWorkflowVersions: ReturnType<typeof vi.fn<(workflowThreadId: string) => WorkflowVersionSummary[]>>;
  createWorkflowRevision: ReturnType<typeof vi.fn<(input: CreateWorkflowRevisionInput) => WorkflowRevisionSummary>>;
  getWorkflowRevision: ReturnType<typeof vi.fn<(revisionId: string) => WorkflowRevisionSummary>>;
  updateWorkflowRevision: ReturnType<typeof vi.fn<(input: UpdateWorkflowRevisionInput) => WorkflowRevisionSummary>>;
  resolveWorkflowRevision: ReturnType<typeof vi.fn<(input: ResolveWorkflowRevisionInput) => WorkflowRevisionSummary>>;
}

export interface FakeWorkflowAgentRevisionHost {
  store: FakeWorkflowAgentRevisionStore;
  workspacePath: string;
}
export const workflowAgentThread = {
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

export const workflowAgentThreadWithoutChat = {
  ...workflowAgentThread,
  id: "workflow-thread-no-chat",
  chatThreadId: undefined,
} satisfies WorkflowAgentThreadSummary;

export const workflowAgentFolders = [
  {
    id: "folder-1",
    name: "Review",
    kind: "custom",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    threads: [workflowAgentThread],
  },
] satisfies WorkflowAgentFolderSummary[];

export const workflowAgentMessages = [
  {
    id: "message-1",
    threadId: "chat-thread-1",
    role: "user",
    content: "Summarize this week.",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
] satisfies ChatMessage[];

export const workflowGraphSnapshot = {
  id: "graph-snapshot-1",
  workflowThreadId: "workflow-thread-1",
  version: 1,
  source: "exploration",
  nodes: [],
  edges: [],
  summary: "Explored the retry path.",
  createdAt: "2026-01-01T00:00:00.000Z",
} satisfies WorkflowGraphSnapshot;

export const workflowExplorationTrace = {
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

export const workflowDiscoveryPolicyContext = {
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

export const workflowCapabilitySearch = {
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

export const workflowCapabilityDescription = {
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

export const workflowNativeToolResult = {
  toolName: "workflow_get_artifact",
  text: "Workflow artifact details.",
  data: { artifactId: "artifact-1" },
} satisfies WorkflowNativeToolInvocationResult;

export const workflowThreadExplorationResult = {
  folders: workflowAgentFolders,
  thread: workflowAgentThread,
  trace: workflowExplorationTrace,
  graphSnapshot: workflowGraphSnapshot,
} satisfies WorkflowThreadExplorationResult;

export const workflowDiscoveryResult = {
  folders: workflowAgentFolders,
  thread: workflowAgentThread,
} satisfies WorkflowAgentDiscoveryResult;

export const workflowDiscoveryPermissionGrant = {
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

export const workflowVersion = {
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

export const workflowRevision = {
  id: "revision-1",
  workflowThreadId: "workflow-thread-1",
  baseVersionId: "version-1",
  requestedChange: "Make retries clearer.",
  status: "proposed",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} satisfies WorkflowRevisionSummary;

export const appliedWorkflowRevision = {
  ...workflowRevision,
  status: "applied",
} satisfies WorkflowRevisionSummary;
export const workflowDashboard = {
  artifacts: [],
  runs: [],
} satisfies WorkflowDashboard;
