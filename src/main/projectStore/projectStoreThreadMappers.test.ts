import { describe, expect, it } from "vitest";
import {
  mapMessageRow,
  mapMessageVoiceStateRow,
  mapThreadRow,
  mapThreadWorktreeRow,
  mapWorkspaceSearchMessageRow,
  mapWorkspaceSearchThreadRow,
  type MessageRow,
  type MessageVoiceStateRow,
  type SearchMessageRow,
  type SearchThreadRow,
  type ThreadRow,
  type ThreadWorktreeRow,
} from "./projectStoreThreadMappers";

describe("project store thread mappers", () => {
  it("maps thread rows without store state", () => {
    const gitWorktree = {
      threadId: "thread-1",
      projectRoot: "/repo",
      worktreePath: "/repo-worktree",
      branchName: "codex/example",
      status: "active" as const,
      createdAt: "2026-06-06T18:58:00.000Z",
      updatedAt: "2026-06-06T18:59:00.000Z",
    };
    const row: ThreadRow = {
      id: "thread-1",
      title: "Build the feature",
      workspace_path: "/workspace",
      kind: "subagent_child",
      parent_thread_id: "parent-thread",
      parent_message_id: "parent-message",
      parent_run_id: "parent-run",
      subagent_run_id: "subagent-run",
      canonical_task_path: "/workspace/task.md",
      child_order: 2,
      collapsed_by_default: 1,
      child_status: "running",
      created_at: "2026-06-06T19:00:00.000Z",
      updated_at: "2026-06-06T19:01:00.000Z",
      last_read_at: "2026-06-06T19:02:00.000Z",
      last_message_preview: "Working on it",
      permission_mode: "full-access",
      collaboration_mode: "planner",
      model: "gpt-5-codex-max",
      thinking_level: "high",
      memory_enabled: 1,
      pi_session_file: "/tmp/session.json",
      archived_at: "2026-06-06T19:03:00.000Z",
      pinned: 1,
      workflow_recording_json: JSON.stringify({ status: "recording", goal: "Capture workflow" }),
    };

    expect(mapThreadRow(row, { gitWorktree })).toEqual({
      id: "thread-1",
      title: "Build the feature",
      workspacePath: "/workspace",
      kind: "subagent_child",
      parentThreadId: "parent-thread",
      parentMessageId: "parent-message",
      parentRunId: "parent-run",
      subagentRunId: "subagent-run",
      canonicalTaskPath: "/workspace/task.md",
      childOrder: 2,
      collapsedByDefault: true,
      childStatus: "running",
      createdAt: "2026-06-06T19:00:00.000Z",
      updatedAt: "2026-06-06T19:01:00.000Z",
      archivedAt: "2026-06-06T19:03:00.000Z",
      lastReadAt: "2026-06-06T19:02:00.000Z",
      lastMessagePreview: "Working on it",
      permissionMode: "full-access",
      collaborationMode: "planner",
      model: "gpt-5-codex-max",
      thinkingLevel: "high",
      memoryEnabled: true,
      piSessionFile: "/tmp/session.json",
      gitWorktree,
      pinned: true,
      workflowRecording: { status: "recording", goal: "Capture workflow" },
    });
  });

  it("preserves thread nullable and fallback behavior", () => {
    const mapped = mapThreadRow({
      ...baseThreadRow(),
      kind: "unknown" as ThreadRow["kind"],
      collaboration_mode: "unknown" as ThreadRow["collaboration_mode"],
      parent_thread_id: null,
      parent_message_id: null,
      parent_run_id: null,
      subagent_run_id: null,
      canonical_task_path: null,
      child_order: null,
      collapsed_by_default: null,
      child_status: null,
      archived_at: null,
      last_read_at: null,
      pi_session_file: null,
      pinned: null,
      workflow_recording_json: "[]",
    });

    expect(mapped.kind).toBe("chat");
    expect(mapped.collaborationMode).toBe("agent");
    expect(mapped.parentThreadId).toBeUndefined();
    expect(mapped.parentMessageId).toBeUndefined();
    expect(mapped.parentRunId).toBeUndefined();
    expect(mapped.subagentRunId).toBeUndefined();
    expect(mapped.canonicalTaskPath).toBeUndefined();
    expect(mapped.childOrder).toBeUndefined();
    expect(mapped.collapsedByDefault).toBe(false);
    expect(mapped.childStatus).toBeUndefined();
    expect(mapped.archivedAt).toBeUndefined();
    expect(mapped.lastReadAt).toBeUndefined();
    expect(mapped.piSessionFile).toBeUndefined();
    expect(mapped.gitWorktree).toBeUndefined();
    expect(mapped.pinned).toBe(false);
    expect(mapped.workflowRecording).toBeUndefined();
    expect(mapThreadRow({ ...baseThreadRow(), workflow_recording_json: "not-json" }).workflowRecording).toBeUndefined();
  });

  it("maps message rows without store state", () => {
    const row: MessageRow = {
      id: "message-1",
      thread_id: "thread-1",
      role: "assistant",
      content: "Hello",
      created_at: "2026-06-06T19:00:00.000Z",
      metadata_json: "{\"toolName\":\"shell\",\"exitCode\":0}",
    };

    expect(mapMessageRow(row)).toEqual({
      id: "message-1",
      threadId: "thread-1",
      role: "assistant",
      content: "Hello",
      createdAt: "2026-06-06T19:00:00.000Z",
      metadata: {
        toolName: "shell",
        exitCode: 0,
      },
    });
  });

  it("preserves message metadata fallback behavior", () => {
    expect(mapMessageRow({ ...baseMessageRow(), metadata_json: null }).metadata).toBeUndefined();
    expect(mapMessageRow({ ...baseMessageRow(), metadata_json: "not json" }).metadata).toEqual({});
    expect(mapMessageRow({ ...baseMessageRow(), metadata_json: "null" }).metadata).toBeNull();
  });

  it("maps thread worktree rows without store state", () => {
    const row: ThreadWorktreeRow = {
      thread_id: "thread-1",
      project_root: "/repo",
      worktree_path: "/repo-worktree",
      branch_name: "codex/example",
      base_ref: "origin/main",
      upstream: null,
      worktree_status: "active",
      created_at: "2026-06-06T19:00:00.000Z",
      updated_at: "2026-06-06T19:01:00.000Z",
      last_checkpoint_id: "checkpoint-1",
      error: null,
    };

    expect(mapThreadWorktreeRow(row)).toEqual({
      threadId: "thread-1",
      projectRoot: "/repo",
      worktreePath: "/repo-worktree",
      branchName: "codex/example",
      baseRef: "origin/main",
      upstream: undefined,
      status: "active",
      createdAt: "2026-06-06T19:00:00.000Z",
      updatedAt: "2026-06-06T19:01:00.000Z",
      lastCheckpointId: "checkpoint-1",
      error: undefined,
    });
  });

  it("maps message voice state rows without store state", () => {
    const row: MessageVoiceStateRow = {
      message_id: "message-1",
      thread_id: "thread-1",
      status: "ready",
      source: "assistant-text",
      source_message_id: "message-1",
      provider_capability_id: "capability-1",
      provider_id: "provider-1",
      voice_id: "voice-1",
      spoken_text: "Hello",
      spoken_text_chars: 5,
      source_text_chars: 7,
      audio_path: "/tmp/audio.mp3",
      last_audio_path: null,
      media_url: "ambient-media://voice/message-1",
      mime_type: "audio/mpeg",
      duration_ms: 1234,
      error: null,
      created_at: "2026-06-06T19:00:00.000Z",
      updated_at: "2026-06-06T19:01:00.000Z",
    };

    expect(mapMessageVoiceStateRow(row)).toEqual({
      messageId: "message-1",
      threadId: "thread-1",
      status: "ready",
      source: "assistant-text",
      sourceMessageId: "message-1",
      providerCapabilityId: "capability-1",
      providerId: "provider-1",
      voiceId: "voice-1",
      spokenText: "Hello",
      spokenTextChars: 5,
      sourceTextChars: 7,
      audioPath: "/tmp/audio.mp3",
      lastAudioPath: undefined,
      mediaUrl: "ambient-media://voice/message-1",
      mimeType: "audio/mpeg",
      durationMs: 1234,
      error: undefined,
      createdAt: "2026-06-06T19:00:00.000Z",
      updatedAt: "2026-06-06T19:01:00.000Z",
    });
  });

  it("maps workspace search thread rows without store state", () => {
    const row: SearchThreadRow = {
      id: "thread-1",
      title: "Launch notes",
      last_message_preview: "The launch checklist is ready.",
      updated_at: "2026-06-06T19:10:00.000Z",
    };

    expect(
      mapWorkspaceSearchThreadRow(row, {
        workspacePath: "/workspace",
        projectName: "Ambient",
        scope: "project",
      }),
    ).toEqual({
      id: "thread:thread-1",
      kind: "thread",
      threadId: "thread-1",
      workspacePath: "/workspace",
      projectName: "Ambient",
      title: "Launch notes",
      excerpt: "The launch checklist is ready.",
      createdAt: "2026-06-06T19:10:00.000Z",
      scope: "project",
    });
  });

  it("maps workspace search message rows with preview formatting", () => {
    const row: SearchMessageRow = {
      id: "message-1",
      thread_id: "thread-1",
      role: "assistant",
      content: ` first line\n\nsecond line ${"x".repeat(240)}`,
      created_at: "2026-06-06T19:11:00.000Z",
      thread_title: "Launch notes",
    };

    const mapped = mapWorkspaceSearchMessageRow(row, {
      workspacePath: "/workspace",
      projectName: "Ambient",
      scope: "chat",
    });

    expect(mapped).toMatchObject({
      id: "message:message-1",
      kind: "message",
      threadId: "thread-1",
      workspacePath: "/workspace",
      projectName: "Ambient",
      title: "Launch notes",
      createdAt: "2026-06-06T19:11:00.000Z",
      role: "assistant",
      scope: "chat",
    });
    expect(mapped.excerpt).toBe(`first line second line ${"x".repeat(157)}`);
  });
});

