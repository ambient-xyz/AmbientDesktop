import type { MessageRole, ThreadWorktreeSummary } from "./threadTypes";

export interface WorkspaceState {
  path: string;
  name: string;
  statePath: string;
  sessionPath: string;
}

export interface FileTreeEntry {
  path: string;
  name: string;
  type: "file" | "directory";
  depth: number;
  size?: number;
  symlink?: boolean;
  symlinkStatus?: "inside-workspace" | "outside-workspace" | "broken";
  symlinkTargetPath?: string;
  symlinkTargetKind?: "file" | "directory" | "other";
  blockedReason?: string;
}

export interface WorkspaceFileTree {
  rootName: string;
  entries: FileTreeEntry[];
  truncated: boolean;
}

export type WorkspaceFilePreviewKind =
  | "text"
  | "markdown"
  | "code"
  | "html"
  | "image"
  | "audio"
  | "video"
  | "pdf"
  | "office"
  | "binary";

export type OfficeDocumentFormat = "docx" | "pptx" | "xlsx";

export type OfficePreviewFormat = OfficeDocumentFormat | "doc" | "ppt" | "xls";

export type OfficeTextExtractionStatus = "available" | "unsupported" | "failed" | "too-large";

export interface OfficeTextExtraction {
  status: OfficeTextExtractionStatus;
  format?: OfficeDocumentFormat;
  text?: string;
  title?: string;
  unitLabel?: "paragraphs" | "slides" | "sheets";
  unitCount?: number;
  chars?: number;
  truncated?: boolean;
  error?: string;
}

export type PdfTextExtractionStatus = "available" | "unsupported" | "failed" | "too-large" | "no-text";

export interface PdfTextExtraction {
  status: PdfTextExtractionStatus;
  text?: string;
  pages?: number;
  chars?: number;
  truncated?: boolean;
  error?: string;
}

export type OfficePreviewStatus = "available" | "missing-renderer" | "pending" | "failed" | "unsupported";

export interface OfficePreview {
  status: OfficePreviewStatus;
  format?: OfficePreviewFormat;
  pdfUrl?: string;
  pageCount?: number;
  generatedAt?: string;
  renderer?: "libreoffice";
  cacheKey?: string;
  error?: string;
}

export interface WorkspaceFileContent {
  path: string;
  name: string;
  source?: "workspace" | "local";
  absolutePath?: string;
  fileUrl?: string;
  content: string;
  size: number;
  mtimeMs?: number;
  truncated: boolean;
  binary: boolean;
  kind: WorkspaceFilePreviewKind;
  mimeType?: string;
  language?: string;
  dataUrl?: string;
  mediaUrl?: string;
  previewUrl?: string;
  pdfText?: PdfTextExtraction;
  officeText?: OfficeTextExtraction;
  officePreview?: OfficePreview;
}

export interface LocalFileReference {
  displayName: string;
  absolutePath: string;
  fileUrl: string;
  kind?: WorkspaceFilePreviewKind;
  officeFormat?: OfficePreviewFormat;
  size?: number;
  mtimeMs?: number;
}

export interface WorkspaceOpenTarget {
  id: string;
  label: string;
  kind: "editor" | "browser" | "finder" | "terminal" | "default";
  bundleId?: string;
  available: boolean;
}

export interface OpenWorkspacePathInput {
  path: string;
  targetId?: string;
}

export interface OpenLocalPathInput {
  path: string;
  targetId?: string;
}

export interface WorkspaceContextReference {
  path: string;
  name: string;
  kind: "file" | "directory";
  size?: number;
  absolute?: boolean;
}

export interface PickWorkspaceContextInput {
  kind: "file" | "directory";
  allowExternal?: boolean;
}

export type WorkspaceDiffCategory = "added" | "modified" | "deleted" | "renamed" | "untracked";

export interface WorkspaceDiffFile {
  path: string;
  originalPath?: string;
  status: string;
  category: WorkspaceDiffCategory;
}

export interface WorkspaceDiff {
  isGitRepository: boolean;
  status: string[];
  files: WorkspaceDiffFile[];
  diff: string;
  truncated: boolean;
  error?: string;
}

export interface WorkspaceGitStatus {
  isGitRepository: boolean;
  branch: string;
  branches: string[];
  ahead: number;
  behind: number;
  dirtyCount: number;
  counts: Record<WorkspaceDiffCategory, number>;
  error?: string;
}

export interface GitReviewFile {
  path: string;
  originalPath?: string;
  status: string;
  category: WorkspaceDiffCategory | "conflicted";
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  conflicted: boolean;
  additions: number;
  deletions: number;
  diff?: string;
}

export interface GitCheckpointSummary {
  id: string;
  threadId: string;
  workspacePath: string;
  branchName: string;
  kind: "pre-run" | "post-run" | "manual" | "pre-git-action";
  reason: string;
  createdAt: string;
  trackedPatchBytes: number;
  stagedPatchBytes: number;
  untrackedFiles: string[];
}

export interface GitReviewSummary {
  isGitRepository: boolean;
  workspacePath: string;
  projectRoot: string;
  branch: string;
  branches: string[];
  ahead: number;
  behind: number;
  dirtyCount: number;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  conflictedCount: number;
  additions: number;
  deletions: number;
  remote?: string;
  upstream?: string;
  provider?: "github" | "gitlab" | "unknown";
  compareUrl?: string;
  pullRequestUrl?: string;
  files: GitReviewFile[];
  latestCheckpoint?: GitCheckpointSummary;
  worktree?: ThreadWorktreeSummary;
  error?: string;
}

export interface GitCommitInput {
  message: string;
}

export interface GitBranchInput {
  name: string;
  checkout?: boolean;
}

export interface GitFileActionInput {
  path: string;
}

export type GitSimpleAction = "fetch" | "pull" | "push" | "restore-latest-checkpoint";

export type WorkspaceSearchScope = "chat" | "project" | "all-projects";

export interface WorkspaceSearchInput {
  query: string;
  scope?: WorkspaceSearchScope;
  threadId?: string;
  limit?: number;
}

export interface WorkspaceSearchResult {
  id: string;
  kind: "thread" | "message";
  threadId: string;
  workspacePath: string;
  projectName: string;
  title: string;
  excerpt: string;
  createdAt: string;
  role?: MessageRole;
  scope?: WorkspaceSearchScope;
}
