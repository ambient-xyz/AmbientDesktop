import { describe, expect, it, vi } from "vitest";

import {
  AMBIENT_DEFAULT_MODEL,
  AMBIENT_LOCAL_TEXT_MODEL,
  resolveAmbientModelRuntimeProfile,
  type AmbientModelRuntimeProfile,
} from "../../shared/ambientModels";
import type { SendMessageInput } from "../../shared/desktopTypes";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { LocalTextSubagentRuntimeConfig } from "./agentRuntimeLocalRuntimeFacade";
import {
  AgentRuntimeSendPreflightController,
  type AgentRuntimeSendPreflightControllerOptions,
} from "./agentRuntimeSendPreflightController";

describe("AgentRuntimeSendPreflightController", () => {
  it("routes Symphony parent mode away from local text main models", () => {
    const controller = createController({
      features: {
        localTextSubagents: {
          resolveModelRuntimeProfile: () => localTextProfile(),
        },
      },
    });
    const sendInput = sendMessageInput({ model: AMBIENT_LOCAL_TEXT_MODEL });

    expect(controller.sendInputWithSymphonyParentModeToolCapableModel(
      sendInput,
      thread({ model: AMBIENT_LOCAL_TEXT_MODEL }),
      { kind: "explicit" } as unknown as Parameters<
        AgentRuntimeSendPreflightController["sendInputWithSymphonyParentModeToolCapableModel"]
      >[2],
    )).toEqual({
      ...sendInput,
      model: AMBIENT_DEFAULT_MODEL,
    });
  });

  it("persists a blocked explicit sub-agent preflight before opening a prompt session", async () => {
    const store = createStore();
    const emitRunEvent = vi.fn();
    const finishPlannerFinalizationSources = vi.fn();
    const onActivity = vi.fn();
    const controller = createController({
      store,
      getFeatureFlagSnapshot: () => resolveAmbientFeatureFlags(),
    });

    const result = await controller.runBeforePrompt({
      sendInput: sendMessageInput({ content: "Use one feedback subagent and one judge subagent." }),
      runtimeInput: sendMessageInput() as Parameters<AgentRuntimeSendPreflightController["runBeforePrompt"]>[0]["runtimeInput"],
      thread: thread(),
      visibleUserContent: "Use one feedback subagent and one judge subagent.",
      promptContent: "model prompt",
      usesDedicatedReviewSession: false,
      shouldInjectBootstrap: false,
      runWorkspacePath: "/repo",
      finishPlannerFinalizationSources,
      emitRunEvent,
      hooks: { onActivity },
    });

    expect(result).toEqual({ kind: "handled" });
    expect(store.addMessage).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining("I will not simulate sub-agents"),
      metadata: expect.objectContaining({ preflightBlock: "subagent_unavailable" }),
      role: "assistant",
      threadId: "thread-1",
    }));
    expect(store.startRun).toHaveBeenCalledWith({ threadId: "thread-1", assistantMessageId: "assistant-1" });
    expect(store.finishRun).toHaveBeenCalledWith(
      "run-1",
      "error",
      "ambient.subagents is disabled.",
    );
    expect(finishPlannerFinalizationSources).toHaveBeenCalledWith("failed", {
      error: "ambient.subagents is disabled.",
      workflowState: "failed",
    });
    expect(emitRunEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: "error",
      message: "ambient.subagents is disabled.",
    }));
    expect(onActivity).toHaveBeenCalledTimes(1);
  });

  it("runs configured local text main turns before the Pi prompt loop", async () => {
    const runLocalTextMainRun = vi.fn(async () => undefined);
    const runtimeFeature = {
      resolveModelRuntimeProfile: () => localTextProfile(),
      resolveRuntimeForMain: () => localRuntimeConfig(),
    };
    const controller = createController({
      features: {
        localTextSubagents: runtimeFeature,
      },
      runLocalTextMainRun,
    });
    const input = sendMessageInput({ model: AMBIENT_LOCAL_TEXT_MODEL });

    const result = await controller.runBeforePrompt({
      sendInput: input,
      runtimeInput: input as Parameters<AgentRuntimeSendPreflightController["runBeforePrompt"]>[0]["runtimeInput"],
      thread: thread({ model: AMBIENT_LOCAL_TEXT_MODEL }),
      visibleUserContent: "hello",
      promptContent: "model prompt",
      usesDedicatedReviewSession: false,
      shouldInjectBootstrap: false,
      runWorkspacePath: "/repo",
      finishPlannerFinalizationSources: vi.fn(),
      emitRunEvent: vi.fn(),
      hooks: {},
    });

    expect(result).toEqual({ kind: "handled" });
    expect(runLocalTextMainRun).toHaveBeenCalledWith(expect.objectContaining({
      input,
      promptContent: "model prompt",
      model: expect.objectContaining({
        modelId: AMBIENT_LOCAL_TEXT_MODEL,
        providerId: "local",
      }),
    }), expect.objectContaining({
      runtimeFeature,
    }));
  });

  it("keeps dedicated review sessions on the Pi prompt path even with a local text profile", async () => {
    const runLocalTextMainRun = vi.fn(async () => undefined);
    const controller = createController({
      features: {
        localTextSubagents: {
          resolveModelRuntimeProfile: () => localTextProfile(),
          resolveRuntimeForMain: () => localRuntimeConfig(),
        },
      },
      runLocalTextMainRun,
    });
    const input = sendMessageInput({ model: AMBIENT_LOCAL_TEXT_MODEL });

    const result = await controller.runBeforePrompt({
      sendInput: input,
      runtimeInput: input as Parameters<AgentRuntimeSendPreflightController["runBeforePrompt"]>[0]["runtimeInput"],
      thread: thread({ model: AMBIENT_LOCAL_TEXT_MODEL }),
      visibleUserContent: "review",
      promptContent: "model prompt",
      usesDedicatedReviewSession: true,
      shouldInjectBootstrap: false,
      runWorkspacePath: "/repo",
      finishPlannerFinalizationSources: vi.fn(),
      emitRunEvent: vi.fn(),
      hooks: {},
    });

    expect(result).toEqual({
      kind: "continue",
      promptContent: "model prompt",
      runtimeModel: AMBIENT_LOCAL_TEXT_MODEL,
    });
    expect(runLocalTextMainRun).not.toHaveBeenCalled();
  });
});

