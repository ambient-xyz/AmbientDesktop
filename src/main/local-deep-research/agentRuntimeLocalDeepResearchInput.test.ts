import { describe, expect, it } from "vitest";

import {
  formatLocalDeepResearchBytes,
  localDeepResearchRequestedLaunchFromContract,
  localDeepResearchSetupToolInput,
} from "./agentRuntimeLocalDeepResearchInput";
import type { LocalDeepResearchSetupContract } from "./localDeepResearchSetup";

describe("AgentRuntime Local Deep Research input helpers", () => {
  it("formats memory byte counts with existing units and precision", () => {
    expect(formatLocalDeepResearchBytes(Number.NaN)).toBe("0 B");
    expect(formatLocalDeepResearchBytes(-1)).toBe("0 B");
    expect(formatLocalDeepResearchBytes(512)).toBe("512 B");
    expect(formatLocalDeepResearchBytes(1024)).toBe("1.00 KB");
    expect(formatLocalDeepResearchBytes(1536)).toBe("1.50 KB");
    expect(formatLocalDeepResearchBytes(5 * 1024 * 1024)).toBe("5.00 MB");
  });

  it("normalizes setup tool input without changing fallback behavior", () => {
    expect(localDeepResearchSetupToolInput(undefined)).toEqual({ action: "status" });
    expect(localDeepResearchSetupToolInput({ action: "status", q8Override: true })).toEqual({
      action: "status",
      q8Override: true,
    });
    expect(localDeepResearchSetupToolInput({ action: "install", q8Override: true })).toEqual({
      action: "install",
      q8Override: true,
    });
    expect(localDeepResearchSetupToolInput({ action: "repair", q8Override: false })).toEqual({ action: "repair" });
    expect(() => localDeepResearchSetupToolInput({ action: "remove" })).toThrow("action must be status, install, repair, validate, or smoke.");
  });

  it("builds the Local Deep Research resource launch request from setup contracts", () => {
    const contract = {
      modelInstall: {
        filename: "LitEResearcher-4B-Q4_K_M.gguf",
        selectedProfileId: "literesearcher-4b-q4-k-m",
        contextTokens: 8192,
      },
      installerShape: {
        memory: {
          estimatedResidentMemoryBytes: 4_000_000_000,
        },
      },
    } as LocalDeepResearchSetupContract;

    expect(localDeepResearchRequestedLaunchFromContract(contract, "thread-local-deep-research")).toMatchObject({
      capability: "local-deep-research",
      id: "local-deep-research:literesearcher-4b-q4-k-m:requested",
      ownerThreadId: "thread-local-deep-research",
      modelId: "LitEResearcher-4B-Q4_K_M.gguf",
      profileId: "literesearcher-4b-q4-k-m",
      contextTokens: 8192,
      estimatedResidentMemoryBytes: 4_000_000_000,
    });
  });
});
