import type { ContextUsage } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";

import type { DesktopEvent } from "../../shared/desktopTypes";
import type { AmbientCompactionSettings } from "../../shared/threadTypes";
import {
  PROMPT_PREFLIGHT_COMPACTED_MESSAGE,
  PROMPT_PREFLIGHT_COMPACTION_INSTRUCTIONS,
  runPromptPreflightBeforePrompt,
  type PromptPreflightRunStatus,
  type PromptPreflightSession,
} from "./agentRuntimePromptPreflight";

const compactionSettings: Pick<AmbientCompactionSettings, "reserveTokens" | "hardPreflightPercent"> = {
  reserveTokens: 16_384,
  hardPreflightPercent: 92,
};

interface PromptPreflightHarness {
  session: PromptPreflightSession;
  compactInstructions: string[];
  events: DesktopEvent[];
  statuses: PromptPreflightRunStatus[];
  snapshots: Array<{ threadId: string; message?: string }>;
  run(active?: () => boolean, promptContent?: string): Promise<void>;
}

function usage(input: Partial<ContextUsage>): ContextUsage {
  return {
    tokens: 42_000,
    contextWindow: 200_000,
    percent: 21,
    ...input,
  } as ContextUsage;
}

function createHarness(input: {
  usage?: ContextUsage | undefined;
  compactError?: Error;
} = {}): PromptPreflightHarness {
  const compactInstructions: string[] = [];
  const events: DesktopEvent[] = [];
  const statuses: PromptPreflightRunStatus[] = [];
  const snapshots: Array<{ threadId: string; message?: string }> = [];
  const session: PromptPreflightSession = {
    getContextUsage: () => input.usage ?? usage({ tokens: 20_000, contextWindow: 200_000 }),
    model: { contextWindow: 200_000 },
    compact: async (instructions?: string) => {
      compactInstructions.push(instructions ?? "");
      if (input.compactError) throw input.compactError;
    },
  };
  return {
    session,
    compactInstructions,
    events,
    statuses,
    snapshots,
    run: (active = () => true, promptContent = "hello") =>
      runPromptPreflightBeforePrompt({
        threadId: "thread-1",
        session,
        promptContent,
        compactionSettings,
        unavailableContextWindow: 120_000,
        setActiveRunStatus: (status) => statuses.push(status),
        isRunStoreActive: active,
        emitRunEvent: (event) => events.push(event),
        recordContextUsageSnapshot: (threadId, _session, message) => snapshots.push({ threadId, message }),
      }),
  };
}

describe("runPromptPreflightBeforePrompt", () => {
  it("does nothing when projected context stays below the compaction threshold", async () => {
    const harness = createHarness({
      usage: usage({ tokens: 20_000, contextWindow: 200_000 }),
    });

    await harness.run();

    expect(harness.compactInstructions).toEqual([]);
    expect(harness.events).toEqual([]);
    expect(harness.statuses).toEqual([]);
    expect(harness.snapshots).toEqual([]);
  });

  it("rejects prompts that cannot fit even after compaction", async () => {
    const harness = createHarness({ usage: undefined });

    await expect(harness.run(undefined, "x".repeat(800_000))).rejects.toThrow(
      "Remove attachments, split the request, or start with a smaller prompt.",
    );
    expect(harness.compactInstructions).toEqual([]);
    expect(harness.events).toEqual([]);
  });

  it("compacts before prompt delivery when projected context crosses the threshold", async () => {
    const harness = createHarness({
      usage: usage({ tokens: 183_000, contextWindow: 200_000 }),
    });

    await harness.run(undefined, "x".repeat(8_000));

    expect(harness.statuses).toEqual(["compacting", "streaming"]);
    expect(harness.compactInstructions).toEqual([PROMPT_PREFLIGHT_COMPACTION_INSTRUCTIONS]);
    expect(harness.snapshots).toEqual([
      {
        threadId: "thread-1",
        message: "Projected context is 93%, above the 92% hard preflight threshold.",
      },
      {
        threadId: "thread-1",
        message: PROMPT_PREFLIGHT_COMPACTED_MESSAGE,
      },
    ]);
    expect(harness.events).toEqual([
      {
        type: "runtime-activity",
        activity: {
          threadId: "thread-1",
          kind: "compaction",
          status: "starting",
          reason: "threshold",
        },
      },
      {
        type: "runtime-activity",
        activity: {
          threadId: "thread-1",
          kind: "compaction",
          status: "finished",
          reason: "threshold",
          aborted: false,
          willRetry: false,
          message: PROMPT_PREFLIGHT_COMPACTED_MESSAGE,
        },
      },
    ]);
  });

  it("returns before compaction when the run is no longer active", async () => {
    const harness = createHarness({
      usage: usage({ tokens: 183_000, contextWindow: 200_000 }),
    });

    await harness.run(() => false, "x".repeat(8_000));

    expect(harness.statuses).toEqual([]);
    expect(harness.compactInstructions).toEqual([]);
    expect(harness.events).toEqual([]);
    expect(harness.snapshots).toEqual([]);
  });

  it("does not emit completion events when the run becomes inactive after compaction", async () => {
    const harness = createHarness({
      usage: usage({ tokens: 183_000, contextWindow: 200_000 }),
    });
    let activeChecks = 0;

    await harness.run(() => {
      activeChecks += 1;
      return activeChecks === 1;
    }, "x".repeat(8_000));

    expect(harness.statuses).toEqual(["compacting"]);
    expect(harness.compactInstructions).toEqual([PROMPT_PREFLIGHT_COMPACTION_INSTRUCTIONS]);
    expect(harness.events).toHaveLength(1);
    expect(harness.snapshots).toEqual([
      {
        threadId: "thread-1",
        message: "Projected context is 93%, above the 92% hard preflight threshold.",
      },
    ]);
  });

  it("emits a failed compaction event and rethrows when compaction fails", async () => {
    const harness = createHarness({
      usage: usage({ tokens: 183_000, contextWindow: 200_000 }),
      compactError: new Error("compaction failed"),
    });

    await expect(harness.run(undefined, "x".repeat(8_000))).rejects.toThrow("compaction failed");

    expect(harness.statuses).toEqual(["compacting"]);
    expect(harness.events.at(-1)).toEqual({
      type: "runtime-activity",
      activity: {
        threadId: "thread-1",
        kind: "compaction",
        status: "finished",
        reason: "threshold",
        aborted: false,
        willRetry: false,
        message: "compaction failed",
      },
    });
  });
});
