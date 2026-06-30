import type { AutomationFolderSummary, AutomationThreadSummary } from "../../shared/automationTypes";
import type { DesktopState } from "../../shared/desktopTypes";
import type { AmbientPermissionGrant, PermissionAuditEntry, PermissionMode } from "../../shared/permissionTypes";
import type { ProjectSummary } from "../../shared/projectBoardTypes";
import type { ThinkingLevel } from "../../shared/threadTypes";
import type {
  WorkflowAgentFolderSummary,
  WorkflowAgentThreadSummary,
  WorkflowCompileProgress,
  WorkflowDiscoveryProgress,
  WorkflowExplorationProgress,
  WorkflowRecordingLibraryEntry,
} from "../../shared/workflowTypes";
import type { AutomationPane } from "./AutomationsWorkspaceShellViews";

export type AutomationsWorkspaceProps = {
  activePane: AutomationPane;
  selectedFolder?: AutomationFolderSummary;
  selectedThread?: AutomationThreadSummary;
  selectedWorkflowAgentFolder?: WorkflowAgentFolderSummary;
  selectedWorkflowAgentThread?: WorkflowAgentThreadSummary;
  selectedWorkflowRecording?: WorkflowRecordingLibraryEntry;
  folders: AutomationFolderSummary[];
  workflowAgentFolders: WorkflowAgentFolderSummary[];
  workflowRecordingLibrary: WorkflowRecordingLibraryEntry[];
  activeProjectName: string;
  activeProjectPath: string;
  activeThreadId?: string;
  projects: ProjectSummary[];
  orchestrationRevision: number;
  orchestrationAutoRevision: number;
  workflowRevision: number;
  workflowCompileProgress: WorkflowCompileProgress[];
  workflowDiscoveryProgress?: WorkflowDiscoveryProgress;
  workflowExplorationProgressByThreadId: Record<string, WorkflowExplorationProgress | undefined>;
  onWorkflowExplorationProgressChanged: (workflowThreadId: string, progress: WorkflowExplorationProgress) => void;
  permissionGrants: AmbientPermissionGrant[];
  permissionAudit: PermissionAuditEntry[];
  permissionMode: PermissionMode;
  model: string;
  thinkingLevel: ThinkingLevel;
  permissionGrantRevoking?: string;
  workspacePath: string;
  onWorkflowCompileProgressReset: () => void;
  onWorkflowRevisionChanged: () => void;
  onFoldersChanged: (folders: AutomationFolderSummary[]) => void;
  onWorkflowAgentFoldersChanged: (folders: WorkflowAgentFolderSummary[]) => void;
  onRevokePermissionGrant: (id: string) => Promise<void>;
  onRevokePermissionGrantIds: (ids: string[], busyId: string) => Promise<void>;
  onCreateProject: () => Promise<DesktopState | undefined>;
  onStartWorkflowRecording: (goal: string) => Promise<boolean>;
  onSetWorkflowRecordingEnabled: (id: string, enabled: boolean) => Promise<void>;
  onEditWorkflowRecordingPlaybook: (playbook: WorkflowRecordingLibraryEntry) => void;
  onArchiveWorkflowRecordingPlaybook: (playbook: WorkflowRecordingLibraryEntry) => Promise<void>;
  onUnarchiveWorkflowRecordingPlaybook: (playbook: WorkflowRecordingLibraryEntry) => Promise<void>;
  onRestoreWorkflowRecordingVersion: (id: string, version: number) => Promise<void>;
  workflowLibraryIncludeArchived: boolean;
  onWorkflowLibraryIncludeArchivedChange: (includeArchived: boolean) => void;
  onRefreshWorkflowRecordingLibrary: () => Promise<void>;
  onDesktopStateChanged: (state: DesktopState) => void;
  onSelectWorkflowRecordingPlaybook: (playbook: WorkflowRecordingLibraryEntry) => void;
  onSelectWorkflowAgentThread: (thread: WorkflowAgentThreadSummary) => void;
  onMoveThread: (threadId: string, folderId: string) => Promise<void>;
  onSelectPane: (pane: AutomationPane) => void;
  onSelectThread: (thread: AutomationThreadSummary) => void;
  onOpenRunThread: (threadId: string, workspacePath?: string) => Promise<void>;
  onPreviewPath: (path: string) => void;
  onPreviewLocalPath: (path: string) => void;
  onOpenMediaModal: (path: string, mediaKind: "image" | "video") => void;
};
