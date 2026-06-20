import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentMemoryClearResult } from "../../shared/agentMemoryDiagnostics";
import type { DesktopState } from "../../shared/desktopTypes";
import type { LocalModelRuntimeLifecycleActionResult } from "../../shared/localRuntimeTypes";
import type { LocalDeepResearchSetupUiState } from "./RightPanel";
import {
  createAppSettingsActions,
  desktopStateWithUpdatedSettings,
  localDeepResearchSetupAfterLocalRuntimeAction,
} from "./AppSettingsActions";

describe("App settings actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("updates one settings section without replacing sibling sections", () => {
    const state = desktopState({
      settings: {
        media: { generatedMediaAutoplay: false },
        memory: {
          mode: "enabled_all",
          enabled: true,
          defaultThreadEnabled: true,
          adapter: "tencentdb",
          shortTermOffloadEnabled: true,
          embeddings: {
            enabled: false,
            providerMode: "ambient-managed",
            autoStartProvider: false,
            sendDimensions: false,
            maxInputChars: 512,
            timeoutMs: 10_000,
            preflightEnabled: true,
          },
          storageScope: "workspace",
        },
      },
    });

    expect(desktopStateWithUpdatedSettings(state, "media", { generatedMediaAutoplay: true }).settings).toEqual({
      media: { generatedMediaAutoplay: true },
      memory: {
        mode: "enabled_all",
        enabled: true,
        defaultThreadEnabled: true,
        adapter: "tencentdb",
        shortTermOffloadEnabled: true,
        embeddings: {
          enabled: false,
          providerMode: "ambient-managed",
          autoStartProvider: false,
          sendDimensions: false,
          maxInputChars: 512,
          timeoutMs: 10_000,
          preflightEnabled: true,
        },
        storageScope: "workspace",
      },
    });
  });

  it("updates Local Deep Research runtime inventory when a lifecycle result has after-state", () => {
    const current = {
      status: "ready",
      result: {
        setupStatus: "ready",
        localModelResources: { before: true },
        localRuntimeInventory: { before: true },
      },
    } as unknown as LocalDeepResearchSetupUiState;
    const result = {
      after: {
        localModelResources: { after: true },
        inventory: { runtimes: [] },
      },
    } as unknown as LocalModelRuntimeLifecycleActionResult;

    expect(localDeepResearchSetupAfterLocalRuntimeAction(current, result)).toEqual({
      status: "ready",
      result: {
        setupStatus: "ready",
        localModelResources: { after: true },
        localRuntimeInventory: { runtimes: [] },
      },
    });
  });

  it("preserves Local Deep Research setup when lifecycle result has no after-state", () => {
    const current = { status: "idle" } as LocalDeepResearchSetupUiState;
    expect(localDeepResearchSetupAfterLocalRuntimeAction(current, {} as LocalModelRuntimeLifecycleActionResult)).toBe(current);
  });

  it("clears Agent Memory through IPC without native confirmation", async () => {
    const clearResult = sampleAgentMemoryClearResult();
    const confirm = vi.fn();
    const clearAgentMemory = vi.fn(async () => clearResult);
    vi.stubGlobal("window", {
      ambientDesktop: { clearAgentMemory },
      confirm,
    });
    const actions = createAppSettingsActions({
      setLocalDeepResearchSetup: vi.fn(),
      setSearchRoutingHydrationError: vi.fn(),
      setSearchRoutingHydrating: vi.fn(),
      setState: vi.fn(),
      state: desktopState(),
    });

    await expect(actions.clearAgentMemory()).resolves.toEqual(clearResult);
    expect(clearAgentMemory).toHaveBeenCalledWith({ workspacePath: "/tmp/ambient-workspace" });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("merges sequential persisted settings sections into the latest local state", async () => {
    let localState = desktopState({
      settings: {
        featureFlags: { subagents: false, slashCommands: false, tencentDbMemory: false },
        memory: {
          mode: "disabled",
          enabled: false,
          defaultThreadEnabled: false,
          adapter: "tencentdb",
          shortTermOffloadEnabled: false,
          embeddings: {
            enabled: false,
            providerMode: "ambient-managed",
            autoStartProvider: false,
            sendDimensions: false,
            maxInputChars: 512,
            timeoutMs: 10_000,
            preflightEnabled: true,
          },
          storageScope: "workspace",
        },
      },
    });
    vi.stubGlobal("window", {
      ambientDesktop: {
        updateFeatureFlagSettings: vi.fn(async (featureFlags) => featureFlags),
        updateMemorySettings: vi.fn(async (memory) => memory),
      },
    });
    const actions = createAppSettingsActions({
      setLocalDeepResearchSetup: vi.fn(),
      setSearchRoutingHydrationError: vi.fn(),
      setSearchRoutingHydrating: vi.fn(),
      setState: (value) => {
        localState = typeof value === "function" ? value(localState) as DesktopState : value as DesktopState;
      },
      state: localState,
    });

    await actions.updateFeatureFlagSettings({ subagents: false, slashCommands: false, tencentDbMemory: true });
    await actions.updateMemorySettings({ ...localState.settings.memory, mode: "enabled_all" });

    expect(localState.settings.featureFlags).toEqual({ subagents: false, slashCommands: false, tencentDbMemory: true });
    expect(localState.settings.memory.mode).toBe("enabled_all");
  });
});

function desktopState(overrides: Omit<Partial<DesktopState>, "settings"> & {
  settings?: Partial<DesktopState["settings"]>;
} = {}): DesktopState {
  return {
    activeWorkspace: { path: "/tmp/ambient-workspace" },
    workspace: { path: "/tmp/ambient-workspace" },
    settings: {},
    ...overrides,
  } as DesktopState;
}

function sampleAgentMemoryClearResult(): AgentMemoryClearResult {
  return {
    adapter: "tencentdb",
    clearedAt: "2026-06-13T00:00:00.000Z",
    dataDir: "/tmp/ambient-memory/tencentdb",
    dataDirExisted: true,
    removedFileCount: 2,
    removedBytes: 128,
    activeSessionsReset: {
      disposedSessions: 1,
      deferredSessions: 0,
      disposedThreadIds: ["thread-1"],
      deferredThreadIds: [],
    },
  };
}
