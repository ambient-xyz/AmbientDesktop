import type Database from "better-sqlite3";
import type { ChatMessage, ThreadSummary } from "../../shared/threadTypes";
import type {
  SearchWorkflowRecordingsInput,
  WorkflowRecordingLibraryDescription,
  WorkflowRecordingLibraryEntry,
  WorkflowRecordingPlaybookDraft,
  WorkflowRecordingReviewDraftUpdate,
  WorkflowRecordingSavedPlaybook,
  WorkflowRecordingState,
} from "../../shared/workflowTypes";
import {
  applyWorkflowRecordingSummaryState,
  assertWorkflowRecordingReviewDraftReusable,
  confirmWorkflowRecordingReviewState,
  startWorkflowRecordingState,
  stopWorkflowRecordingState,
  updateWorkflowRecordingReviewDraftState,
  workflowRecordingApplyReviewValidationIssues,
  WorkflowRecordingReviewValidationError,
  workflowRecordingTitle,
} from "../../shared/workflowRecorder";
import {
  workflowRecordingArchiveLifecyclePatch,
  workflowRecordingAssertBaseVersion,
  workflowRecordingApplyLibraryLifecycleUpdate,
  workflowRecordingApplyRestoredPlaybookState,
  workflowRecordingApplySavedPlaybookLifecycle,
  workflowRecordingApplySavedPlaybookReviewState,
  workflowRecordingFindSummaryMessage,
  workflowRecordingLibraryDescription,
  workflowRecordingLibraryIndexPaths,
  workflowRecordingLibraryVersions,
  workflowRecordingListLibraryEntries,
  workflowRecordingNextSavedPlaybook,
  workflowRecordingPreparePlaybookEdit,
  workflowRecordingReadLibraryIndexes,
  workflowRecordingReadRestorableVersionSource,
  workflowRecordingRequireLibraryEntry,
  workflowRecordingRequireLibraryRecord,
  workflowRecordingRequireLibraryVersion,
  workflowRecordingRequireStoppedReviewDraft,
  workflowRecordingSaveConfirmedPlaybook,
  workflowRecordingThreadReference,
  workflowRecordingUnarchiveLifecyclePatch,
  workflowRecordingWriteEditedPlaybookPackageWithIndex,
  workflowRecordingWriteRestoredPlaybookPackageWithIndex,
  type WorkflowRecordingLifecyclePatch,
  type WorkflowRecordingLibraryIndex,
} from "../workflowRecordingLibrary";

export interface ProjectStoreWorkflowRecordingRepositoryDeps {
  workspacePath(): string;
  createThread(title: string, workspacePath: string): ThreadSummary;
  getThread(threadId: string): ThreadSummary;
  listMessages(threadId: string): ChatMessage[];
}

export class ProjectStoreWorkflowRecordingRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreWorkflowRecordingRepositoryDeps,
  ) {}

  createWorkflowRecordingThread(input: { goal?: string; workspacePath?: string } = {}): ThreadSummary {
    const thread = this.deps.createThread(workflowRecordingTitle(input.goal), input.workspacePath ?? this.deps.workspacePath());
    return this.startWorkflowRecording(thread.id, { goal: input.goal });
  }

  startWorkflowRecording(threadId: string, input: { goal?: string } = {}): ThreadSummary {
    this.deps.getThread(threadId);
    const recording = startWorkflowRecordingState(input);
    this.writeThreadRecording(threadId, recording, recording.startedAt);
    return this.deps.getThread(threadId);
  }

  stopWorkflowRecording(threadId: string): WorkflowRecordingState {
    const thread = this.deps.getThread(threadId);
    const messages = this.deps.listMessages(threadId);
    const recording = stopWorkflowRecordingState({
      current: thread.workflowRecording,
      messages,
    });
    this.writeThreadRecording(threadId, recording, recording.stoppedAt ?? new Date().toISOString());
    return recording;
  }

  confirmWorkflowRecordingReview(threadId: string): WorkflowRecordingState {
    const thread = this.deps.getThread(threadId);
    const current = workflowRecordingRequireStoppedReviewDraft(
      thread.workflowRecording,
      "Stop the workflow recording before confirming its playbook review.",
    );
    this.assertWorkflowRecordingDraftReusable(threadId, current, current.review.draft);
    const now = new Date().toISOString();
    const recording = confirmWorkflowRecordingReviewState({ current, now });
    const savedPlaybook = workflowRecordingSaveConfirmedPlaybook({ thread, recording, savedAt: now });
    const savedRecording = workflowRecordingApplySavedPlaybookReviewState(recording, savedPlaybook);
    this.writeThreadRecording(threadId, savedRecording, now);
    return savedRecording;
  }

  updateWorkflowRecordingReviewDraft(
    threadId: string,
    draft: WorkflowRecordingReviewDraftUpdate,
    options: { source?: WorkflowRecordingPlaybookDraft["source"] } = {},
  ): WorkflowRecordingState {
    const thread = this.deps.getThread(threadId);
    const current = workflowRecordingRequireStoppedReviewDraft(
      thread.workflowRecording,
      "Stop the workflow recording before editing its playbook review.",
    );
    const now = new Date().toISOString();
    const recording = updateWorkflowRecordingReviewDraftState({ current, draft, now, source: options.source });
    this.assertWorkflowRecordingDraftReusable(threadId, current, recording.review!.draft);
    this.writeThreadRecording(threadId, recording, now);
    return recording;
  }

  listWorkflowRecordingLibrary(input: SearchWorkflowRecordingsInput = {}): WorkflowRecordingLibraryEntry[] {
    return workflowRecordingListLibraryEntries(this.libraryIndexes(), input);
  }

  describeWorkflowRecording(
    id: string,
    input: Pick<SearchWorkflowRecordingsInput, "includeArchived"> = {},
  ): WorkflowRecordingLibraryDescription {
    const entry = workflowRecordingRequireLibraryEntry(this.libraryIndexes(), id, { includeDisabled: true, ...input });
    return workflowRecordingLibraryDescription(entry);
  }

  setWorkflowRecordingEnabled(id: string, enabled: boolean): WorkflowRecordingLibraryDescription {
    const found = workflowRecordingRequireLibraryRecord(this.libraryIndexes(), id, { includeDisabled: true, includeArchived: true });
    const { record } = found;
    const updatedAt = new Date().toISOString();
    const entry = workflowRecordingApplyLibraryLifecycleUpdate(found, { enabled, updatedAt });
    if (record.threadId) this.updateThreadSavedPlaybookLifecycle(record.threadId, id, { enabled, updatedAt });
    return workflowRecordingLibraryDescription(entry);
  }

  updateWorkflowRecordingPlaybook(
    id: string,
    input: {
      baseVersion: number;
      draft: WorkflowRecordingReviewDraftUpdate;
      title?: string;
    },
  ): WorkflowRecordingLibraryDescription {
    const found = workflowRecordingRequireLibraryRecord(this.libraryIndexes(), id, { includeDisabled: true, includeArchived: true });
    const { indexPath, record } = found;
    workflowRecordingAssertBaseVersion({ record, baseVersion: input.baseVersion, action: "edit" });
    const currentDescription = workflowRecordingLibraryDescription(found.entry);
    const updatedAt = new Date().toISOString();
    const { confirmed, title } = workflowRecordingPreparePlaybookEdit({
      id,
      record,
      currentPlaybook: currentDescription.playbook,
      draft: input.draft,
      updatedAt,
      title: input.title,
    });
    const versions = workflowRecordingLibraryVersions(indexPath, record);
    const savedPlaybook = workflowRecordingNextSavedPlaybook({
      id,
      title,
      savedAt: updatedAt,
      indexPath,
      record,
      versions,
    });
    const thread = workflowRecordingThreadReference(record, title, (threadId) => this.deps.getThread(threadId));
    workflowRecordingWriteEditedPlaybookPackageWithIndex({
      savedPlaybook,
      confirmed,
      sourceTranscriptPath: currentDescription.transcriptPath,
      thread,
    });
    if (record.threadId) this.updateThreadRestoredPlaybook(record.threadId, savedPlaybook, confirmed, updatedAt);
    return this.describeWorkflowRecording(id, { includeArchived: true });
  }

  archiveWorkflowRecording(id: string, input: { baseVersion: number; reason?: string }):
    WorkflowRecordingLibraryDescription {
    const found = workflowRecordingRequireLibraryRecord(this.libraryIndexes(), id, { includeDisabled: true, includeArchived: true });
    const { record } = found;
    workflowRecordingAssertBaseVersion({ record, baseVersion: input.baseVersion, action: "archive" });
    const updatedAt = new Date().toISOString();
    const patch = workflowRecordingArchiveLifecyclePatch(record, { updatedAt, reason: input.reason });
    const entry = workflowRecordingApplyLibraryLifecycleUpdate(found, patch);
    if (record.threadId) this.updateThreadSavedPlaybookLifecycle(record.threadId, id, patch);
    return workflowRecordingLibraryDescription(entry);
  }

  unarchiveWorkflowRecording(id: string, input: { baseVersion: number }): WorkflowRecordingLibraryDescription {
    const found = workflowRecordingRequireLibraryRecord(this.libraryIndexes(), id, { includeDisabled: true, includeArchived: true });
    const { record } = found;
    workflowRecordingAssertBaseVersion({ record, baseVersion: input.baseVersion, action: "unarchive" });
    const updatedAt = new Date().toISOString();
    const patch = workflowRecordingUnarchiveLifecyclePatch(updatedAt);
    const entry = workflowRecordingApplyLibraryLifecycleUpdate(found, patch);
    if (record.threadId) this.updateThreadSavedPlaybookLifecycle(record.threadId, id, patch);
    return workflowRecordingLibraryDescription(entry);
  }

  restoreWorkflowRecordingVersion(id: string, version: number): WorkflowRecordingLibraryDescription {
    const found = workflowRecordingRequireLibraryRecord(this.libraryIndexes(), id, { includeDisabled: true, includeArchived: true });
    const { indexPath, record } = found;
    const versions = workflowRecordingLibraryVersions(indexPath, record);
    const sourceVersion = workflowRecordingRequireLibraryVersion(id, versions, version);
    const source = workflowRecordingReadRestorableVersionSource(id, sourceVersion);
    const restoredAt = new Date().toISOString();
    const title = sourceVersion.title || record.title;
    const savedPlaybook = workflowRecordingNextSavedPlaybook({
      id,
      title,
      savedAt: restoredAt,
      indexPath,
      record,
      versions,
    });
    const thread = workflowRecordingThreadReference(record, title, (threadId) => this.deps.getThread(threadId));
    workflowRecordingWriteRestoredPlaybookPackageWithIndex({
      savedPlaybook,
      playbook: source.playbook,
      sourceSidecarRecord: source.sourceSidecarRecord,
      sourceMarkdown: source.sourceMarkdown,
      transcript: source.transcript,
      thread,
      restoredFromVersion: version,
    });
    if (record.threadId) this.updateThreadRestoredPlaybook(record.threadId, savedPlaybook, source.playbook, restoredAt);
    return this.describeWorkflowRecording(id);
  }

  applyWorkflowRecordingSummary(threadId: string, messageId?: string): WorkflowRecordingState {
    const thread = this.deps.getThread(threadId);
    const current = workflowRecordingRequireStoppedReviewDraft(
      thread.workflowRecording,
      "Stop the workflow recording before applying a Pi summary.",
    );
    const messages = this.deps.listMessages(threadId);
    const summaryMessage = workflowRecordingFindSummaryMessage(messages, messageId);
    if (!summaryMessage) {
      throw new Error("No structured Pi workflow summary was found in this thread.");
    }
    const now = new Date().toISOString();
    const recording = applyWorkflowRecordingSummaryState({
      current,
      markdown: summaryMessage.content,
      now,
    });
    this.assertWorkflowRecordingDraftReusable(threadId, current, recording.review!.draft);
    this.writeThreadRecording(threadId, recording, now);
    return recording;
  }

  libraryIndexes(): WorkflowRecordingLibraryIndex[] {
    return workflowRecordingReadLibraryIndexes(this.libraryIndexPaths());
  }

  libraryIndexPaths(): string[] {
    const workspacePaths: string[] = [this.deps.workspacePath()];
    try {
      const rows = this.db
        .prepare("SELECT DISTINCT workspace_path FROM threads WHERE workspace_path IS NOT NULL AND workspace_path != ''")
        .all() as Array<{ workspace_path?: string }>;
      for (const row of rows) {
        if (typeof row.workspace_path === "string" && row.workspace_path.trim()) workspacePaths.push(row.workspace_path);
      }
    } catch {
      // If the thread table is unavailable, the active workspace catalog remains the fallback.
    }
    try {
      const rows = this.db
        .prepare("SELECT workflow_recording_json FROM threads WHERE workflow_recording_json IS NOT NULL AND workflow_recording_json != ''")
        .all() as Array<{ workflow_recording_json?: string }>;
      return workflowRecordingLibraryIndexPaths({
        workspacePaths,
        workflowRecordingJsonValues: rows.map((row) => row.workflow_recording_json),
      });
    } catch {
      return workflowRecordingLibraryIndexPaths({ workspacePaths });
    }
  }

  updateThreadSavedPlaybookLifecycle(
    threadId: string,
    workflowId: string,
    patch: WorkflowRecordingLifecyclePatch,
  ): void {
    try {
      const thread = this.deps.getThread(threadId);
      const next = workflowRecordingApplySavedPlaybookLifecycle(thread.workflowRecording, workflowId, patch);
      if (!next) return;
      this.writeThreadRecording(threadId, next, patch.updatedAt ?? new Date().toISOString());
    } catch {
      return;
    }
  }

  updateThreadRestoredPlaybook(
    threadId: string,
    savedPlaybook: WorkflowRecordingSavedPlaybook,
    playbook: WorkflowRecordingPlaybookDraft,
    updatedAt: string,
  ): void {
    try {
      const thread = this.deps.getThread(threadId);
      const next = workflowRecordingApplyRestoredPlaybookState(thread.workflowRecording, savedPlaybook, playbook);
      if (!next) return;
      this.writeThreadRecording(threadId, next, updatedAt);
    } catch {
      return;
    }
  }

  private assertWorkflowRecordingDraftReusable(
    threadId: string,
    current: WorkflowRecordingState,
    draft: WorkflowRecordingReviewDraftUpdate | WorkflowRecordingPlaybookDraft,
  ): void {
    try {
      assertWorkflowRecordingReviewDraftReusable({ current, draft });
    } catch (error) {
      if (error instanceof WorkflowRecordingReviewValidationError) {
        this.updateWorkflowRecordingReviewValidationIssues(threadId, current, error.issues);
      }
      throw error;
    }
  }

  private updateWorkflowRecordingReviewValidationIssues(
    threadId: string,
    current: WorkflowRecordingState,
    issues: WorkflowRecordingReviewValidationError["issues"],
  ): void {
    const now = new Date().toISOString();
    const next = workflowRecordingApplyReviewValidationIssues({ current, issues, now });
    if (!next) return;
    this.writeThreadRecording(threadId, next, now);
  }

  private writeThreadRecording(threadId: string, recording: WorkflowRecordingState, updatedAt: string): void {
    this.db
      .prepare("UPDATE threads SET workflow_recording_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(recording), updatedAt, threadId);
  }
}
