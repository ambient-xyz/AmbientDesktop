import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import type { WorkflowRecordingCapture, WorkflowRecordingPlaybookDraft, WorkflowRecordingSavedPlaybook, WorkflowRecordingState } from "../../shared/workflowTypes";
import {
  WORKFLOW_RECORDING_CALLABLE_INVOCATION_SCHEMA_VERSION,
  WORKFLOW_RECORDING_DIAGNOSTICS_TRACE_SCHEMA_VERSION,
  workflowRecordingArchiveLifecyclePatch,
  workflowRecordingApplyLibraryLifecycleUpdate,
  workflowRecordingApplyRestoredPlaybookState,
  workflowRecordingApplySavedPlaybookLifecycle,
  workflowRecordingApplySavedPlaybookReviewState,
  workflowRecordingAssertBaseVersion,
  workflowRecordingCallableInvocation,
  workflowRecordingCallableInvocationPath,
  workflowRecordingDiagnosticsTracePath,
  workflowRecordingFindLibraryEntry,
  workflowRecordingFindLibraryRecord,
  workflowRecordingFindSummaryMessage,
  workflowRecordingIndexRecordFromEntry,
  workflowRecordingIndexWithEntry,
  workflowRecordingLibraryDescription,
  workflowRecordingLibraryEntry,
  workflowRecordingLibraryIndexPath,
  workflowRecordingLibraryIndexPaths,
  workflowRecordingLibraryVersions,
  workflowRecordingListLibraryEntries,
  workflowRecordingManifest,
  workflowRecordingMarkdown,
  workflowRecordingMarkdownList,
  workflowRecordingNextSavedPlaybook,
  workflowRecordingPlaybookId,
  workflowRecordingPreparePlaybookEdit,
  workflowRecordingReadIndex,
  workflowRecordingReadLibraryIndexes,
  workflowRecordingReadJson,
  workflowRecordingReadRestorableVersionSource,
  workflowRecordingReadText,
  workflowRecordingRequireLibraryEntry,
  workflowRecordingRequireLibraryRecord,
  workflowRecordingRequireLibraryVersion,
  workflowRecordingRequireStoppedReviewDraft,
  workflowRecordingSavedPlaybook,
  workflowRecordingSavedPlaybookForWorkspace,
  workflowRecordingSavedPlaybookVersion,
  workflowRecordingSaveConfirmedPlaybook,
  workflowRecordingSearchScore,
  workflowRecordingSidecar,
  workflowRecordingThreadReference,
  workflowRecordingTranscriptJsonl,
  workflowRecordingUnarchiveLifecyclePatch,
  workflowRecordingWriteEditedPlaybookPackageWithIndex,
  workflowRecordingWriteIndex,
  workflowRecordingWriteIndexRecords,
  workflowRecordingWriteLifecycleJson,
  workflowRecordingWritePlaybookFiles,
  workflowRecordingWritePlaybookPackage,
  workflowRecordingWritePlaybookPackageWithIndex,
  workflowRecordingWriteRestoredPlaybookPackage,
  workflowRecordingWriteRestoredPlaybookPackageWithIndex,
  type WorkflowRecordingIndexRecord,
} from "./workflowRecordingLibrary";