function createController(
  overrides: Partial<AgentRuntimeSendPreflightControllerOptions> = {},
): AgentRuntimeSendPreflightController {
  return new AgentRuntimeSendPreflightController({
    store: createStore(),
    features: {},
    fallbackRuntimeManager: {} as AgentRuntimeSendPreflightControllerOptions["fallbackRuntimeManager"],
    getFeatureFlagSnapshot: () => resolveAmbientFeatureFlags({ startup: { enabled: ["ambient.subagents"], disabled: [] } }),
    setActiveRun: vi.fn(),
    deleteActiveRun: vi.fn(),
    setActiveRunId: vi.fn(),
    deleteActiveRunId: vi.fn(),
    emit: vi.fn(),
    ...overrides,
  });
}

function createStore(): AgentRuntimeSendPreflightControllerOptions["store"] & {
  addMessage: ReturnType<typeof vi.fn>;
  startRun: ReturnType<typeof vi.fn>;
  finishRun: ReturnType<typeof vi.fn>;
} {
  return {
    addMessage: vi.fn((input: unknown) => ({
      ...(input as Record<string, unknown>),
      id: "assistant-1",
    })),
    startRun: vi.fn(() => ({ id: "run-1" })),
    finishRun: vi.fn(),
  } as unknown as AgentRuntimeSendPreflightControllerOptions["store"] & {
    addMessage: ReturnType<typeof vi.fn>;
    startRun: ReturnType<typeof vi.fn>;
    finishRun: ReturnType<typeof vi.fn>;
  };
}

function sendMessageInput(overrides: Partial<SendMessageInput> = {}): SendMessageInput {
  return {
    threadId: "thread-1",
    content: "hello",
    collaborationMode: "default",
    ...overrides,
  } as SendMessageInput;
}

function thread(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "thread-1",
    kind: "chat",
    model: AMBIENT_DEFAULT_MODEL,
    workspacePath: "/repo",
    permissionMode: "default",
    ...overrides,
  } as ThreadSummary;
}

function localTextProfile(overrides: Partial<AmbientModelRuntimeProfile> = {}): AmbientModelRuntimeProfile {
  return {
    ...resolveAmbientModelRuntimeProfile(AMBIENT_LOCAL_TEXT_MODEL),
    profileId: `local:${AMBIENT_LOCAL_TEXT_MODEL}:configured`,
    providerId: "local",
    modelId: AMBIENT_LOCAL_TEXT_MODEL,
    selectableAsMain: true,
    selectableAsSubagent: true,
    available: true,
    unavailableReason: undefined,
    toolUse: "none",
    locality: "local",
    ...overrides,
  };
}

function localRuntimeConfig(): LocalTextSubagentRuntimeConfig {
  return {
    launch: {
      runtimeId: "local-text-runtime",
      providerId: "local",
      modelId: AMBIENT_LOCAL_TEXT_MODEL,
      command: ["/runtime/local-text", "serve"],
      cwd: "/repo",
      estimatedResidentMemoryBytes: 1024,
    },
    completionUrl: "http://127.0.0.1:48999/v1/chat/completions",
  } as unknown as LocalTextSubagentRuntimeConfig;
}