function baseMessageRow(): MessageRow {
  return {
    id: "message-1",
    thread_id: "thread-1",
    role: "user",
    content: "Hello",
    created_at: "2026-06-06T19:00:00.000Z",
    metadata_json: "{\"source\":\"test\"}",
  };
}

function baseThreadRow(): ThreadRow {
  return {
    id: "thread-1",
    title: "Build the feature",
    workspace_path: "/workspace",
    kind: "chat",
    parent_thread_id: "parent-thread",
    parent_message_id: "parent-message",
    parent_run_id: "parent-run",
    subagent_run_id: "subagent-run",
    canonical_task_path: "/workspace/task.md",
    child_order: 1,
    collapsed_by_default: 0,
    child_status: "running",
    created_at: "2026-06-06T19:00:00.000Z",
    updated_at: "2026-06-06T19:01:00.000Z",
    last_read_at: "2026-06-06T19:02:00.000Z",
    last_message_preview: "Working on it",
    permission_mode: "workspace",
    collaboration_mode: "agent",
    model: "gpt-5-codex-max",
    thinking_level: "xhigh",
    memory_enabled: 0,
    pi_session_file: "/tmp/session.json",
    archived_at: null,
    pinned: 0,
    workflow_recording_json: JSON.stringify({ status: "recording" }),
  };
}
