import { describe, expect, it, vi } from "vitest";

import type { ModelRuntimeSettings, ThreadSummary } from "../../shared/threadTypes";
import {
  generateAgentRuntimeThreadTitleIfNeeded,
  type AgentRuntimeThreadTitleGenerationOptions,
} from "./agentRuntimeThreadTitleGeneration";

describe("generateAgentRuntimeThreadTitleIfNeeded", () => {
  it("does nothing when the thread already has a title", async () => {
    const options = optionsStub({
      thread: threadSummary({ title: "Existing title" }),
    });

    generateAgentRuntimeThreadTitleIfNeeded(options);
    await flushTitleGeneration();

    expect(options.generateTitle).not.toHaveBeenCalled();
    expect(options.updateThreadTitle).not.toHaveBeenCalled();
    expect(options.emit).not.toHaveBeenCalled();
  });

  it("updates a still-new thread title and emits the updated thread", async () => {
    const updated = threadSummary({ title: "Generated title" });
    const options = optionsStub({
      generateTitle: vi.fn(async () => "Generated title"),
      updateThreadTitle: vi.fn(() => updated),
    });

    generateAgentRuntimeThreadTitleIfNeeded(options);
    await flushTitleGeneration();

    expect(options.generateTitle).toHaveBeenCalledWith({
      prompt: "Build a dashboard.",
      workspaceName: "Workspace",
      model: "example/model-id",
      retryPolicy: undefined,
    });
    expect(options.getThread).toHaveBeenCalledWith("thread-1");
    expect(options.updateThreadTitle).toHaveBeenCalledWith("thread-1", "Generated title");
    expect(options.emit).toHaveBeenCalledWith({ type: "thread-updated", thread: updated });
  });

  it("keeps a title changed while generation was in flight", async () => {
    const options = optionsStub({
      getThread: vi.fn(() => threadSummary({ title: "User renamed" })),
    });

    generateAgentRuntimeThreadTitleIfNeeded(options);
    await flushTitleGeneration();

    expect(options.updateThreadTitle).not.toHaveBeenCalled();
    expect(options.emit).not.toHaveBeenCalled();
  });

  it("warns when Ambient returns no title", async () => {
    const options = optionsStub({
      generateTitle: vi.fn(async () => undefined),
    });

    generateAgentRuntimeThreadTitleIfNeeded(options);
    await flushTitleGeneration();

    expect(options.warn).toHaveBeenCalledWith("Ambient thread title generation returned no title.");
    expect(options.updateThreadTitle).not.toHaveBeenCalled();
  });

  it("warns when title generation fails", async () => {
    const options = optionsStub({
      generateTitle: vi.fn(async () => {
        throw new Error("provider down");
      }),
    });

    generateAgentRuntimeThreadTitleIfNeeded(options);
    await flushTitleGeneration();

    expect(options.warn).toHaveBeenCalledWith("Ambient thread title generation failed: provider down");
    expect(options.updateThreadTitle).not.toHaveBeenCalled();
  });
});

function optionsStub(overrides: Partial<AgentRuntimeThreadTitleGenerationOptions> = {}): AgentRuntimeThreadTitleGenerationOptions {
  const thread = overrides.thread ?? threadSummary();
  return {
    thread,
    prompt: "Build a dashboard.",
    workspaceName: "Workspace",
    modelRuntimeSettings: { aggressiveRetries: false } as ModelRuntimeSettings,
    getThread: vi.fn(() => thread),
    updateThreadTitle: vi.fn((threadId, title) => threadSummary({ id: threadId, title })),
    emit: vi.fn(),
    generateTitle: vi.fn(async () => "Generated title"),
    warn: vi.fn(),
    ...overrides,
  };
}

function threadSummary(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "thread-1",
    title: "New chat",
    model: "example/model-id",
    workspacePath: "/workspace",
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
    ...overrides,
  } as ThreadSummary;
}

async function flushTitleGeneration(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
