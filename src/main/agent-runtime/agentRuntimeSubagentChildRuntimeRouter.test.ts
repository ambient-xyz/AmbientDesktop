import { describe, expect, it, vi } from "vitest";
import {
  AMBIENT_LOCAL_TEXT_MODEL,
  createAmbientModelRuntimeSnapshotFromProfile,
  resolveAmbientModelRuntimeProfile,
  type AmbientModelRuntimeProfile,
} from "../../shared/ambientModels";
import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type { SubagentRunSummary } from "../../shared/subagentTypes";
import type { LocalTextRuntimeManagerLike, LocalTextSubagentRuntimeStore } from "./agentRuntimeLocalRuntimeFacade";
import type { AgentRuntimeSubagentChildRuntimeDefaultRuntime } from "./agentRuntimeSubagentChildRuntimeRouter";
import { AgentRuntimeSubagentChildRuntimeRouter } from "./agentRuntimeSubagentChildRuntimeRouter";
import type { SubagentChildRuntimeStartInput } from "./agentRuntimePiFacade";

describe("AgentRuntimeSubagentChildRuntimeRouter", () => {
  it("returns a stable local-text fallback when no local runtime is configured", async () => {
    const run = subagentRun(localTextProfile());
    const events: unknown[] = [];
    const defaultRuntime = defaultChildRuntime();
    const router = new AgentRuntimeSubagentChildRuntimeRouter({
      store: { getSubagentRun: () => run },
      defaultRuntime,
      createEventingStore: emptyEventingStore,
      fallbackRuntimeManager: runtimeManager(),
      subagentsDisabledRuntimeSnapshot: () => undefined,
    });

    const result = await router.startResolvedChildRun({
      run,
      emitEvent: (event: unknown) => events.push(event),
    } as unknown as SubagentChildRuntimeStartInput);

    expect(result).toMatchObject({
      started: false,
      run,
      message: "Local text sub-agent runtime is not configured.",
    });
    expect(events).toEqual([
      expect.objectContaining({
        type: "status",
        source: "child_runtime",
        status: "running",
        message: "Local text sub-agent runtime is not configured.",
      }),
    ]);
    expect(defaultRuntime.startChildRun).not.toHaveBeenCalled();
  });

  it("delegates non-local child starts to the default child runtime", async () => {
    const run = subagentRun(resolveAmbientModelRuntimeProfile("moonshotai/kimi-k2.7-code"));
    const defaultRuntime = defaultChildRuntime();
    defaultRuntime.startChildRun.mockReturnValue({
      started: true,
      run,
      message: "default child started",
    });
    const router = new AgentRuntimeSubagentChildRuntimeRouter({
      store: { getSubagentRun: () => run },
      defaultRuntime,
      createEventingStore: emptyEventingStore,
      fallbackRuntimeManager: runtimeManager(),
      subagentsDisabledRuntimeSnapshot: () => undefined,
    });

    const result = await router.startResolvedChildRun({
      run,
      emitEvent: vi.fn(),
    } as unknown as SubagentChildRuntimeStartInput);
    expect(result).toMatchObject({
      started: true,
      message: "default child started",
    });
    expect(defaultRuntime.startChildRun).toHaveBeenCalledTimes(1);
  });

  it("uses feature-disabled refusal before resolving local text runtime adapters", async () => {
    const run = subagentRun(localTextProfile());
    const disabledSnapshot = { ambientSubagents: false } as unknown as AmbientFeatureFlagSnapshot;
    const defaultRuntime = defaultChildRuntime();
    defaultRuntime.refuseStartBecauseFeatureDisabled.mockReturnValue({
      started: false,
      run,
      message: "disabled",
    });
    const createEventingStore = vi.fn(emptyEventingStore);
    const router = new AgentRuntimeSubagentChildRuntimeRouter({
      store: { getSubagentRun: () => run },
      runtimeFeature: {
        resolveRuntime: vi.fn(),
      },
      defaultRuntime,
      createEventingStore,
      fallbackRuntimeManager: runtimeManager(),
      subagentsDisabledRuntimeSnapshot: () => disabledSnapshot,
    });

    const result = await router.startResolvedChildRun({
      run,
      emitEvent: vi.fn(),
    } as unknown as SubagentChildRuntimeStartInput);
    expect(result).toMatchObject({
      started: false,
      message: "disabled",
    });
    expect(defaultRuntime.refuseStartBecauseFeatureDisabled).toHaveBeenCalledWith(expect.anything(), disabledSnapshot);
    expect(createEventingStore).not.toHaveBeenCalled();
  });
});

function localTextProfile(overrides: Partial<AmbientModelRuntimeProfile> = {}): AmbientModelRuntimeProfile {
  return {
    ...resolveAmbientModelRuntimeProfile(AMBIENT_LOCAL_TEXT_MODEL),
    profileId: `local:${AMBIENT_LOCAL_TEXT_MODEL}:configured`,
    selectableAsSubagent: true,
    available: true,
    unavailableReason: undefined,
    ...overrides,
  };
}

function subagentRun(profile: AmbientModelRuntimeProfile): SubagentRunSummary {
  return {
    id: "child-run",
    status: "running",
    modelRuntimeSnapshot: createAmbientModelRuntimeSnapshotFromProfile(profile.modelId, profile),
  } as SubagentRunSummary;
}

type MockDefaultRuntime = AgentRuntimeSubagentChildRuntimeDefaultRuntime & {
  [K in keyof AgentRuntimeSubagentChildRuntimeDefaultRuntime]: ReturnType<typeof vi.fn>;
};

function defaultChildRuntime(): MockDefaultRuntime {
  return {
    refuseStartBecauseFeatureDisabled: vi.fn(),
    refuseFollowupBecauseFeatureDisabled: vi.fn(),
    refuseRetryBecauseFeatureDisabled: vi.fn(),
    refuseApprovalResponseBecauseFeatureDisabled: vi.fn(),
    startChildRun: vi.fn(),
    waitForChildRun: vi.fn(),
    cancelChildRun: vi.fn(),
    followupChildRun: vi.fn(),
    retryChildRun: vi.fn(),
    resolveApprovalResponse: vi.fn(),
  } as unknown as MockDefaultRuntime;
}

function runtimeManager(): LocalTextRuntimeManagerLike {
  return {
    acquire: vi.fn(async () => {
      throw new Error("Local runtime acquisition should not be used by this router test.");
    }),
    activeRuntimeLeases: vi.fn(() => []),
  };
}

function emptyEventingStore(): LocalTextSubagentRuntimeStore {
  return {} as unknown as LocalTextSubagentRuntimeStore;
}
