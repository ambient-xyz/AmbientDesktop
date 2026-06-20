import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { DesktopEvent, SendMessageInput } from "../../shared/desktopTypes";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { WorkflowPlanEditIntentKind } from "../../shared/workflowThreadPlanEdit";
import { AgentRuntimeSendPreparationController, type RuntimeSendMessageInput } from "./agentRuntimeSendPreparationController";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";

async function withController<T>(
  callback: (input: {
    store: ProjectStore;
    controller: AgentRuntimeSendPreparationController;
    emitted: DesktopEvent[];
    deletePendingProjectSwitch: ReturnType<typeof vi.fn<(threadId: string) => void>>;
    setWorkflowPlanEditIntent: ReturnType<typeof vi.fn<(threadId: string, intent: WorkflowPlanEditIntentKind, workflowThreadId: string) => void>>;
    generateTitleIfNeeded: ReturnType<typeof vi.fn>;
    plannerFinalizationSourceArtifactsForPrompt: ReturnType<typeof vi.fn>;
  }) => Promise<T> | T,
): Promise<T> {
  const workspacePath = await mkdtemp(join(tmpdir(), "ambient-send-prep-controller-"));
  const store = new ProjectStore();
  const emitted: DesktopEvent[] = [];
  const deletePendingProjectSwitch = vi.fn<(threadId: string) => void>();
  const setWorkflowPlanEditIntent = vi.fn<(threadId: string, intent: WorkflowPlanEditIntentKind, workflowThreadId: string) => void>();
  const generateTitleIfNeeded = vi.fn();
  const plannerFinalizationSourceArtifactsForPrompt = vi.fn(() => []);
  try {
    store.openWorkspace(workspacePath);
    const controller = new AgentRuntimeSendPreparationController({
      store,
      getFeatureFlagSnapshot: () => resolveAmbientFeatureFlags({ settings: store.getFeatureFlagSettings() }),
      plannerFinalizationSourceArtifactsForPrompt,
      deletePendingProjectSwitch,
      setWorkflowPlanEditIntent,
      generateTitleIfNeeded,
      emit: (event) => emitted.push(event),
      workflowRecordingReviewStreamIdleTimeoutMs: 42_000,
      chatPiEmptyAssistantStallTimeoutMs: 12_000,
      defaultInterruptedToolCallRecoveryMaxRetries: 3,
      localToolIdleTimeoutMs: () => 9_000,
    });
    return await callback({
      store,
      controller,
      emitted,
      deletePendingProjectSwitch,
      setWorkflowPlanEditIntent,
      generateTitleIfNeeded,
      plannerFinalizationSourceArtifactsForPrompt,
    });
  } finally {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  }
}

describe("AgentRuntimeSendPreparationController", () => {
  it("adds the visible user message and computes send-loop defaults", async () => {
    await withController(({ store, controller, emitted, deletePendingProjectSwitch, generateTitleIfNeeded, plannerFinalizationSourceArtifactsForPrompt }) => {
      const thread = store.createThread("send prep");

      const context = controller.prepareRuntimeSendLoopContext(sendInput(thread.id, {
        content: "Build a dashboard.",
      }));

      const messages = store.listMessages(thread.id);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        role: "user",
        content: "Build a dashboard.",
      });
      expect(context).toMatchObject({
        usesDedicatedReviewSession: false,
        visibleUserContent: "Build a dashboard.",
        hasWorkflowPlanEditIntent: false,
        runWorkspacePath: store.getWorkspace().path,
        defaultToolExecutionIdleTimeoutMs: 9_000,
        emptyAssistantStallTimeoutMs: 12_000,
        shouldInjectBootstrap: true,
        retrySourceUserMessageId: messages[0].id,
        interruptedToolCallRecoveryMaxRetries: 3,
        interruptedToolCallRecoveryAttemptsUsed: 0,
        canScheduleInterruptedToolCallRecovery: true,
      });
      expect(context.promptContent).toContain("Build a dashboard.");
      expect(deletePendingProjectSwitch).toHaveBeenCalledWith(thread.id);
      expect(plannerFinalizationSourceArtifactsForPrompt).toHaveBeenCalledWith(thread.id, "Build a dashboard.");
      expect(generateTitleIfNeeded).toHaveBeenCalledWith(expect.objectContaining({ id: thread.id }), "Build a dashboard.");
      expect(emitted).toEqual([
        { type: "message-created", message: expect.objectContaining({ id: messages[0].id }) },
        { type: "thread-updated", thread: expect.objectContaining({ id: thread.id }) },
      ]);
    });
  });

  it("emits goal continuation activity without adding a visible user message", async () => {
    await withController(({ store, controller, emitted, generateTitleIfNeeded }) => {
      const thread = store.createThread("hidden continuation");

      const context = controller.prepareRuntimeSendLoopContext({
        ...sendInput(thread.id, { content: "Visible fallback content." }),
        hiddenUserMessage: true,
        visibleUserContent: "Continue the goal.",
        goalContinuation: { goalId: "goal-1" },
        delivery: "follow-up",
      } as RuntimeSendMessageInput);

      expect(store.listMessages(thread.id)).toHaveLength(0);
      expect(context.visibleUserContent).toBe("Continue the goal.");
      expect(context.shouldInjectBootstrap).toBe(false);
      expect(context.retrySourceUserMessageId).toBeUndefined();
      expect(generateTitleIfNeeded).not.toHaveBeenCalled();
      expect(emitted).toEqual([
        {
          type: "runtime-activity",
          activity: expect.objectContaining({
            threadId: thread.id,
            kind: "goal",
            status: "continuing",
            goalId: "goal-1",
          }),
        },
      ]);
    });
  });

  it("rejects retries that do not target a visible user message", async () => {
    await withController(({ store, controller }) => {
      const thread = store.createThread("bad retry");
      const assistant = store.addMessage({ threadId: thread.id, role: "assistant", content: "Prior assistant output." });

      expect(() =>
        controller.prepareRuntimeSendLoopContext(sendInput(thread.id, {
          content: "Retry it.",
          retryOfMessageId: assistant.id,
        })),
      ).toThrow("Retry target user message was not found.");
    });
  });

  it("uses workflow recording review timeout and retry settings for dedicated review sessions", async () => {
    await withController(({ store, controller }) => {
      const thread = store.createThread("review send");

      const context = controller.prepareRuntimeSendLoopContext({
        ...sendInput(thread.id, { content: "Review this recording." }),
        dedicatedSessionKind: "workflow-recording-review",
      } as RuntimeSendMessageInput);

      expect(context.usesDedicatedReviewSession).toBe(true);
      expect(context.modelRuntimeSettingsForRun.aggressiveRetries).toBe(true);
      expect(context.piPreStreamTimeoutMs).toBe(42_000);
      expect(context.piStreamIdleTimeoutMs).toBe(42_000);
      expect(context.emptyAssistantStallTimeoutMs).toBe(12_000);
      expect(context.canScheduleInterruptedToolCallRecovery).toBe(false);
    });
  });
});

function sendInput(threadId: string, overrides: Partial<SendMessageInput> = {}): SendMessageInput {
  return {
    threadId,
    content: "Build a small app.",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "ambient-preview",
    thinkingLevel: "minimal",
    delivery: "prompt",
    context: [],
    ...overrides,
  };
}
