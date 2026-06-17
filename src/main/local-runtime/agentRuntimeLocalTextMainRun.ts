import { join, resolve } from "node:path";

import { emptyQueueState, type QueuedMessageSnapshot } from "../../shared/messageDelivery";
import type {
  DesktopEvent,
  LocalDeepResearchSettings,
  LocalModelHostMemorySnapshot,
  SendMessageInput,
  ThreadSummary,
} from "../../shared/types";
import type { AmbientModelRuntimeProfile } from "../../shared/ambientModels";
import {
  buildLocalModelResourceRegistry,
  localTextRequestedLaunch,
} from "./localModelResourceRegistry";
import {
  completeLocalTextDelegation,
  type LocalTextRuntimeManagerLike,
} from "./localTextDelegation";
import type { LocalTextSubagentRuntimeConfig } from "./localTextSubagentRuntime";
import { localTextMainAssistantContent } from "../agentRuntimeSubagentRuntimeHelpers";
import type { ProjectStore } from "../projectStore";
import { agentRuntimeQueuedMessageMetadata } from "../agentRuntimeUserMessageMetadata";

export interface AgentRuntimeLocalTextMainActiveRun {
  abort: () => Promise<void>;
  detach: () => void;
  queue: (message: QueuedMessageSnapshot) => Promise<void>;
  settled: Promise<void>;
  addActivityListener?: (listener: () => void) => () => void;
}

export interface AgentRuntimeLocalTextMainFeature {
  resolveRuntimeForMain?: (input: {
    thread: ThreadSummary;
    runId: string;
    model: AmbientModelRuntimeProfile;
    prompt: string;
  }) => LocalTextSubagentRuntimeConfig | undefined;
  runtimeManager?: LocalTextRuntimeManagerLike;
  fetchImpl?: typeof fetch;
}

export interface AgentRuntimeLocalTextMainRunInput {
  input: SendMessageInput;
  thread: ThreadSummary;
  promptContent: string;
  model: AmbientModelRuntimeProfile;
  hooks: {
    onActivity?: () => void;
  };
}

export interface AgentRuntimeLocalTextMainRunOptions {
  store: ProjectStore;
  runtimeFeature?: AgentRuntimeLocalTextMainFeature;
  fallbackRuntimeManager: LocalTextRuntimeManagerLike;
  readLocalDeepResearchSettings?: () => LocalDeepResearchSettings;
  localModelHostMemory?: () => LocalModelHostMemorySnapshot;
  setActiveRun: (threadId: string, run: AgentRuntimeLocalTextMainActiveRun) => void;
  deleteActiveRun: (threadId: string) => void;
  setActiveRunId: (threadId: string, runId: string) => void;
  deleteActiveRunId: (threadId: string) => void;
  emit: (event: DesktopEvent) => void;
  formatRuntimeError: (message: string) => string;
}

