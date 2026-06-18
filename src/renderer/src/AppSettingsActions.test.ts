import { describe, expect, it } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import type { LocalModelRuntimeLifecycleActionResult } from "../../shared/localRuntimeTypes";
import type { LocalDeepResearchSetupUiState } from "./RightPanel";
import {
  CLEAR_AGENT_MEMORY_CONFIRMATION,
  desktopStateWithUpdatedSettings,
  localDeepResearchSetupAfterLocalRuntimeAction,
} from "./AppSettingsActions";

describe("App settings actions", () => {
  it("updates one settings section without replacing sibling sections", () => {
    const state = desktopState({
      settings: {
        media: { generatedMediaAutoplay: false },
        memory: {
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

  it("keeps the agent memory clear confirmation copy stable", () => {
    expect(CLEAR_AGENT_MEMORY_CONFIRMATION).toBe(
      "Clear TencentDB Agent Memory for this workspace?\n\nThis removes locally stored experimental memory, resets active sessions, and leaves existing chat transcripts and workspace files unchanged.",
    );
  });
});

function desktopState(overrides: Omit<Partial<DesktopState>, "settings"> & {
  settings?: Partial<DesktopState["settings"]>;
} = {}): DesktopState {
  return {
    settings: {},
    ...overrides,
  } as DesktopState;
}