describe("workflow recording library package helpers", () => {
  const thread = {
    id: "thread-1",
    title: "Date night finder",
  };
  const saved: WorkflowRecordingSavedPlaybook = {
    id: "date-night-workflow",
    title: "Date night workflow",
    version: 2,
    enabled: true,
    savedAt: "2026-05-20T17:00:00.000Z",
    updatedAt: "2026-05-20T18:00:00.000Z",
    rootPath: "/tmp/workflows/date-night-workflow",
    manifestPath: "/tmp/workflows/date-night-workflow/ambient-workflow.json",
    markdownPath: "/tmp/workflows/date-night-workflow/workflow.md",
    sidecarPath: "/tmp/workflows/date-night-workflow/workflow.json",
    transcriptPath: "/tmp/workflows/date-night-workflow/transcript.jsonl",
    indexPath: "/tmp/workflows/index.json",
  };
  const confirmed: WorkflowRecordingPlaybookDraft = {
    status: "confirmed",
    source: "deterministic_capture",
    generatedAt: "2026-05-20T16:59:00.000Z",
    confirmedAt: "2026-05-20T17:00:00.000Z",
    sourceCapturedAt: "2026-05-20T16:58:00.000Z",
    intent: "Find current date-night events.",
    inputs: ["City", "- Budget"],
    successfulExamples: [
      {
        toolName: "browser_search",
        inputPreview: "Scottsdale theater events",
        resultPreview: "Found three listing pages.",
        artifactPath: ".ambient/tool-outputs/search.txt",
      },
    ],
    doNot: [
      {
        toolName: "browser_open",
        status: "failed",
        reason: "Venue page returned 403.",
      },
    ],
    validation: ["Return sourced options."],
    outputShape: ["Recommendation list with dates."],
    evidenceSummary: {
      messageCount: 4,
      toolResultCount: 2,
      successfulToolResultCount: 1,
      failedToolResultCount: 1,
      skippedToolResultCount: 0,
      permissionBlockedToolResultCount: 0,
      redactionCount: 0,
    },
  };
  const capture: WorkflowRecordingCapture = {
    capturedAt: "2026-05-20T16:58:00.000Z",
    messageCount: 4,
    userMessageCount: 1,
    assistantMessageCount: 1,
    toolResultCount: 2,
    successfulToolResultCount: 1,
    failedToolResultCount: 1,
    skippedToolResultCount: 0,
    permissionBlockedToolResultCount: 0,
    userCorrectedEventCount: 0,
    redactionCount: 0,
    events: [
      {
        id: "event-user-1",
        messageId: "user-1",
        kind: "user_message",
        status: "succeeded",
        role: "user",
        createdAt: "2026-05-20T16:55:00.000Z",
        preview: "Find Scottsdale theater events.",
      },
      {
        id: "event-tool-1",
        messageId: "tool-1",
        kind: "tool_result",
        status: "succeeded",
        role: "tool",
        createdAt: "2026-05-20T16:56:00.000Z",
        preview: "browser_search completed",
        inputPreview: "Scottsdale theater events",
        resultPreview: "Found three listing pages.",
        toolName: "browser_search",
        toolCallId: "call-1",
        artifactPath: ".ambient/tool-outputs/search.txt",
      },
    ],
  };

  it("builds stable playbook ids from intent slugs and thread hashes", () => {
    expect(workflowRecordingPlaybookId("thread-1", "Find Simple Date Night!")).toBe("find-simple-date-night-4b0a5fefc3");
    expect(workflowRecordingPlaybookId("thread-1", "")).toBe("workflow-recording-4b0a5fefc3");
  });

  it("builds stale-safe thread references for workflow index records", () => {
    expect(
      workflowRecordingThreadReference({ threadId: "thread-1" }, "Fallback title", () => ({
        id: "thread-1",
        title: "Live thread title",
      })),
    ).toEqual({ id: "thread-1", title: "Live thread title" });

    expect(
      workflowRecordingThreadReference({ threadId: "stale-thread" }, "Fallback title", () => {
        throw new Error("Thread not found");
      }),
    ).toEqual({ id: "stale-thread", title: "Fallback title" });

    expect(workflowRecordingThreadReference({}, "Fallback title")).toEqual({ id: "unknown", title: "Fallback title" });
  });

  it("selects workflow recording summary messages", () => {
    const messages = [
      { id: "user-summary", role: "user", content: "## Intent\nWrong role" },
      { id: "assistant-not-summary", role: "assistant", content: "No structured summary here." },
      { id: "assistant-old", role: "assistant", content: "## Intent\nOld summary" },
      { id: "assistant-new", role: "assistant", content: "## Intent\nNew summary" },
    ] as const;

    expect(workflowRecordingFindSummaryMessage(messages, "assistant-old")?.id).toBe("assistant-old");
    expect(workflowRecordingFindSummaryMessage(messages, "user-summary")).toBeUndefined();
    expect(workflowRecordingFindSummaryMessage(messages)?.id).toBe("assistant-new");
    expect(workflowRecordingFindSummaryMessage([{ id: "message-1", role: "assistant", content: "No summary" }])).toBeUndefined();
  });

  it("requires stopped workflow recording review drafts with caller messages", () => {
    const recording = {
      status: "stopped",
      startedAt: "2026-05-20T16:00:00.000Z",
      stoppedAt: "2026-05-20T17:00:00.000Z",
      review: {
        status: "draft",
        draft: confirmed,
      },
    } satisfies WorkflowRecordingState;

    expect(workflowRecordingRequireStoppedReviewDraft(recording, "Need stopped review.")).toBe(recording);
    expect(() => workflowRecordingRequireStoppedReviewDraft(undefined, "Need stopped review.")).toThrow("Need stopped review.");
    expect(() =>
      workflowRecordingRequireStoppedReviewDraft({ ...recording, status: "recording", review: recording.review }, "Need stopped review."),
    ).toThrow("Need stopped review.");
    expect(() => workflowRecordingRequireStoppedReviewDraft({ ...recording, review: undefined }, "Need stopped review.")).toThrow(
      "Need stopped review.",
    );
  });

  it("discovers workflow recording library index paths from workspaces and saved playbooks", () => {
    expect(
      workflowRecordingLibraryIndexPaths({
        workspacePaths: ["/tmp/workspace-a", "/tmp/workspace-b", "/tmp/workspace-a", "", undefined],
        workflowRecordingJsonValues: [
          JSON.stringify({
            review: {
              savedPlaybook: {
                indexPath: "/tmp/shared-workflows/index.json",
              },
            },
          }),
          "not json",
          JSON.stringify({ review: { savedPlaybook: { indexPath: "" } } }),
        ],
      }),
    ).toEqual([
      "/tmp/workspace-a/.ambient/workflows/index.json",
      "/tmp/workspace-b/.ambient/workflows/index.json",
      "/tmp/shared-workflows/index.json",
    ]);
  });

  it("applies saved playbook lifecycle updates to workflow recording state", () => {
    const recording = {
      status: "stopped",
      startedAt: "2026-05-20T16:00:00.000Z",
      stoppedAt: "2026-05-20T17:00:00.000Z",
      review: {
        status: "confirmed",
        draft: confirmed,
        confirmed,
        savedPlaybook: {
          ...saved,
          archivedAt: "2026-05-20T18:00:00.000Z",
          archivedReason: "Old reason.",
        },
      },
    } satisfies WorkflowRecordingState;

    const updated = workflowRecordingApplySavedPlaybookLifecycle(recording, saved.id, {
      enabled: false,
      updatedAt: "2026-05-20T19:00:00.000Z",
      clearArchived: true,
    });

    expect(updated?.review?.savedPlaybook).toMatchObject({
      id: saved.id,
      enabled: false,
      updatedAt: "2026-05-20T19:00:00.000Z",
    });
    expect(updated?.review?.savedPlaybook).not.toHaveProperty("archivedAt");
    expect(updated?.review?.savedPlaybook).not.toHaveProperty("archivedReason");
    expect(workflowRecordingApplySavedPlaybookLifecycle(recording, "missing-workflow", { enabled: false })).toBeUndefined();
    expect(workflowRecordingApplySavedPlaybookLifecycle({ ...recording, review: undefined }, saved.id, { enabled: false })).toBeUndefined();
  });

  it("attaches saved playbooks to workflow recording review state", () => {
    const recording = {
      status: "stopped",
      startedAt: "2026-05-20T16:00:00.000Z",
      stoppedAt: "2026-05-20T17:00:00.000Z",
      review: {
        status: "confirmed",
        draft: confirmed,
        confirmed,
      },
    } satisfies WorkflowRecordingState;

    const updated = workflowRecordingApplySavedPlaybookReviewState(recording, saved);

    expect(updated).not.toBe(recording);
    expect(updated.review).toMatchObject({
      status: "confirmed",
      confirmed,
      savedPlaybook: saved,
    });
    expect(workflowRecordingApplySavedPlaybookReviewState({ ...recording, review: undefined }, saved).review).toBeUndefined();
  });

  it("applies restored playbooks to workflow recording state", () => {
    const recording = {
      status: "stopped",
      startedAt: "2026-05-20T16:00:00.000Z",
      stoppedAt: "2026-05-20T17:00:00.000Z",
      review: {
        status: "draft",
        draft: {
          ...confirmed,
          status: "draft",
        },
      },
    } satisfies WorkflowRecordingState;
    const restored = workflowRecordingApplyRestoredPlaybookState(recording, saved, {
      ...confirmed,
      status: "draft",
      intent: "Restored date-night workflow.",
    });

    expect(restored?.review?.confirmed).toMatchObject({
      intent: "Restored date-night workflow.",
      status: "confirmed",
    });
    expect(restored?.review?.savedPlaybook).toEqual(saved);
    expect(workflowRecordingApplyRestoredPlaybookState({ ...recording, review: undefined }, saved, confirmed)).toBeUndefined();
  });

  it("guards workflow recording base versions with stable retry messages", () => {
    expect(() =>
      workflowRecordingAssertBaseVersion({
        record: { version: 2 },
        baseVersion: 2,
        action: "edit",
      }),
    ).not.toThrow();

    expect(() =>
      workflowRecordingAssertBaseVersion({
        record: { version: 3 },
        baseVersion: 2,
        action: "edit",
      }),
    ).toThrow("Workflow recording version changed: expected v2, current v3. Describe the workflow again and retry the edit.");
    expect(() =>
      workflowRecordingAssertBaseVersion({
        record: { version: 3 },
        baseVersion: 2,
        action: "archive",
      }),
    ).toThrow("Workflow recording version changed: expected v2, current v3. Describe the workflow again and retry archive.");
    expect(() =>
      workflowRecordingAssertBaseVersion({
        record: { version: 3 },
        baseVersion: 2,
        action: "unarchive",
      }),
    ).toThrow("Workflow recording version changed: expected v2, current v3. Describe the workflow again and retry unarchive.");
  });

  it("builds archive lifecycle patches with stable reason fallback", () => {
    const updatedAt = "2026-05-20T20:00:00.000Z";

    expect(
      workflowRecordingArchiveLifecyclePatch(
        {
          archivedAt: "2026-05-20T19:00:00.000Z",
          archivedReason: "Existing reason.",
        },
        { updatedAt, reason: "  New reason.  " },
      ),
    ).toEqual({
      updatedAt,
      archivedAt: "2026-05-20T19:00:00.000Z",
      archivedReason: "New reason.",
    });
    expect(
      workflowRecordingArchiveLifecyclePatch(
        {
          archivedReason: "Existing reason.",
        },
        { updatedAt, reason: "   " },
      ),
    ).toEqual({
      updatedAt,
      archivedAt: updatedAt,
      archivedReason: "Existing reason.",
    });
    expect(workflowRecordingArchiveLifecyclePatch({}, { updatedAt })).toEqual({
      updatedAt,
      archivedAt: updatedAt,
      archivedReason: "Archived by user request.",
    });
    expect(workflowRecordingUnarchiveLifecyclePatch("2026-05-20T21:00:00.000Z")).toEqual({
      updatedAt: "2026-05-20T21:00:00.000Z",
      clearArchived: true,
    });
  });

  it("prepares confirmed playbook edits from library records", () => {
    const updatedAt = "2026-05-20T20:30:00.000Z";
    expect(
      workflowRecordingPreparePlaybookEdit({
        id: saved.id,
        record: {
          title: saved.title,
          savedAt: saved.savedAt,
        },
        currentPlaybook: confirmed,
        draft: {
          intent: "Find reusable date-night options.",
          inputs: ["City", "Budget"],
          successfulExamples: confirmed.successfulExamples,
          doNot: confirmed.doNot,
          validation: ["Return current sourced options."],
          outputShape: ["Recommendation list."],
        },
        updatedAt,
        title: "  Curated date night  ",
      }),
    ).toMatchObject({
      title: "Curated date night",
      confirmed: {
        status: "confirmed",
        source: "user_edit",
        generatedAt: updatedAt,
        confirmedAt: updatedAt,
        intent: "Find reusable date-night options.",
        inputs: ["City", "Budget"],
        validation: ["Return current sourced options."],
      },
    });

    expect(
      workflowRecordingPreparePlaybookEdit({
        id: saved.id,
        record: {
          title: saved.title,
          savedAt: saved.savedAt,
        },
        currentPlaybook: {
          ...confirmed,
          intent: "",
        },
        draft: {
          ...confirmed,
          intent: "",
        },
        updatedAt,
      }).title,
    ).toBe(saved.title);
    expect(() =>
      workflowRecordingPreparePlaybookEdit({
        id: saved.id,
        record: {
          title: saved.title,
          savedAt: saved.savedAt,
        },
        currentPlaybook: undefined,
        draft: confirmed,
        updatedAt,
      }),
    ).toThrow(`Workflow recording has no editable playbook: ${saved.id}`);
  });

  it("materializes saved playbook paths from indexes and workspaces", () => {
    expect(
      workflowRecordingSavedPlaybook({
        id: saved.id,
        title: saved.title,
        version: 3,
        enabled: false,
        savedAt: "2026-05-20T19:00:00.000Z",
        archivedAt: "2026-05-20T20:00:00.000Z",
        archivedReason: "Archived for testing.",
        indexPath: "/tmp/workflows/index.json",
      }),
    ).toEqual({
      id: saved.id,
      title: saved.title,
      version: 3,
      enabled: false,
      savedAt: "2026-05-20T19:00:00.000Z",
      updatedAt: "2026-05-20T19:00:00.000Z",
      archivedAt: "2026-05-20T20:00:00.000Z",
      archivedReason: "Archived for testing.",
      rootPath: "/tmp/workflows/date-night-workflow",
      manifestPath: "/tmp/workflows/date-night-workflow/ambient-workflow.json",
      markdownPath: "/tmp/workflows/date-night-workflow/workflow.md",
      sidecarPath: "/tmp/workflows/date-night-workflow/workflow.json",
      transcriptPath: "/tmp/workflows/date-night-workflow/transcript.jsonl",
      indexPath: "/tmp/workflows/index.json",
    });

    expect(
      workflowRecordingSavedPlaybookForWorkspace({
        workspacePath: "/tmp/workspace",
        id: saved.id,
        title: saved.title,
        version: saved.version,
        enabled: true,
        savedAt: saved.savedAt,
        updatedAt: saved.updatedAt,
      }),
    ).toEqual({
      ...saved,
      rootPath: "/tmp/workspace/.ambient/workflows/date-night-workflow",
      manifestPath: "/tmp/workspace/.ambient/workflows/date-night-workflow/ambient-workflow.json",
      markdownPath: "/tmp/workspace/.ambient/workflows/date-night-workflow/workflow.md",
      sidecarPath: "/tmp/workspace/.ambient/workflows/date-night-workflow/workflow.json",
      transcriptPath: "/tmp/workspace/.ambient/workflows/date-night-workflow/transcript.jsonl",
      indexPath: "/tmp/workspace/.ambient/workflows/index.json",
    });

    expect(
      workflowRecordingNextSavedPlaybook({
        id: saved.id,
        title: "Restored date night",
        savedAt: "2026-05-20T21:00:00.000Z",
        indexPath: "/tmp/workflows/index.json",
        record: {
          id: saved.id,
          title: saved.title,
          version: 3,
          enabled: false,
          savedAt: saved.savedAt,
          archivedAt: "2026-05-20T20:00:00.000Z",
          archivedReason: "Archived for testing.",
          manifestPath: "date-night-workflow/ambient-workflow.json",
          markdownPath: "date-night-workflow/workflow.md",
          sidecarPath: "date-night-workflow/workflow.json",
          transcriptPath: "date-night-workflow/transcript.jsonl",
          versions: [],
        },
        versions: [
          {
            version: 2,
            title: "Older date night",
            savedAt: "2026-05-20T17:00:00.000Z",
            manifestPath: "/tmp/workflows/date-night-workflow/versions/v2/ambient-workflow.json",
            markdownPath: "/tmp/workflows/date-night-workflow/versions/v2/workflow.md",
            sidecarPath: "/tmp/workflows/date-night-workflow/versions/v2/workflow.json",
            transcriptPath: "/tmp/workflows/date-night-workflow/versions/v2/transcript.jsonl",
          },
          {
            version: 4,
            title: "Newest date night",
            savedAt: "2026-05-20T20:00:00.000Z",
            manifestPath: "/tmp/workflows/date-night-workflow/versions/v4/ambient-workflow.json",
            markdownPath: "/tmp/workflows/date-night-workflow/versions/v4/workflow.md",
            sidecarPath: "/tmp/workflows/date-night-workflow/versions/v4/workflow.json",
            transcriptPath: "/tmp/workflows/date-night-workflow/versions/v4/transcript.jsonl",
          },
        ],
      }),
    ).toEqual({
      id: saved.id,
      title: "Restored date night",
      version: 5,
      enabled: false,
      savedAt: "2026-05-20T21:00:00.000Z",
      updatedAt: "2026-05-20T21:00:00.000Z",
      archivedAt: "2026-05-20T20:00:00.000Z",
      archivedReason: "Archived for testing.",
      rootPath: "/tmp/workflows/date-night-workflow",
      manifestPath: "/tmp/workflows/date-night-workflow/ambient-workflow.json",
      markdownPath: "/tmp/workflows/date-night-workflow/workflow.md",
      sidecarPath: "/tmp/workflows/date-night-workflow/workflow.json",
      transcriptPath: "/tmp/workflows/date-night-workflow/transcript.jsonl",
      indexPath: "/tmp/workflows/index.json",
    });
  });

  it("builds package manifests and sidecars from saved playbooks", () => {
    expect(workflowRecordingManifest(saved, thread)).toEqual({
      kind: "ambient-workflow",
      schemaVersion: 1,
      id: "date-night-workflow",
      title: "Date night workflow",
      version: 2,
      enabled: true,
      savedAt: "2026-05-20T17:00:00.000Z",
      updatedAt: "2026-05-20T18:00:00.000Z",
      source: "./workflow.md",
      sidecar: "./workflow.json",
      transcript: "./transcript.jsonl",
      callableWorkflow: {
        defaultInvocation: "compact",
        invocation: "./workflow-invocation.json",
        diagnosticsTrace: "./diagnostics/full-trace.jsonl",
        recorderCompactInvocationByDefault: true,
        fullTraceArtifact: true,
      },
      recorder: {
        threadId: "thread-1",
        threadTitle: "Date night finder",
      },
    });

    expect(workflowRecordingSidecar(saved, confirmed, capture, thread)).toMatchObject({
      kind: "ambient-workflow-sidecar",
      schemaVersion: 1,
      id: "date-night-workflow",
      threadId: "thread-1",
      files: {
        manifest: "ambient-workflow.json",
        markdown: "workflow.md",
        sidecar: "workflow.json",
        transcript: "transcript.jsonl",
        invocation: "workflow-invocation.json",
        diagnosticsTrace: "diagnostics/full-trace.jsonl",
      },
      callableWorkflow: {
        schemaVersion: WORKFLOW_RECORDING_CALLABLE_INVOCATION_SCHEMA_VERSION,
        mode: "compact_callable_invocation",
        source: "workflow_recorder",
        workflowId: "date-night-workflow",
        workflowVersion: 2,
        input: {
          goal: "Find current date-night events.",
          blocking: false,
          input_1: "City",
          input_2: "- Budget",
        },
        playbook: {
          intent: "Find current date-night events.",
          successfulToolNames: ["browser_search"],
        },
        callableWorkflow: {
          recorderCompactInvocationByDefault: true,
          fullTraceArtifact: true,
        },
      },
      playbook: confirmed,
      evidenceSummary: {
        messageCount: 4,
        userMessageCount: 1,
        assistantMessageCount: 1,
        toolResultCount: 2,
        successfulToolResultCount: 1,
        failedToolResultCount: 1,
        redactionCount: 0,
        capturedAt: "2026-05-20T16:58:00.000Z",
      },
    });
  });

  it("renders workflow markdown and lists without changing existing bullet text", () => {
    expect(workflowRecordingMarkdownList(["City", "- Budget"])).toBe("- City\n- Budget");
    expect(workflowRecordingMarkdownList(undefined)).toBe("- None recorded.");

    const markdown = workflowRecordingMarkdown(saved, confirmed, capture, thread);
    expect(markdown).toContain("# Date night workflow");
    expect(markdown).toContain("## Successful tool examples");
    expect(markdown).toContain("`browser_search`: Scottsdale theater events | Found three listing pages. | artifact: .ambient/tool-outputs/search.txt");
    expect(markdown).toContain("- failed `browser_open`: Venue page returned 403.");
    expect(markdown).toContain("- Source thread: Date night finder (thread-1)");
    expect(markdown).toContain("- Captured messages: 4");
    expect(markdown).toContain("- Failed tool results: 1");
    expect(markdown).toContain("## Callable invocation");
    expect(markdown).toContain("- Invocation artifact: workflow-invocation.json.");
  });

  it("builds compact callable invocation metadata from confirmed recording playbooks", () => {
    expect(workflowRecordingCallableInvocation(saved, confirmed, capture, thread)).toMatchObject({
      schemaVersion: WORKFLOW_RECORDING_CALLABLE_INVOCATION_SCHEMA_VERSION,
      mode: "compact_callable_invocation",
      source: "workflow_recorder",
      workflowId: saved.id,
      workflowVersion: saved.version,
      input: {
        goal: confirmed.intent,
        blocking: false,
        input_1: "City",
        input_2: "- Budget",
      },
      inputSchemaHints: {
        required: ["goal"],
        properties: {
          goal: "Concrete goal for this recorded playbook invocation.",
          blocking: "Whether parent final synthesis must wait for this workflow run.",
          input_1: "City",
          input_2: "- Budget",
        },
      },
      playbook: {
        intent: confirmed.intent,
        validation: confirmed.validation,
        outputShape: confirmed.outputShape,
        successfulToolNames: ["browser_search"],
        doNotCount: 1,
      },
      captureSummary: {
        messageCount: 4,
        toolResultCount: 2,
      },
      callableWorkflow: {
        defaultInvocation: "compact",
        recorderCompactInvocationByDefault: true,
        fullTraceArtifact: true,
      },
    });
  });

  it("serializes captured transcript events as jsonl", () => {
    expect(workflowRecordingTranscriptJsonl(undefined)).toBe("");
    expect(workflowRecordingTranscriptJsonl(capture)).toBe(`${capture.events.map((event) => JSON.stringify(event)).join("\n")}\n`);
  });

  it("saves confirmed workflow recording playbooks from recording state", () => {
    withTempWorkspace((workspacePath) => {
      const savedAt = "2026-05-20T17:00:00.000Z";
      const savedPlaybook = workflowRecordingSaveConfirmedPlaybook({
        thread: { ...thread, workspacePath },
        recording: {
          status: "stopped",
          startedAt: "2026-05-20T16:00:00.000Z",
          stoppedAt: savedAt,
          capture,
          review: {
            status: "confirmed",
            draft: confirmed,
            confirmed,
          },
        },
        savedAt,
      });

      expect(savedPlaybook).toMatchObject({
        id: "find-current-date-night-events-4b0a5fefc3",
        title: confirmed.intent,
        version: 1,
        enabled: true,
        savedAt,
        updatedAt: savedAt,
      });
      expect(workflowRecordingReadIndex(savedPlaybook.indexPath).workflows).toMatchObject([
        { id: savedPlaybook.id, version: 1, threadId: thread.id },
      ]);
      expect(readFileSync(savedPlaybook.markdownPath, "utf8")).toContain("# Find current date-night events.");
      expect(readFileSync(savedPlaybook.transcriptPath, "utf8")).toBe(workflowRecordingTranscriptJsonl(capture));
      expect(JSON.parse(readFileSync(workflowRecordingCallableInvocationPath(savedPlaybook), "utf8"))).toMatchObject({
        schemaVersion: WORKFLOW_RECORDING_CALLABLE_INVOCATION_SCHEMA_VERSION,
        workflowId: savedPlaybook.id,
        workflowVersion: 1,
        callableWorkflow: {
          recorderCompactInvocationByDefault: true,
          fullTraceArtifact: true,
        },
      });
      expect(readFileSync(workflowRecordingDiagnosticsTracePath(savedPlaybook), "utf8")).toContain(
        `"schemaVersion":"${WORKFLOW_RECORDING_DIAGNOSTICS_TRACE_SCHEMA_VERSION}"`,
      );

      const next = workflowRecordingSaveConfirmedPlaybook({
        thread: { ...thread, workspacePath },
        recording: {
          status: "stopped",
          startedAt: "2026-05-20T16:00:00.000Z",
          stoppedAt: savedAt,
          review: {
            status: "confirmed",
            draft: confirmed,
            confirmed,
            savedPlaybook,
          },
        },
        savedAt: "2026-05-20T18:00:00.000Z",
      });
      expect(next).toMatchObject({ id: savedPlaybook.id, version: 2 });
      expect(() =>
        workflowRecordingSaveConfirmedPlaybook({
          thread: { ...thread, workspacePath },
          recording: { status: "stopped", startedAt: savedAt },
          savedAt,
        }),
      ).toThrow("Confirm the workflow recording review before saving its playbook files.");
    });
  });

  it("writes playbook package files to current and version paths", () => {
    withTempWorkspace((workspacePath) => {
      const rootPath = join(workspacePath, ".ambient", "workflows", saved.id);
      const savedInWorkspace: WorkflowRecordingSavedPlaybook = {
        ...saved,
        rootPath,
        manifestPath: join(rootPath, "ambient-workflow.json"),
        markdownPath: join(rootPath, "workflow.md"),
        sidecarPath: join(rootPath, "workflow.json"),
        transcriptPath: join(rootPath, "transcript.jsonl"),
        indexPath: join(workspacePath, ".ambient", "workflows", "index.json"),
      };

      workflowRecordingWritePlaybookPackage(savedInWorkspace, confirmed, capture, thread);

      expect(JSON.parse(readFileSync(savedInWorkspace.manifestPath, "utf8"))).toMatchObject({
        kind: "ambient-workflow",
        id: saved.id,
        recorder: {
          threadId: thread.id,
          threadTitle: thread.title,
        },
      });
      expect(readFileSync(savedInWorkspace.markdownPath, "utf8")).toContain("# Date night workflow");
      expect(JSON.parse(readFileSync(savedInWorkspace.sidecarPath, "utf8"))).toMatchObject({
        kind: "ambient-workflow-sidecar",
        playbook: confirmed,
        evidenceSummary: {
          messageCount: 4,
          successfulToolResultCount: 1,
        },
      });
      expect(readFileSync(savedInWorkspace.transcriptPath, "utf8")).toBe(workflowRecordingTranscriptJsonl(capture));
      expect(JSON.parse(readFileSync(workflowRecordingCallableInvocationPath(savedInWorkspace), "utf8"))).toMatchObject({
        schemaVersion: WORKFLOW_RECORDING_CALLABLE_INVOCATION_SCHEMA_VERSION,
        workflowId: saved.id,
        workflowVersion: saved.version,
        callableWorkflow: {
          recorderCompactInvocationByDefault: true,
          fullTraceArtifact: true,
        },
      });
      expect(readFileSync(workflowRecordingDiagnosticsTracePath(savedInWorkspace), "utf8")).toContain(
        `"schemaVersion":"${WORKFLOW_RECORDING_DIAGNOSTICS_TRACE_SCHEMA_VERSION}"`,
      );
      expect(readFileSync(workflowRecordingDiagnosticsTracePath(savedInWorkspace), "utf8")).toContain("\"toolName\":\"browser_search\"");

      const version = workflowRecordingSavedPlaybookVersion(savedInWorkspace);
      expect(readFileSync(version.markdownPath, "utf8")).toBe(readFileSync(savedInWorkspace.markdownPath, "utf8"));
      expect(readFileSync(version.transcriptPath, "utf8")).toBe(workflowRecordingTranscriptJsonl(capture));
      expect(JSON.parse(readFileSync(workflowRecordingCallableInvocationPath(version), "utf8"))).toMatchObject({
        workflowId: saved.id,
        workflowVersion: saved.version,
      });

      const indexedRootPath = join(workspacePath, ".ambient", "workflows", "indexed-date-night-workflow");
      const indexedSaved: WorkflowRecordingSavedPlaybook = {
        ...savedInWorkspace,
        id: "indexed-date-night-workflow",
        title: "Indexed date night workflow",
        version: 1,
        rootPath: indexedRootPath,
        manifestPath: join(indexedRootPath, "ambient-workflow.json"),
        markdownPath: join(indexedRootPath, "workflow.md"),
        sidecarPath: join(indexedRootPath, "workflow.json"),
        transcriptPath: join(indexedRootPath, "transcript.jsonl"),
      };
      workflowRecordingWritePlaybookPackageWithIndex({
        savedPlaybook: indexedSaved,
        confirmed,
        capture,
        thread,
      });
      expect(workflowRecordingReadIndex(indexedSaved.indexPath).workflows).toMatchObject([
        {
          id: indexedSaved.id,
          title: indexedSaved.title,
          version: 1,
          enabled: true,
          manifestPath: "indexed-date-night-workflow/ambient-workflow.json",
          sidecarPath: "indexed-date-night-workflow/workflow.json",
        },
      ]);

      const editedRootPath = join(workspacePath, ".ambient", "workflows", "edited-date-night-workflow");
      const editedSaved: WorkflowRecordingSavedPlaybook = {
        ...savedInWorkspace,
        id: "edited-date-night-workflow",
        title: "Edited date night workflow",
        version: 2,
        rootPath: editedRootPath,
        manifestPath: join(editedRootPath, "ambient-workflow.json"),
        markdownPath: join(editedRootPath, "workflow.md"),
        sidecarPath: join(editedRootPath, "workflow.json"),
        transcriptPath: join(editedRootPath, "transcript.jsonl"),
      };
      const sourceTranscriptPath = join(workspacePath, "source-transcript.jsonl");
      writeFileSync(sourceTranscriptPath, "existing-transcript\n", "utf8");
      workflowRecordingWriteEditedPlaybookPackageWithIndex({
        savedPlaybook: editedSaved,
        confirmed: { ...confirmed, intent: "Edited date-night workflow." },
        sourceTranscriptPath,
        thread,
      });
      expect(readFileSync(editedSaved.transcriptPath, "utf8")).toBe("existing-transcript\n");
      expect(readFileSync(workflowRecordingSavedPlaybookVersion(editedSaved).transcriptPath, "utf8")).toBe("existing-transcript\n");
      expect(workflowRecordingReadIndex(editedSaved.indexPath).workflows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: editedSaved.id,
            version: 2,
          }),
        ]),
      );

      workflowRecordingWritePlaybookFiles(
        {
          rootPath: join(rootPath, "custom"),
          manifestPath: join(rootPath, "custom", "ambient-workflow.json"),
          markdownPath: join(rootPath, "custom", "workflow.md"),
          sidecarPath: join(rootPath, "custom", "workflow.json"),
          transcriptPath: join(rootPath, "custom", "transcript.jsonl"),
        },
        "manifest\n",
        "markdown\n",
        "sidecar\n",
        "transcript\n",
      );
      expect(readFileSync(join(rootPath, "custom", "workflow.md"), "utf8")).toBe("markdown\n");
    });
  });

  it("writes restored playbook package files with restore provenance", () => {
    withTempWorkspace((workspacePath) => {
      const rootPath = join(workspacePath, ".ambient", "workflows", saved.id);
      const restored: WorkflowRecordingSavedPlaybook = {
        ...saved,
        version: 3,
        savedAt: "2026-05-20T19:00:00.000Z",
        updatedAt: "2026-05-20T19:00:00.000Z",
        archivedAt: "2026-05-20T18:30:00.000Z",
        archivedReason: "Testing restore metadata.",
        rootPath,
        manifestPath: join(rootPath, "ambient-workflow.json"),
        markdownPath: join(rootPath, "workflow.md"),
        sidecarPath: join(rootPath, "workflow.json"),
        transcriptPath: join(rootPath, "transcript.jsonl"),
        indexPath: join(workspacePath, ".ambient", "workflows", "index.json"),
      };

      workflowRecordingWriteRestoredPlaybookPackage({
        savedPlaybook: restored,
        playbook: confirmed,
        sourceSidecarRecord: {
          kind: "ambient-workflow-sidecar",
          staleField: "preserved",
          version: 2,
        },
        sourceMarkdown: "# Previous workflow\n\nPrevious details.\n\n",
        transcript: "event-1\n",
        thread,
        restoredFromVersion: 2,
      });

      expect(readFileSync(restored.markdownPath, "utf8")).toBe(
        [
          "# Previous workflow",
          "",
          "Previous details.",
          "",
          "## Restore",
          "",
          "- Restored as version: 3",
          "- Restored from version: 2",
          "- Restored at: 2026-05-20T19:00:00.000Z",
          "",
        ].join("\n"),
      );
      expect(JSON.parse(readFileSync(restored.sidecarPath, "utf8"))).toMatchObject({
        kind: "ambient-workflow-sidecar",
        staleField: "preserved",
        id: restored.id,
        title: restored.title,
        version: 3,
        enabled: true,
        savedAt: "2026-05-20T19:00:00.000Z",
        updatedAt: "2026-05-20T19:00:00.000Z",
        archivedAt: "2026-05-20T18:30:00.000Z",
        archivedReason: "Testing restore metadata.",
        threadId: thread.id,
        restoredFromVersion: 2,
        playbook: confirmed,
      });
      expect(readFileSync(restored.transcriptPath, "utf8")).toBe("event-1\n");
      const restoredVersion = workflowRecordingSavedPlaybookVersion(restored);
      expect(readFileSync(restoredVersion.markdownPath, "utf8")).toBe(readFileSync(restored.markdownPath, "utf8"));
      expect(JSON.parse(readFileSync(restoredVersion.manifestPath, "utf8"))).toMatchObject({
        kind: "ambient-workflow",
        version: 3,
      });

      const indexedRootPath = join(workspacePath, ".ambient", "workflows", "indexed-restore-workflow");
      const indexedRestored: WorkflowRecordingSavedPlaybook = {
        ...restored,
        id: "indexed-restore-workflow",
        title: "Indexed restore workflow",
        version: 4,
        rootPath: indexedRootPath,
        manifestPath: join(indexedRootPath, "ambient-workflow.json"),
        markdownPath: join(indexedRootPath, "workflow.md"),
        sidecarPath: join(indexedRootPath, "workflow.json"),
        transcriptPath: join(indexedRootPath, "transcript.jsonl"),
      };
      workflowRecordingWriteRestoredPlaybookPackageWithIndex({
        savedPlaybook: indexedRestored,
        playbook: confirmed,
        sourceSidecarRecord: {
          kind: "ambient-workflow-sidecar",
          staleField: "preserved",
          version: 3,
        },
        sourceMarkdown: "# Indexed restore\n",
        transcript: "event-2\n",
        thread,
        restoredFromVersion: 3,
      });
      expect(workflowRecordingReadIndex(indexedRestored.indexPath).workflows.find((workflow) => workflow.id === indexedRestored.id)).toMatchObject({
        id: indexedRestored.id,
        title: indexedRestored.title,
        version: 4,
        versions: [
          {
            version: 4,
            title: indexedRestored.title,
            restoredFromVersion: 3,
          },
        ],
      });
    });
  });

  it("reads restorable workflow version sources with existing error messages", () => {
    withTempWorkspace((workspacePath) => {
      const sourceVersion = {
        version: 2,
        title: "Date night v2",
        savedAt: "2026-05-20T18:00:00.000Z",
        manifestPath: join(workspacePath, "ambient-workflow.json"),
        markdownPath: join(workspacePath, "workflow.md"),
        sidecarPath: join(workspacePath, "workflow.json"),
        transcriptPath: join(workspacePath, "transcript.jsonl"),
      };
      writeFileSync(sourceVersion.markdownPath, "# Previous workflow\n", "utf8");
      writeFileSync(sourceVersion.transcriptPath, "event-1\n", "utf8");
      writeFileSync(
        sourceVersion.sidecarPath,
        `${JSON.stringify({
          kind: "ambient-workflow-sidecar",
          staleField: "preserved",
          playbook: confirmed,
        })}\n`,
        "utf8",
      );

      expect(workflowRecordingReadRestorableVersionSource(saved.id, sourceVersion)).toEqual({
        playbook: confirmed,
        sourceSidecarRecord: {
          kind: "ambient-workflow-sidecar",
          staleField: "preserved",
          playbook: confirmed,
        },
        sourceMarkdown: "# Previous workflow\n",
        transcript: "event-1\n",
      });

      expect(() =>
        workflowRecordingReadRestorableVersionSource(saved.id, {
          ...sourceVersion,
          version: 3,
          sidecarPath: join(workspacePath, "missing.json"),
        }),
      ).toThrow("Workflow recording version has no readable sidecar: date-night-workflow v3");
      writeFileSync(sourceVersion.sidecarPath, `${JSON.stringify({ kind: "ambient-workflow-sidecar" })}\n`, "utf8");
      expect(() => workflowRecordingReadRestorableVersionSource(saved.id, sourceVersion)).toThrow(
        "Workflow recording version has no playbook: date-night-workflow v2",
      );
    });
  });

  it("reads workflow index files and writes updated entry records with versions", () => {
    withTempWorkspace((workspacePath) => {
      const workflowsRoot = join(workspacePath, ".ambient", "workflows");
      const rootPath = join(workflowsRoot, saved.id);
      const indexPath = join(workflowsRoot, "index.json");
      mkdirSync(rootPath, { recursive: true });
      const previousVersion = {
        version: 1,
        title: "Older date night workflow",
        savedAt: "2026-05-20T16:00:00.000Z",
        manifestPath: "date-night-workflow/versions/v1/ambient-workflow.json",
        markdownPath: "date-night-workflow/versions/v1/workflow.md",
        sidecarPath: "date-night-workflow/versions/v1/workflow.json",
        transcriptPath: "date-night-workflow/versions/v1/transcript.jsonl",
      };
      writeFileSync(
        indexPath,
        `${JSON.stringify(
          {
            workflows: [
              {
                id: saved.id,
                title: "Older date night workflow",
                version: 1,
                enabled: true,
                savedAt: "2026-05-20T16:00:00.000Z",
                manifestPath: "date-night-workflow/ambient-workflow.json",
                markdownPath: "date-night-workflow/workflow.md",
                sidecarPath: "date-night-workflow/workflow.json",
                transcriptPath: "date-night-workflow/transcript.jsonl",
                versions: [previousVersion],
              },
              {
                id: "other-workflow",
                title: "Other workflow",
                version: 1,
                enabled: true,
                savedAt: "2026-05-19T16:00:00.000Z",
                manifestPath: "other-workflow/ambient-workflow.json",
                markdownPath: "other-workflow/workflow.md",
                sidecarPath: "other-workflow/workflow.json",
                transcriptPath: "other-workflow/transcript.jsonl",
                versions: [],
              },
              { id: "invalid-workflow" },
            ],
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      const savedInWorkspace: WorkflowRecordingSavedPlaybook = {
        ...saved,
        rootPath,
        manifestPath: join(rootPath, "ambient-workflow.json"),
        markdownPath: join(rootPath, "workflow.md"),
        sidecarPath: join(rootPath, "workflow.json"),
        transcriptPath: join(rootPath, "transcript.jsonl"),
        indexPath,
      };

      const nextIndex = workflowRecordingIndexWithEntry(indexPath, savedInWorkspace, thread, 1);
      expect(nextIndex).toMatchObject({
        kind: "ambient-workflow-index",
        schemaVersion: 1,
        updatedAt: saved.savedAt,
      });
      const workflows = (nextIndex.workflows as WorkflowRecordingIndexRecord[]);
      expect(workflows.map((workflow) => workflow.id)).toEqual([saved.id, "other-workflow"]);
      expect(workflows[0].versions).toEqual([
        {
          version: 2,
          title: "Date night workflow",
          savedAt: "2026-05-20T17:00:00.000Z",
          manifestPath: "date-night-workflow/versions/v2/ambient-workflow.json",
          markdownPath: "date-night-workflow/versions/v2/workflow.md",
          sidecarPath: "date-night-workflow/versions/v2/workflow.json",
          transcriptPath: "date-night-workflow/versions/v2/transcript.jsonl",
          restoredFromVersion: 1,
        },
        previousVersion,
      ]);

      writeFileSync(indexPath, `${JSON.stringify(nextIndex, null, 2)}\n`, "utf8");
      expect(workflowRecordingReadIndex(indexPath).workflows).toHaveLength(2);
      const missingIndexPath = join(workflowsRoot, "missing.json");
      expect(workflowRecordingReadIndex(missingIndexPath)).toEqual({ workflows: [] });

      const indexes = workflowRecordingReadLibraryIndexes([indexPath, missingIndexPath]);
      expect(indexes).toHaveLength(2);
      expect(indexes[0]?.indexPath).toBe(indexPath);
      expect(indexes[0]?.index.workflows).toHaveLength(2);
      expect(indexes[1]).toEqual({ indexPath: missingIndexPath, index: { workflows: [] } });
    });
  });

  it("writes workflow index records with stable formatting", () => {
    withTempWorkspace((workspacePath) => {
      const workflowsRoot = join(workspacePath, ".ambient", "workflows");
      const indexPath = join(workflowsRoot, "index.json");
      mkdirSync(workflowsRoot, { recursive: true });
      const workflows: WorkflowRecordingIndexRecord[] = [
        {
          id: saved.id,
          title: saved.title,
          version: saved.version,
          enabled: true,
          savedAt: saved.savedAt,
          manifestPath: "date-night-workflow/ambient-workflow.json",
          markdownPath: "date-night-workflow/workflow.md",
          sidecarPath: "date-night-workflow/workflow.json",
          transcriptPath: "date-night-workflow/transcript.jsonl",
          versions: [],
        },
      ];

      workflowRecordingWriteIndexRecords(indexPath, workflows, "2026-05-20T19:00:00.000Z");
      expect(readFileSync(indexPath, "utf8")).toBe(`${JSON.stringify(
        {
          kind: "ambient-workflow-index",
          schemaVersion: 1,
          updatedAt: "2026-05-20T19:00:00.000Z",
          workflows,
        },
        null,
        2,
      )}\n`);
      expect(workflowRecordingReadIndex(indexPath).workflows).toEqual(workflows);

      workflowRecordingWriteIndex(indexPath, {
        kind: "ambient-workflow-index",
        schemaVersion: 1,
        updatedAt: "2026-05-20T20:00:00.000Z",
        workflows: [],
      });
      expect(readFileSync(indexPath, "utf8")).toContain('"updatedAt": "2026-05-20T20:00:00.000Z"');
      expect(readFileSync(indexPath, "utf8").endsWith("\n")).toBe(true);
    });
  });

  it("lists workflow library entries with filters, dedupe, query scores, and limits", () => {
    withTempWorkspace((workspacePath) => {
      const workflowsRoot = join(workspacePath, ".ambient", "workflows");
      const indexPath = join(workflowsRoot, "index.json");
      mkdirSync(workflowsRoot, { recursive: true });
      const writeEntryFiles = (rootName: string, playbook: WorkflowRecordingPlaybookDraft, markdown: string): void => {
        const rootPath = join(workflowsRoot, rootName);
        mkdirSync(rootPath, { recursive: true });
        writeFileSync(join(rootPath, "ambient-workflow.json"), `${JSON.stringify({ kind: "ambient-workflow", id: rootName })}\n`, "utf8");
        writeFileSync(join(rootPath, "workflow.md"), markdown, "utf8");
        writeFileSync(join(rootPath, "workflow.json"), `${JSON.stringify({ playbook })}\n`, "utf8");
        writeFileSync(join(rootPath, "transcript.jsonl"), "", "utf8");
      };
      const record = (input: {
        id: string;
        title: string;
        version: number;
        enabled: boolean;
        savedAt: string;
        rootName: string;
        archivedAt?: string;
      }): WorkflowRecordingIndexRecord => ({
        id: input.id,
        title: input.title,
        version: input.version,
        enabled: input.enabled,
        savedAt: input.savedAt,
        ...(input.archivedAt ? { archivedAt: input.archivedAt } : {}),
        manifestPath: `${input.rootName}/ambient-workflow.json`,
        markdownPath: `${input.rootName}/workflow.md`,
        sidecarPath: `${input.rootName}/workflow.json`,
        transcriptPath: `${input.rootName}/transcript.jsonl`,
        versions: [],
      });

      const olderPlaybook = { ...confirmed, intent: "Older date night workflow.", outputShape: ["Old shape."] };
      const latestPlaybook = { ...confirmed, intent: "Find current date-night events.", outputShape: ["Fresh recommendation list."] };
      const disabledPlaybook = { ...confirmed, intent: "Disabled planning workflow.", outputShape: ["Disabled output."] };
      const archivedPlaybook = { ...confirmed, intent: "Archived cleanup workflow.", outputShape: ["Archive output."] };
      writeEntryFiles("date-night-v1", olderPlaybook, "# Older workflow\n\nHistoric Scottsdale notes.\n");
      writeEntryFiles("date-night-v2", latestPlaybook, "# Current workflow\n\nScottsdale theater browser_search results.\n");
      writeEntryFiles("disabled-workflow", disabledPlaybook, "# Disabled workflow\n");
      writeEntryFiles("archived-workflow", archivedPlaybook, "# Archived workflow\n");

      const older = record({
        id: saved.id,
        title: "Older date night workflow",
        version: 1,
        enabled: true,
        savedAt: "2026-05-20T16:00:00.000Z",
        rootName: "date-night-v1",
      });
      const latest = record({
        id: saved.id,
        title: saved.title,
        version: 2,
        enabled: true,
        savedAt: "2026-05-20T18:00:00.000Z",
        rootName: "date-night-v2",
      });
      const disabled = record({
        id: "disabled-workflow",
        title: "Disabled workflow",
        version: 1,
        enabled: false,
        savedAt: "2026-05-20T19:00:00.000Z",
        rootName: "disabled-workflow",
      });
      const archived = record({
        id: "archived-workflow",
        title: "Archived workflow",
        version: 1,
        enabled: true,
        savedAt: "2026-05-20T20:00:00.000Z",
        rootName: "archived-workflow",
        archivedAt: "2026-05-20T20:30:00.000Z",
      });
      const indexes = [
        { indexPath, index: { workflows: [older, disabled] } },
        { indexPath, index: { workflows: [latest, archived] } },
      ];

      expect(workflowRecordingListLibraryEntries(indexes)).toMatchObject([
        {
          id: saved.id,
          version: 2,
          summary: "Find current date-night events.",
        },
      ]);
      expect(workflowRecordingListLibraryEntries(indexes, { includeDisabled: true, includeArchived: true, limit: 2 }).map((entry) => entry.id)).toEqual([
        "archived-workflow",
        "disabled-workflow",
      ]);
      expect(workflowRecordingListLibraryEntries(indexes, { query: "scottsdale browser_search" })).toMatchObject([
        {
          id: saved.id,
          score: 2,
        },
      ]);
      expect(workflowRecordingListLibraryEntries(indexes, { query: "archived", includeArchived: false })).toEqual([]);

      const foundCurrent = workflowRecordingFindLibraryRecord(indexes, saved.id);
      expect(foundCurrent?.record).toMatchObject({
        id: saved.id,
        version: 1,
      });
      expect(foundCurrent?.entry).toMatchObject({
        id: saved.id,
        summary: "Older date night workflow.",
      });
      expect(workflowRecordingRequireLibraryRecord(indexes, saved.id)).toEqual(foundCurrent);
      expect(workflowRecordingFindLibraryRecord(indexes, "disabled-workflow")).toBeUndefined();
      expect(workflowRecordingFindLibraryRecord(indexes, "disabled-workflow", { includeDisabled: true })?.record.id).toBe("disabled-workflow");
      expect(workflowRecordingRequireLibraryRecord(indexes, "disabled-workflow", { includeDisabled: true }).record.id).toBe("disabled-workflow");
      expect(workflowRecordingFindLibraryEntry(indexes, "archived-workflow", { includeArchived: true })?.archivedAt).toBe("2026-05-20T20:30:00.000Z");
      expect(workflowRecordingRequireLibraryEntry(indexes, "archived-workflow", { includeArchived: true }).archivedAt).toBe(
        "2026-05-20T20:30:00.000Z",
      );
      expect(workflowRecordingFindLibraryEntry(indexes, "missing-workflow", { includeDisabled: true, includeArchived: true })).toBeUndefined();
      expect(() =>
        workflowRecordingRequireLibraryEntry(indexes, "missing-workflow", { includeDisabled: true, includeArchived: true }),
      ).toThrow("Workflow recording not found: missing-workflow");
      expect(() =>
        workflowRecordingRequireLibraryRecord(indexes, "missing-workflow", { includeDisabled: true, includeArchived: true }),
      ).toThrow("Workflow recording not found: missing-workflow");
    });
  });

  it("maps workflow index records to library entries and descriptions", () => {
    withTempWorkspace((workspacePath) => {
      const workflowsRoot = join(workspacePath, ".ambient", "workflows");
      const rootPath = join(workflowsRoot, saved.id);
      const indexPath = join(workflowsRoot, "index.json");
      mkdirSync(join(rootPath, "versions", "v2"), { recursive: true });
      writeFileSync(join(rootPath, "ambient-workflow.json"), `${JSON.stringify({ kind: "ambient-workflow", id: saved.id })}\n`, "utf8");
      writeFileSync(join(rootPath, "workflow.md"), "# Date night workflow\n\nFind events in Scottsdale.\n", "utf8");
      writeFileSync(join(rootPath, "workflow.json"), `${JSON.stringify({
        files: {
          invocation: "workflow-invocation.json",
          diagnosticsTrace: "diagnostics/full-trace.jsonl",
        },
        callableWorkflow: workflowRecordingCallableInvocation(saved, confirmed, capture, thread),
        playbook: confirmed,
      })}\n`, "utf8");
      writeFileSync(
        join(rootPath, "workflow-invocation.json"),
        `${JSON.stringify(workflowRecordingCallableInvocation(saved, confirmed, capture, thread))}\n`,
        "utf8",
      );
      writeFileSync(join(rootPath, "transcript.jsonl"), workflowRecordingTranscriptJsonl(capture), "utf8");

      const record: WorkflowRecordingIndexRecord = {
        id: saved.id,
        title: saved.title,
        version: saved.version,
        enabled: true,
        savedAt: saved.savedAt,
        updatedAt: saved.updatedAt,
        threadId: thread.id,
        manifestPath: "date-night-workflow/ambient-workflow.json",
        markdownPath: "date-night-workflow/workflow.md",
        sidecarPath: "date-night-workflow/workflow.json",
        transcriptPath: "date-night-workflow/transcript.jsonl",
        versions: [
          {
            version: 2,
            title: saved.title,
            savedAt: saved.savedAt,
            manifestPath: "date-night-workflow/versions/v2/ambient-workflow.json",
            markdownPath: "date-night-workflow/versions/v2/workflow.md",
            sidecarPath: "date-night-workflow/versions/v2/workflow.json",
            transcriptPath: "date-night-workflow/versions/v2/transcript.jsonl",
          },
        ],
      };

      const entry = workflowRecordingLibraryEntry(indexPath, record);
      expect(entry).toMatchObject({
        id: saved.id,
        summary: confirmed.intent,
        toolNames: ["browser_search"],
        outputShape: ["Recommendation list with dates."],
        manifestPath: join(rootPath, "ambient-workflow.json"),
      });

      const description = workflowRecordingLibraryDescription(entry);
      expect(description.playbook).toEqual(confirmed);
      expect(description.manifest).toEqual({ kind: "ambient-workflow", id: saved.id });
      expect(description.markdownPreview).toContain("Find events in Scottsdale.");
      expect(description.callableInvocationPath).toBe(join(rootPath, "workflow-invocation.json"));
      expect(description.diagnosticsTracePath).toBe(join(rootPath, "diagnostics/full-trace.jsonl"));
      expect(description.callableInvocation).toMatchObject({
        schemaVersion: WORKFLOW_RECORDING_CALLABLE_INVOCATION_SCHEMA_VERSION,
        mode: "compact_callable_invocation",
        workflowId: saved.id,
        workflowVersion: saved.version,
        input: {
          goal: confirmed.intent,
          blocking: false,
          input_1: "City",
        },
        inputSchemaHints: {
          required: ["goal"],
          properties: {
            goal: "Concrete goal for this recorded playbook invocation.",
            input_1: "City",
          },
        },
        callableWorkflow: {
          invocation: "./workflow-invocation.json",
          diagnosticsTrace: "./diagnostics/full-trace.jsonl",
          recorderCompactInvocationByDefault: true,
          fullTraceArtifact: true,
        },
      });
      expect(workflowRecordingSearchScore(entry, "scottsdale sourced browser_search")).toBe(3);
      expect(workflowRecordingSearchScore(entry, "")).toBe(1);

      expect(workflowRecordingIndexRecordFromEntry(entry, indexPath)).toMatchObject({
        id: saved.id,
        manifestPath: "date-night-workflow/ambient-workflow.json",
        versions: [
          {
            version: 2,
            manifestPath: "date-night-workflow/versions/v2/ambient-workflow.json",
          },
        ],
      });
      expect(workflowRecordingLibraryVersions(indexPath, { ...record, versions: [] })).toEqual([
        {
          version: 2,
          title: saved.title,
          savedAt: saved.savedAt,
          manifestPath: join(rootPath, "ambient-workflow.json"),
          markdownPath: join(rootPath, "workflow.md"),
          sidecarPath: join(rootPath, "workflow.json"),
          transcriptPath: join(rootPath, "transcript.jsonl"),
        },
      ]);

      const versions = workflowRecordingLibraryVersions(indexPath, record);
      expect(workflowRecordingRequireLibraryVersion(saved.id, versions, 2)).toEqual(versions[0]);
      expect(() => workflowRecordingRequireLibraryVersion(saved.id, versions, 999)).toThrow(
        `Workflow recording version not found: ${saved.id} v999`,
      );
    });
  });

  it("resolves library paths and updates lifecycle json files", () => {
    withTempWorkspace((workspacePath) => {
      const lifecyclePath = join(workspacePath, "workflow.json");
      writeFileSync(
        lifecyclePath,
        `${JSON.stringify({
          id: saved.id,
          enabled: true,
          archivedAt: "2026-05-20T18:00:00.000Z",
          archivedReason: "No longer needed.",
          custom: "kept",
        })}\n`,
        "utf8",
      );

      workflowRecordingWriteLifecycleJson(lifecyclePath, {
        enabled: false,
        updatedAt: "2026-05-20T19:00:00.000Z",
        clearArchived: true,
      });

      expect(JSON.parse(readFileSync(lifecyclePath, "utf8"))).toEqual({
        id: saved.id,
        enabled: false,
        updatedAt: "2026-05-20T19:00:00.000Z",
        custom: "kept",
      });
      expect(workflowRecordingReadJson(join(workspacePath, "missing.json"))).toBeUndefined();
      expect(workflowRecordingReadText(join(workspacePath, "missing.md"))).toBe("");
      expect(workflowRecordingLibraryIndexPath(workspacePath)).toBe(join(workspacePath, ".ambient", "workflows", "index.json"));
      expect(workflowRecordingSavedPlaybookVersion(saved).rootPath).toBe("/tmp/workflows/date-night-workflow/versions/v2");
    });
  });

  it("applies lifecycle updates to workflow indexes and package files", () => {
    withTempWorkspace((workspacePath) => {
      const indexPath = workflowRecordingLibraryIndexPath(workspacePath);
      const savedInWorkspace = workflowRecordingSavedPlaybookForWorkspace({
        id: saved.id,
        title: saved.title,
        version: saved.version,
        enabled: true,
        savedAt: saved.savedAt,
        updatedAt: saved.updatedAt,
        workspacePath,
      });
      workflowRecordingWritePlaybookPackage(savedInWorkspace, confirmed, capture, thread);
      workflowRecordingWriteIndex(indexPath, workflowRecordingIndexWithEntry(indexPath, savedInWorkspace, thread));

      const initialIndex = workflowRecordingReadIndex(indexPath);
      const initialRecord = initialIndex.workflows[0];
      if (!initialRecord) throw new Error("Expected workflow recording index record.");
      const disabledAt = "2026-05-20T19:00:00.000Z";
      const disabledEntry = workflowRecordingApplyLibraryLifecycleUpdate(
        {
          indexPath,
          index: initialIndex,
          record: initialRecord,
          entry: workflowRecordingLibraryEntry(indexPath, initialRecord),
        },
        { enabled: false, updatedAt: disabledAt },
      );
      expect(disabledEntry).toMatchObject({ id: saved.id, enabled: false, updatedAt: disabledAt });
      expect(workflowRecordingReadIndex(indexPath).workflows[0]).toMatchObject({
        id: saved.id,
        enabled: false,
        updatedAt: disabledAt,
      });
      expect(workflowRecordingReadJson(disabledEntry.manifestPath)).toMatchObject({ enabled: false, updatedAt: disabledAt });
      expect(workflowRecordingReadJson(disabledEntry.sidecarPath)).toMatchObject({ enabled: false, updatedAt: disabledAt });

      const archiveIndex = workflowRecordingReadIndex(indexPath);
      const archiveRecord = archiveIndex.workflows[0];
      if (!archiveRecord) throw new Error("Expected workflow recording index record.");
      const archivedAt = "2026-05-20T20:00:00.000Z";
      const archivedEntry = workflowRecordingApplyLibraryLifecycleUpdate(
        {
          indexPath,
          index: archiveIndex,
          record: archiveRecord,
          entry: workflowRecordingLibraryEntry(indexPath, archiveRecord),
        },
        { updatedAt: archivedAt, archivedAt, archivedReason: "Retired." },
      );
      expect(archivedEntry).toMatchObject({
        id: saved.id,
        enabled: false,
        archivedAt,
        archivedReason: "Retired.",
      });

      const unarchiveIndex = workflowRecordingReadIndex(indexPath);
      const unarchiveRecord = unarchiveIndex.workflows[0];
      if (!unarchiveRecord) throw new Error("Expected workflow recording index record.");
      const unarchivedAt = "2026-05-20T21:00:00.000Z";
      const unarchivedEntry = workflowRecordingApplyLibraryLifecycleUpdate(
        {
          indexPath,
          index: unarchiveIndex,
          record: unarchiveRecord,
          entry: workflowRecordingLibraryEntry(indexPath, unarchiveRecord),
        },
        { updatedAt: unarchivedAt, clearArchived: true },
      );
      const unarchivedRecord = workflowRecordingReadIndex(indexPath).workflows[0];
      expect(unarchivedRecord).toMatchObject({ id: saved.id, enabled: false, updatedAt: unarchivedAt });
      expect(unarchivedRecord).not.toHaveProperty("archivedAt");
      expect(unarchivedRecord).not.toHaveProperty("archivedReason");
      const unarchivedManifest = workflowRecordingReadJson(unarchivedEntry.manifestPath);
      expect(unarchivedManifest).toMatchObject({ enabled: false, updatedAt: unarchivedAt });
      expect(unarchivedManifest).not.toHaveProperty("archivedAt");
      expect(unarchivedManifest).not.toHaveProperty("archivedReason");
    });
  });
});

function withTempWorkspace(run: (workspacePath: string) => void): void {
  const workspacePath = mkdtempWorkflowWorkspace();
  try {
    run(workspacePath);
  } finally {
    rmSync(workspacePath, { recursive: true, force: true });
  }
}

function mkdtempWorkflowWorkspace(): string {
  return mkdtempSync(join(tmpdir(), "ambient-workflow-recording-library-"));
}
