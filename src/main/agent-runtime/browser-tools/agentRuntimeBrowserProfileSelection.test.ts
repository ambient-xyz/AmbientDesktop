import { describe, expect, it, vi } from "vitest";
import type { BrowserCapabilityState } from "../../../shared/browserTypes";
import {
  isBrowserProfileMode,
  prepareAgentRuntimeBrowserToolProfile,
} from "./agentRuntimeBrowserProfileSelection";

describe("agentRuntimeBrowserProfileSelection", () => {
  it("selects isolated managed Chrome by default and explains an internal-browser handoff", async () => {
    const updates: string[] = [];
    const copyChromeProfile = vi.fn();
    const recordBrowserProfileAudit = vi.fn();
    const emitBrowserState = vi.fn();

    const result = await prepareAgentRuntimeBrowserToolProfile({
      input: {},
      onUpdate: (update) => updates.push(update.content[0]?.text ?? ""),
    }, {
      getBrowserState: async () => browserState({ running: true, runtime: "internal" }),
      copyChromeProfile,
      recordBrowserProfileAudit,
      emitBrowserState,
    });

    expect(result).toEqual({ profileMode: "isolated", runtime: "chrome" });
    expect(updates).toEqual([
      "Using managed Chrome for agent browser work; the internal browser is reserved for explicit preview/user actions.",
      "Using isolated managed Chrome profile for agent browser work.",
    ]);
    expect(copyChromeProfile).not.toHaveBeenCalled();
    expect(recordBrowserProfileAudit).not.toHaveBeenCalled();
    expect(emitBrowserState).not.toHaveBeenCalled();
  });

  it("copies the Chrome profile when copied mode is requested without an available copy", async () => {
    const updates: string[] = [];
    const recordBrowserProfileAudit = vi.fn();
    const emitBrowserState = vi.fn();

    const result = await prepareAgentRuntimeBrowserToolProfile({
      input: { profileMode: "copied" },
      onUpdate: (update) => updates.push(update.content[0]?.text ?? ""),
    }, {
      getBrowserState: async () => browserState({ copiedProfileAvailable: false, sourceProfilePath: "/source" }),
      copyChromeProfile: async () => browserState({
        copiedProfileAvailable: true,
        copiedProfileSourcePath: "/copied-source",
        copiedProfilePath: "/copy",
      }),
      recordBrowserProfileAudit,
      emitBrowserState,
    });

    expect(result).toEqual({ profileMode: "copied", runtime: "chrome" });
    expect(updates).toEqual([
      "Using requested copied browser profile mode.",
      "Copying Chrome profile for default browser access.",
    ]);
    expect(recordBrowserProfileAudit).toHaveBeenCalledWith("Source: /copied-source\nCopy: /copy");
    expect(emitBrowserState).toHaveBeenCalledOnce();
  });

  it("honors explicit internal runtime when allowed", async () => {
    const result = await prepareAgentRuntimeBrowserToolProfile({
      input: { runtime: "internal", allowInternalRuntime: true },
    }, {
      getBrowserState: async () => browserState({ internalAvailable: true }),
      copyChromeProfile: vi.fn(),
      recordBrowserProfileAudit: vi.fn(),
      emitBrowserState: vi.fn(),
    });

    expect(result).toEqual({ profileMode: "isolated", runtime: "internal" });
  });

  it("reuses a running internal preview when a control tool allows internal runtime", async () => {
    const result = await prepareAgentRuntimeBrowserToolProfile({
      input: { allowInternalRuntime: true },
    }, {
      getBrowserState: async () => browserState({ running: true, runtime: "internal", internalAvailable: true }),
      copyChromeProfile: vi.fn(),
      recordBrowserProfileAudit: vi.fn(),
      emitBrowserState: vi.fn(),
    });

    expect(result).toEqual({ profileMode: "isolated", runtime: "internal" });
  });

  it("recognizes browser profile modes", () => {
    expect(isBrowserProfileMode("isolated")).toBe(true);
    expect(isBrowserProfileMode("copied")).toBe(true);
    expect(isBrowserProfileMode("internal")).toBe(false);
    expect(isBrowserProfileMode(undefined)).toBe(false);
  });
});

function browserState(overrides: Partial<BrowserCapabilityState> = {}): BrowserCapabilityState {
  return {
    running: false,
    profileMode: "isolated",
    runtime: "chrome",
    internalAvailable: true,
    copiedProfileAvailable: true,
    chromeAvailable: true,
    browserLoginBrokerAvailable: false,
    ...overrides,
  };
}
