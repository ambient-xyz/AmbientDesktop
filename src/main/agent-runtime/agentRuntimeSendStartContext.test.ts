import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { DesktopEvent, SendMessageInput } from "../../shared/desktopTypes";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import {
  AMBIENT_DEFAULT_MODEL,
  resolveAmbientModelRuntimeProfile,
  type AmbientModelRuntimeProfile,
} from "../../shared/ambientModels";
import {
  prepareAgentRuntimeSendStartContext,
  type AgentRuntimeSendStartContextInput,
} from "./agentRuntimeSendStartContext";
import type { RuntimeSendMessageInput, RuntimeSendLoopContext } from "./agentRuntimeSendPreparationController";

describe("prepareAgentRuntimeSendStartContext", () => {
  it("returns handled when active-run handoff consumes the input", async () => {
    const sendInput = sendMessageInput();
    const activeRun = {
      settled: Promise.resolve(),
      queue: vi.fn(),
    };
    const handleSendActiveRunHandoff = vi.fn(async () => true);
    const sendPreparation = {
      prepareRuntimeSendLoopContext: vi.fn(),
    };

    const result = await prepareAgentRuntimeSendStartContext({
      ...baseInput(sendInput),
      activeRuns: {
        get: vi.fn(() => activeRun),
      },
      activeRunHandoff: {
        handleSendActiveRunHandoff,
      } as unknown as AgentRuntimeSendStartContextInput["activeRunHandoff"],
      sendPreparation: sendPreparation as unknown as AgentRuntimeSendStartContextInput["sendPreparation"],
    });

    expect(result).toEqual({ kind: "handled" });
    expect(handleSendActiveRunHandoff).toHaveBeenCalledWith(sendInput, activeRun, {});
    expect(sendPreparation.prepareRuntimeSendLoopContext).not.toHaveBeenCalled();
  });

  it("assembles the pre-run send context before run materialization", async () => {
    const sendInput = sendMessageInput({ content: "build the thing" });
    const thread = threadSummary();
    const sendLoopInput = {
      ...sendInput,
      model: "example/model-id",
    } as SendMessageInput;
    const runtimeInput = {
      ...sendLoopInput,
      visibleUserContent: "visible user content",
    } as RuntimeSendMessageInput;
    const sendLoop = sendLoopContext(runtimeInput, thread);
    const sendInputWithToolCapableModel = vi.fn(() => sendLoopInput);
    const runBeforePrompt = vi.fn(async () => ({
      kind: "continue" as const,
      promptContent: "prepared prompt",
      runtimeModel: "example/model-id",
    }));
    const prepareRuntimeSendLoopContext = vi.fn(() => sendLoop);
    const onActivity = vi.fn();

    const result = await prepareAgentRuntimeSendStartContext({
      ...baseInput(sendInput),
      hooks: { onActivity },
      sendPreflight: {
        sendInputWithSymphonyParentModeToolCapableModel: sendInputWithToolCapableModel,
        resolveMainModelRuntimeProfile: (modelId?: string) => resolveAmbientModelRuntimeProfile(modelId),
        runBeforePrompt,
      } as unknown as AgentRuntimeSendStartContextInput["sendPreflight"],
      sendPreparation: {
        prepareRuntimeSendLoopContext,
      } as unknown as AgentRuntimeSendStartContextInput["sendPreparation"],
      store: storeForThread(thread),
    });

    expect(result.kind).toBe("continue");
    if (result.kind !== "continue") return;
    expect(sendInputWithToolCapableModel).toHaveBeenCalledWith(sendInput, thread, undefined);
    expect(prepareRuntimeSendLoopContext).toHaveBeenCalledWith(sendLoopInput);
    expect(runBeforePrompt).toHaveBeenCalledWith(expect.objectContaining({
      sendInput,
      runtimeInput,
      thread,
      visibleUserContent: "visible user content",
      promptContent: "prompt before preflight",
      usesDedicatedReviewSession: false,
      runWorkspacePath: "/tmp/ambient-workspace",
      hooks: { onActivity },
    }));
    expect(result.context.promptContent).toBe("prepared prompt");
    expect(result.context.runtimeModel).toBe("example/model-id");
    expect(result.context.runtimeInput).toBe(runtimeInput);
    expect(result.context.sendInputWithSymphonyParentModePolicy).toBe(runtimeInput);
    expect(result.context.promptImageInputs).toEqual({ images: [], attachments: [] });
    expect(result.context.runEventScope.markRunActivity()).toBe(true);
    expect(onActivity).toHaveBeenCalledTimes(1);
  });

  it("resolves image inputs with dynamically discovered vision profiles", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-send-start-images-"));
    const imageBytes = Buffer.from("fake png bytes", "utf8");
    await writeFile(join(workspacePath, "screenshot.png"), imageBytes);
    const thread = threadSummary({
      model: "moonshotai/kimi-k2.6",
      workspacePath,
    });
    const sendInput = sendMessageInput({
      context: [{ kind: "file", path: "screenshot.png", name: "screenshot.png", size: imageBytes.length }],
    });
    const runtimeInput = {
      ...sendInput,
      visibleUserContent: "visible user content",
    } as RuntimeSendMessageInput;
    const sendLoop = sendLoopContext(runtimeInput, thread);

    const result = await prepareAgentRuntimeSendStartContext({
      ...baseInput(sendInput),
      sendPreflight: {
        resolveMainModelRuntimeProfile: () => discoveredKimiProfile(),
        sendInputWithSymphonyParentModeToolCapableModel: vi.fn(() => sendInput),
        runBeforePrompt: vi.fn(async () => ({
          kind: "continue",
          promptContent: "prepared prompt",
          runtimeModel: "moonshotai/kimi-k2.6",
        })),
      } as unknown as AgentRuntimeSendStartContextInput["sendPreflight"],
      sendPreparation: {
        prepareRuntimeSendLoopContext: vi.fn(() => sendLoop),
      } as unknown as AgentRuntimeSendStartContextInput["sendPreparation"],
      store: storeForThread(thread),
    });

    expect(result.kind).toBe("continue");
    if (result.kind !== "continue") return;
    expect(result.context.promptImageInputs.attachments).toEqual([
      { path: "screenshot.png", mimeType: "image/png", bytes: imageBytes.length },
    ]);
  });
});