export async function runAgentRuntimeLocalTextMainRun(
  input: AgentRuntimeLocalTextMainRunInput,
  options: AgentRuntimeLocalTextMainRunOptions,
): Promise<void> {
  const runtimeManager = options.runtimeFeature?.runtimeManager ?? options.fallbackRuntimeManager;
  const assistantMessage = options.store.addMessage({
    threadId: input.input.threadId,
    role: "assistant",
    content: "",
    metadata: {
      status: "streaming",
      runtime: "local_text",
      provider: input.model.providerId,
      model: input.model.modelId,
      profileId: input.model.profileId,
    },
  });
  const run = options.store.startRun({ threadId: input.input.threadId, assistantMessageId: assistantMessage.id });
  const runWorkspacePath = options.store.getWorkspace().path;
  const controller = new AbortController();
  const activityListeners = new Set<() => void>();
  let finished = false;
  let detached = false;
  let resolveSettled: (() => void) | undefined;
  const settled = new Promise<void>((resolveSettledPromise) => {
    resolveSettled = resolveSettledPromise;
  });
  const emitRunEvent = (event: DesktopEvent) => {
    if (!detached) options.emit(event);
  };
  const markActivity = () => {
    input.hooks.onActivity?.();
    for (const listener of [...activityListeners]) listener();
  };
  const finish = (status: "done" | "error" | "aborted", message?: string) => {
    if (finished) return;
    finished = true;
    options.store.finishRun(run.id, status, message);
  };
  const activeRun: AgentRuntimeLocalTextMainActiveRun = {
    abort: async () => {
      controller.abort(new Error("Run stopped."));
      finish("aborted");
      const updated = options.store.replaceMessage(assistantMessage.id, "Run stopped.", {
        status: "aborted",
        runtime: "local_text",
        provider: input.model.providerId,
        model: input.model.modelId,
        profileId: input.model.profileId,
      });
      emitRunEvent({ type: "message-updated", message: updated, workspacePath: runWorkspacePath });
      emitRunEvent({ type: "run-status", threadId: input.input.threadId, status: "idle", workspacePath: runWorkspacePath });
    },
    detach: () => {
      detached = true;
      controller.abort(new Error("Run detached."));
    },
    queue: async (message) => {
      const updated = options.store.replaceMessage(
        message.id,
        message.content,
        agentRuntimeQueuedMessageMetadata(message, {
          status: "error",
          runtime: "local_text",
          error: "Queued steering is not supported for direct local text runs yet. Wait for the local run to finish, then send a new prompt.",
        }),
      );
      emitRunEvent({ type: "message-updated", message: updated, workspacePath: runWorkspacePath });
      emitRunEvent({ type: "queue-updated", queue: emptyQueueState(input.input.threadId), workspacePath: runWorkspacePath });
    },
    settled,
    addActivityListener: (listener) => {
      activityListeners.add(listener);
      return () => activityListeners.delete(listener);
    },
  };

  options.setActiveRun(input.input.threadId, activeRun);
  options.setActiveRunId(input.input.threadId, run.id);
  options.emit({ type: "message-created", message: assistantMessage, workspacePath: runWorkspacePath });
  options.emit({ type: "run-status", threadId: input.input.threadId, status: "starting", workspacePath: runWorkspacePath });

  try {
    const config = options.runtimeFeature?.resolveRuntimeForMain?.({
      thread: input.thread,
      runId: run.id,
      model: input.model,
      prompt: input.promptContent,
    });
    if (!config) throw new Error(`Local text runtime is not configured for model ${input.model.modelId}.`);
    const artifactRootPath = resolve(config.artifactRootPath ?? join(input.thread.workspacePath, ".ambient/local-main", run.id));
    const resourceRegistry = await buildLocalModelResourceRegistry({
      workspacePath: input.thread.workspacePath,
      settings: options.readLocalDeepResearchSettings?.().localModelResources,
      ...(options.localModelHostMemory ? { hostMemory: options.localModelHostMemory() } : {}),
      requestedLaunch: localTextRequestedLaunch({
        id: run.id,
        ownerThreadId: input.thread.id,
        modelId: input.model.modelId,
        profileId: input.model.profileId,
        contextTokens: input.model.contextWindowTokens,
        estimatedResidentMemoryBytes: input.model.estimatedResidentMemoryBytes,
      }),
      leases: runtimeManager.activeRuntimeLeases?.() ?? [],
    });
    options.store.updateRunStatus(run.id, "streaming");
    emitRunEvent({ type: "run-status", threadId: input.input.threadId, status: "streaming", workspacePath: runWorkspacePath });
    markActivity();
    const completion = await completeLocalTextDelegation({
      runtimeManager,
      workspacePath: input.thread.workspacePath,
      ownerThreadId: input.thread.id,
      model: input.model,
      resourceRegistry,
      launch: config.launch,
      stateRootPath: config.stateRootPath,
      requireSubagentEligible: false,
      completion: {
        runId: run.id,
        prompt: input.promptContent,
        completionUrl: config.completionUrl,
        artifactRootPath,
        fullOutputPath: config.fullOutputPath,
        maxInlineChars: config.maxInlineChars,
        maxOutputTokens: input.model.maxOutputTokens,
        timeoutMs: config.timeoutMs,
        signal: controller.signal,
      },
      fetchImpl: options.runtimeFeature?.fetchImpl,
    });
    const finalContent = localTextMainAssistantContent(completion.artifact);
    const updated = options.store.replaceMessage(assistantMessage.id, finalContent, {
      status: "completed",
      runtime: "local_text",
      provider: input.model.providerId,
      model: input.model.modelId,
      profileId: input.model.profileId,
      localTextResult: completion.artifact,
      completion: completion.completion,
      resourcePolicy: completion.plan.preflight.resourcePolicy,
      invocationLimits: completion.plan.preflight.invocationLimits,
    });
    finish("done");
    emitRunEvent({ type: "message-updated", message: updated, workspacePath: runWorkspacePath });
    emitRunEvent({ type: "thread-updated", thread: options.store.getThread(input.input.threadId), workspacePath: runWorkspacePath });
    emitRunEvent({ type: "run-status", threadId: input.input.threadId, status: "idle", workspacePath: runWorkspacePath });
    markActivity();
  } catch (error) {
    const stopped = controller.signal.aborted;
    const message = stopped ? "Run stopped." : error instanceof Error ? error.message : String(error);
    const updated = options.store.replaceMessage(assistantMessage.id, stopped ? "Run stopped." : options.formatRuntimeError(message), {
      status: stopped ? "aborted" : "error",
      runtime: "local_text",
      provider: input.model.providerId,
      model: input.model.modelId,
      profileId: input.model.profileId,
      error: message,
    });
    finish(stopped ? "aborted" : "error", stopped ? undefined : message);
    emitRunEvent({ type: "message-updated", message: updated, workspacePath: runWorkspacePath });
    emitRunEvent({ type: "run-status", threadId: input.input.threadId, status: stopped ? "idle" : "error", workspacePath: runWorkspacePath });
    if (!stopped) emitRunEvent({ type: "error", message, threadId: input.input.threadId, workspacePath: runWorkspacePath });
  } finally {
    options.deleteActiveRun(input.input.threadId);
    options.deleteActiveRunId(input.input.threadId);
    emitRunEvent({ type: "queue-updated", queue: emptyQueueState(input.input.threadId), workspacePath: runWorkspacePath });
    resolveSettled?.();
  }
}
