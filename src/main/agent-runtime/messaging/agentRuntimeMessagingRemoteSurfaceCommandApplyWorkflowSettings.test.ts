import { describe, expect, it, vi } from "vitest";

import type { ThreadSummary } from "../../../shared/threadTypes";
import type { SearchRoutingSettings } from "../../../shared/webResearchTypes";
import type { MessagingRemoteSurfaceCommandWorkflowActionAgents } from "./agentRuntimeMessagingRemoteSurfaceCommandApplyTools";
import {
  messagingRemoteSurfaceCommandApplySettingUpdate,
  messagingRemoteSurfaceCommandApplyWorkflowAction,
} from "./agentRuntimeMessagingRemoteSurfaceCommandApplyTools";
import {
  searchCatalog,
  sttProvider,
  sttSettings,
  threadSummary,
  voiceSettings,
  workflowThread,
} from "./agentRuntimeMessagingRemoteSurfaceCommandApplyTools.testHelpers";

describe("Remote Ambient Surface command apply workflow and setting updates", () => {
  it("applies Remote Ambient Surface workflow actions through injected workflow agents", async () => {
    const beforeThread = workflowThread({ phase: "discovery" });
    const explorationThread = workflowThread({ phase: "exploration" });
    const compileThread = workflowThread({ phase: "compiled" });
    const reviewThread = workflowThread({ phase: "review" });
    const recoverThread = workflowThread({ phase: "running" });
    const cancelThread = workflowThread({ phase: "canceled" });
    const workflowUpdates: unknown[] = [];
    const workflowAgents = {
      runExploration: vi.fn(async () => ({
        thread: explorationThread,
        traceId: "trace-1",
        graphSnapshotId: "graph-1",
      })),
      compilePreview: vi.fn(async () => ({
        thread: compileThread,
        artifactId: "artifact-1",
        runId: "run-compile",
      })),
      reviewArtifact: vi.fn(async () => ({
        thread: reviewThread,
        artifactId: "artifact-1",
        artifactStatus: "approved",
        changed: true,
      })),
      recoverRun: vi.fn(async () => ({
        thread: recoverThread,
        runId: "run-recovered",
        runStatus: "running",
        changed: true,
      })),
      cancelRun: vi.fn(async () => ({
        thread: cancelThread,
        runId: "run-cancel",
        runStatus: "canceled",
        changed: true,
      })),
    };
    const applyWorkflowAction = (input: Parameters<typeof messagingRemoteSurfaceCommandApplyWorkflowAction>[0]["input"]) =>
      messagingRemoteSurfaceCommandApplyWorkflowAction({
        input,
        getWorkflowThreadSummary: (workflowThreadId) => {
          expect(workflowThreadId).toBe("workflow-1");
          return beforeThread;
        },
        workflowAgents,
        onWorkflowUpdated: () => workflowUpdates.push({ type: "workflow-updated" }),
      });

    const exploration = await applyWorkflowAction({
      action: "run_exploration",
      workflowThreadId: "workflow-1",
      workflowTitle: "Launch workflow",
      reason: "Owner asked for exploration.",
    });
    const compile = await applyWorkflowAction({
      action: "compile_preview",
      workflowThreadId: "workflow-1",
      workflowTitle: "Launch workflow",
      reason: "Owner asked for a preview.",
    });
    const review = await applyWorkflowAction({
      action: "approve_artifact",
      workflowThreadId: "workflow-1",
      workflowTitle: "Launch workflow",
      artifactId: "artifact-1",
      reason: "Owner approved the artifact.",
    });
    const recovery = await applyWorkflowAction({
      action: "retry_failed_step",
      workflowThreadId: "workflow-1",
      workflowTitle: "Launch workflow",
      runId: "run-1",
      eventId: "event-1",
      recoveryAction: "retry_step",
      graphNodeId: "node-1",
      itemKey: "item-1",
      reason: "Owner requested retry.",
    });
    const cancel = await applyWorkflowAction({
      action: "cancel_run",
      workflowThreadId: "workflow-1",
      workflowTitle: "Launch workflow",
      runId: "run-cancel",
      reason: "Owner canceled the run.",
    });

    expect(workflowAgents.runExploration).toHaveBeenCalledWith({
      workflowThreadId: "workflow-1",
      reason: "Owner asked for exploration.",
    });
    expect(workflowAgents.compilePreview).toHaveBeenCalledWith({
      workflowThreadId: "workflow-1",
      reason: "Owner asked for a preview.",
    });
    expect(workflowAgents.reviewArtifact).toHaveBeenCalledWith({
      workflowThreadId: "workflow-1",
      artifactId: "artifact-1",
      decision: "approved",
      reason: "Owner approved the artifact.",
    });
    expect(workflowAgents.recoverRun).toHaveBeenCalledWith({
      workflowThreadId: "workflow-1",
      runId: "run-1",
      eventId: "event-1",
      action: "retry_step",
      graphNodeId: "node-1",
      itemKey: "item-1",
      reason: "Owner requested retry.",
    });
    expect(workflowAgents.cancelRun).toHaveBeenCalledWith({
      workflowThreadId: "workflow-1",
      runId: "run-cancel",
      reason: "Owner canceled the run.",
    });
    expect(workflowUpdates).toHaveLength(5);
    expect(exploration).toMatchObject({
      action: "run_exploration",
      workflowThreadId: "workflow-1",
      workflowTitle: "Launch workflow",
      changed: true,
      traceId: "trace-1",
      graphSnapshotId: "graph-1",
    });
    expect(exploration.text).toContain("Phase: discovery -> exploration");
    expect(compile).toMatchObject({
      action: "compile_preview",
      artifactId: "artifact-1",
      runId: "run-compile",
    });
    expect(compile.text).toContain("Workflow Agent compile preview completed");
    expect(review).toMatchObject({
      action: "approve_artifact",
      artifactId: "artifact-1",
      artifactStatus: "approved",
      changed: true,
    });
    expect(review.text).toContain("Workflow preview approved");
    expect(recovery).toMatchObject({
      action: "retry_failed_step",
      runId: "run-recovered",
      runStatus: "running",
      changed: true,
    });
    expect(recovery.text).toContain("Recovery action: retry_step");
    expect(cancel).toMatchObject({
      action: "cancel_run",
      runId: "run-cancel",
      runStatus: "canceled",
      changed: true,
    });
    expect(cancel.text).toContain("Workflow cancellation requested");
  });

  it("preserves Remote Ambient Surface workflow action validation errors", async () => {
    const applyWorkflowAction = (
      input: Parameters<typeof messagingRemoteSurfaceCommandApplyWorkflowAction>[0]["input"],
      workflowAgents: MessagingRemoteSurfaceCommandWorkflowActionAgents = {},
    ) =>
      messagingRemoteSurfaceCommandApplyWorkflowAction({
        input,
        getWorkflowThreadSummary: () => workflowThread(),
        workflowAgents,
        onWorkflowUpdated: () => {
          throw new Error("Workflow update should not be emitted.");
        },
      });

    await expect(
      applyWorkflowAction({
        action: "run_exploration",
        workflowThreadId: "workflow-1",
        workflowTitle: "Launch workflow",
        reason: "Owner asked for exploration.",
      }),
    ).rejects.toThrow("Ambient Workflow Agent exploration is not available in this runtime.");
    await expect(
      applyWorkflowAction(
        {
          action: "approve_artifact",
          workflowThreadId: "workflow-1",
          workflowTitle: "Launch workflow",
          reason: "Owner approved the artifact.",
        },
        { reviewArtifact: vi.fn() },
      ),
    ).rejects.toThrow("Workflow preview review requires an artifact id.");
    await expect(
      applyWorkflowAction(
        {
          action: "resume_checkpoint",
          workflowThreadId: "workflow-1",
          workflowTitle: "Launch workflow",
          runId: "run-1",
          reason: "Owner requested recovery.",
        },
        { recoverRun: vi.fn() },
      ),
    ).rejects.toThrow("Workflow recovery requires a run id, event id, and recovery action.");
    await expect(
      applyWorkflowAction(
        {
          action: "cancel_run",
          workflowThreadId: "workflow-1",
          workflowTitle: "Launch workflow",
          reason: "Owner canceled the run.",
        },
        { cancelRun: vi.fn() },
      ),
    ).rejects.toThrow("Workflow cancellation requires a run id.");
  });

  it("applies Remote Ambient Surface setting updates through injected settings dependencies", async () => {
    const threadEvents: unknown[] = [];
    const threads = new Map<string, ThreadSummary>([["thread-1", threadSummary()]]);
    const updateThreadSettings = vi.fn((threadId: string, next: Partial<Pick<ThreadSummary, "collaborationMode" | "thinkingLevel">>) => {
      const updated = { ...(threads.get(threadId) ?? threadSummary({ id: threadId })), ...next } as ThreadSummary;
      threads.set(threadId, updated);
      return updated;
    });
    let voice = voiceSettings();
    let stt = sttSettings();
    let media = { generatedMediaAutoplay: false };
    let planner = { autoFinalize: true };
    let search = {} as SearchRoutingSettings;
    const voiceUpdateSettings = vi.fn(async (next) => {
      voice = next;
      return next;
    });
    const sttUpdateSettings = vi.fn(async (next) => {
      stt = next;
      return next;
    });
    const mediaUpdateSettings = vi.fn(async (next) => {
      media = next;
      return next;
    });
    const plannerUpdateSettings = vi.fn(async (next) => {
      planner = next;
      return next;
    });
    const searchUpdateSettings = vi.fn(async (next) => {
      search = next;
      return next;
    });
    const discoverAmbientCliPackages = vi.fn(async (_workspacePath: string, options?: unknown) => {
      expect(options).toEqual({ includeHealth: true });
      return searchCatalog();
    });
    const baseOptions = () => ({
      threadId: "thread-1",
      workspacePath: "/workspace",
      getThread: (threadId: string) => threads.get(threadId) ?? threadSummary({ id: threadId }),
      updateThreadSettings,
      onThreadUpdated: (thread: unknown) => threadEvents.push(thread),
      voice: {
        readSettings: () => voice,
        updateSettings: voiceUpdateSettings,
        onStateUpdated: vi.fn(),
      },
      stt: {
        readSettings: () => stt,
        updateSettings: sttUpdateSettings,
      },
      listSttProviders: vi.fn(async () => [sttProvider()]),
      media: {
        readSettings: () => media,
        updateSettings: mediaUpdateSettings,
      },
      planner: {
        readSettings: () => planner,
        updateSettings: plannerUpdateSettings,
      },
      search: {
        readSettings: () => search,
        updateSettings: searchUpdateSettings,
      },
      discoverAmbientCliPackages,
    });
    const applySettingUpdate = (input: Parameters<typeof messagingRemoteSurfaceCommandApplySettingUpdate>[0]["input"]) =>
      messagingRemoteSurfaceCommandApplySettingUpdate({
        ...baseOptions(),
        input,
      });

    const threadResult = await applySettingUpdate({
      settingKey: "thread",
      operation: "thread_settings",
      field: "thinkingLevel",
      value: "high",
      reason: "Owner asked for deeper thinking.",
    });
    const voiceResult = await applySettingUpdate({
      settingKey: "voice",
      operation: "voice_policy",
      field: "autoplay",
      value: true,
      reason: "Owner enabled voice autoplay.",
    });
    const sttResult = await applySettingUpdate({
      settingKey: "stt",
      operation: "stt_policy",
      field: "autoSendAfterTranscription",
      value: false,
      reason: "Owner disabled auto-send.",
    });
    const mediaResult = await applySettingUpdate({
      settingKey: "media",
      operation: "media_playback",
      field: "generatedMediaAutoplay",
      value: true,
      reason: "Owner enabled generated media autoplay.",
    });
    const plannerResult = await applySettingUpdate({
      settingKey: "planner",
      operation: "planner_finalization",
      field: "autoFinalize",
      value: false,
      reason: "Owner disabled planner auto-finalize.",
    });
    const searchResult = await applySettingUpdate({
      settingKey: "search",
      operation: "search_preference",
      providerAlias: "brave-search",
      mode: "require",
      fallback: "block",
      reason: "Owner prefers Brave.",
    });

    expect(updateThreadSettings).toHaveBeenCalledWith("thread-1", { thinkingLevel: "high" });
    expect(threadEvents).toHaveLength(1);
    expect(threadResult).toMatchObject({
      settingKey: "thread",
      operation: "thread_settings",
      changed: true,
      nextSummary: "thread=Launch room; id=thread-1; mode=agent; thinkingLevel=high; model=ambient",
    });
    expect(threadResult.text).toContain("Thinking level: medium -> high");

    expect(voiceUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({ autoplay: true }), {
      source: "chat-tool",
      toolName: "ambient_messaging_remote_surface_command_apply",
      threadId: "thread-1",
      summary: "Remote Ambient Surface updated voice policy settings.",
    });
    expect(voiceResult).toMatchObject({
      settingKey: "voice",
      operation: "voice_policy",
      changed: true,
      nextSummary: "enabled=true; mode=assistant-final; autoplay=true; longReply=summarize; maxChars=1200; provider=voice-cap; voice=alloy",
    });

    expect(sttUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({ autoSendAfterTranscription: false }));
    expect(sttResult).toMatchObject({
      settingKey: "stt",
      operation: "stt_policy",
      changed: true,
    });
    expect(sttResult.nextSummary).toContain("autoSendAfterTranscription=false");

    expect(mediaUpdateSettings).toHaveBeenCalledWith({ generatedMediaAutoplay: true });
    expect(mediaResult).toMatchObject({
      settingKey: "media",
      operation: "media_playback",
      changed: true,
      previousSummary: "generatedMediaAutoplay=false",
      nextSummary: "generatedMediaAutoplay=true",
    });

    expect(plannerUpdateSettings).toHaveBeenCalledWith({ autoFinalize: false });
    expect(plannerResult).toMatchObject({
      settingKey: "planner",
      operation: "planner_finalization",
      changed: true,
      previousSummary: "autoFinalize=true",
      nextSummary: "autoFinalize=false",
    });

    expect(discoverAmbientCliPackages).toHaveBeenCalledWith("/workspace", { includeHealth: true });
    expect(searchUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        webResearch: expect.objectContaining({
          fallbackPolicy: { allowBrowserFallback: false },
        }),
      }),
    );
    expect(searchResult).toMatchObject({
      settingKey: "search",
      operation: "search_preference",
      changed: true,
    });
    expect(searchResult.text).toContain("Brave Search");
  });

  it("preserves Remote Ambient Surface setting update safety and no-op behavior", async () => {
    const updateThreadSettings = vi.fn();
    const baseOptions = {
      threadId: "thread-1",
      workspacePath: "/workspace",
      getThread: () => threadSummary({ collaborationMode: "agent" }),
      updateThreadSettings,
      onThreadUpdated: vi.fn(),
      listSttProviders: vi.fn(async () => []),
      discoverAmbientCliPackages: vi.fn(async () => ({ packages: [], errors: [] })),
    };

    await expect(
      messagingRemoteSurfaceCommandApplySettingUpdate({
        ...baseOptions,
        getThread: () => threadSummary({ collaborationMode: "planner" }),
        input: {
          settingKey: "media",
          operation: "media_playback",
          field: "generatedMediaAutoplay",
          value: true,
          reason: "Owner enabled media autoplay.",
        },
      }),
    ).rejects.toThrow("Remote Ambient Surface settings changes are blocked in Planner Mode.");

    const noop = await messagingRemoteSurfaceCommandApplySettingUpdate({
      ...baseOptions,
      input: {
        settingKey: "thread",
        operation: "thread_settings",
        field: "thinkingLevel",
        value: "medium",
        reason: "Owner kept current thinking.",
      },
    });
    expect(updateThreadSettings).not.toHaveBeenCalled();
    expect(noop).toMatchObject({
      settingKey: "thread",
      operation: "thread_settings",
      changed: false,
      previousSummary: "thread=Launch room; id=thread-1; mode=agent; thinkingLevel=medium; model=ambient",
      nextSummary: "thread=Launch room; id=thread-1; mode=agent; thinkingLevel=medium; model=ambient",
    });
    await expect(
      messagingRemoteSurfaceCommandApplySettingUpdate({
        ...baseOptions,
        input: {
          settingKey: "voice",
          operation: "voice_policy",
          field: "wat",
          value: true,
          reason: "Owner tried an unsupported field.",
        },
      }),
    ).rejects.toThrow("Ambient voice settings updates are not available in this runtime.");
  });
});