function baseInput(sendInput: SendMessageInput): AgentRuntimeSendStartContextInput {
  return {
    input: sendInput,
    activeRuns: {
      get: vi.fn(() => undefined),
    },
    activeRunHandoff: {
      handleSendActiveRunHandoff: vi.fn(async () => false),
    } as unknown as AgentRuntimeSendStartContextInput["activeRunHandoff"],
    sendPreparation: {
      prepareRuntimeSendLoopContext: vi.fn(() => sendLoopContext(sendInput as RuntimeSendMessageInput, threadSummary())),
    } as unknown as AgentRuntimeSendStartContextInput["sendPreparation"],
    sendPreflight: {
      resolveMainModelRuntimeProfile: vi.fn((modelId) => resolveAmbientModelRuntimeProfile(modelId)),
      sendInputWithSymphonyParentModeToolCapableModel: vi.fn(() => sendInput),
      runBeforePrompt: vi.fn(async () => ({
        kind: "continue",
        promptContent: sendInput.content,
        runtimeModel: "example/model-id",
      })),
    } as unknown as AgentRuntimeSendStartContextInput["sendPreflight"],
    store: storeForThread(threadSummary()),
    getFeatureFlagSnapshot: () => resolveAmbientFeatureFlags({
      settings: {
        subagents: true,
        slashCommands: true,
        tencentDbMemory: true,
      },
    }),
    emit: vi.fn<(event: DesktopEvent) => void>(),
  };
}

function sendMessageInput(overrides: Partial<SendMessageInput> = {}): SendMessageInput {
  return {
    threadId: "thread-1",
    content: "hello",
    context: [],
    ...overrides,
  } as SendMessageInput;
}

function threadSummary(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "thread-1",
    kind: "chat",
    title: "Thread",
    createdAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-22T00:00:00.000Z",
    lastMessagePreview: "hello",
    messages: [],
    runs: [],
    workspacePath: "/tmp/ambient-workspace",
    permissionMode: "suggest",
    model: "example/model-id",
    ...overrides,
  } as unknown as ThreadSummary;
}

function discoveredKimiProfile(): AmbientModelRuntimeProfile {
  return {
    ...resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL),
    profileId: "ambient:moonshotai/kimi-k2.6",
    modelId: "moonshotai/kimi-k2.6",
    label: "Kimi K2.6",
    supportsVision: true,
  };
}

function sendLoopContext(runtimeInput: RuntimeSendMessageInput, thread: ThreadSummary): RuntimeSendLoopContext {
  return {
    runtimeInput,
    usesDedicatedReviewSession: false,
    visibleUserContent: runtimeInput.visibleUserContent ?? runtimeInput.content,
    hasWorkflowPlanEditIntent: false,
    thread,
    plannerFinalizationSources: [],
    runWorkspacePath: "/tmp/ambient-workspace",
    modelRuntimeSettingsForRun: {} as RuntimeSendLoopContext["modelRuntimeSettingsForRun"],
    piPreStreamTimeoutMs: 100,
    piStreamIdleTimeoutMs: 200,
    defaultToolExecutionIdleTimeoutMs: 300,
    emptyAssistantStallTimeoutMs: 400,
    promptContent: "prompt before preflight",
    shouldInjectBootstrap: false,
    retrySourceUserMessageId: "message-1",
    assistantFinalizationRetryMaxRetries: 2,
    interruptedToolCallRecoveryMaxRetries: 3,
    interruptedToolCallRecoveryAttemptsUsed: 1,
    canScheduleInterruptedToolCallRecovery: true,
  };
}

function storeForThread(thread: ThreadSummary): AgentRuntimeSendStartContextInput["store"] {
  return {
    getThread: vi.fn(() => thread),
    getWorkspace: vi.fn(() => ({
      name: "Workspace",
      path: "/tmp/ambient-workspace",
      statePath: "/tmp/ambient-workspace/.ambient",
      sessionPath: "/tmp/ambient-workspace/.ambient/session",
    })),
    finishPlannerPlanFinalizationAttempt: vi.fn((artifactId) => ({
      id: artifactId,
    } as PlannerPlanArtifact)),
  };
}
