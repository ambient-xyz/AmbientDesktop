import { describe, expect, it } from "vitest";

import {
  BrowserServiceStateSnapshotController,
  browserServiceStateSnapshot,
} from "./browserServiceStateSnapshot";
import type { BrowserPaths } from "./browserChromeSessionStore";

describe("browserServiceStateSnapshot", () => {
  it("builds internal and Chrome snapshots from controller dependencies", async () => {
    const paths = pathsStub("/state/browser");
    const controller = new BrowserServiceStateSnapshotController({
      getInternalState: async () => ({
        running: true,
        activeTab: { id: "internal", title: "Preview", url: "http://127.0.0.1:4100/" },
        viewVisible: true,
      }),
      isChromeRunning: () => true,
      getProfileMode: () => "isolated",
      getLastActiveTab: () => ({ id: "target-1", title: "Calculator", url: "http://127.0.0.1:4100/" }),
      getLastActivity: () => "Last service activity.",
      getLastError: () => "Last service error.",
      getLastSessionEvent: () => undefined,
      getActivePicker: () => undefined,
      getUserAction: () => undefined,
      getSessionId: () => "session-1",
      getProcessId: () => 1234,
      getDevToolsPort: () => 9333,
      getActiveTargetId: () => "target-1",
      getRuntimeProfilePath: () => "/state/browser/profiles/isolated-chrome",
      getAttachedToExistingSession: () => false,
      hasInternalBrowser: () => true,
      browserLoginBrokerAvailable: () => true,
      chromeAvailability: () => ({ available: true }),
      chromeProfileSourcePath: () => undefined,
      browserPaths: () => paths,
      copiedProfile: () => ({ available: false }),
    });

    await expect(controller.internalStateSnapshot()).resolves.toMatchObject({
      runtime: "internal",
      activeTab: { id: "internal" },
      lastActivity: "Last service activity.",
      lastError: "Last service error.",
      viewVisible: true,
    });
    expect(controller.chromeStateSnapshot()).toMatchObject({
      runtime: "chrome",
      activeTab: { id: "target-1" },
      sessionId: "session-1",
      processId: 1234,
      devToolsPort: 9333,
      attachedToExistingSession: false,
    });
  });

  it("assembles Chrome capability state from explicit runtime inputs", () => {
    const paths = pathsStub("/state/browser");

    expect(
      browserServiceStateSnapshot({
        runtime: "chrome",
        running: true,
        profileMode: "isolated",
        internalAvailable: true,
        browserLoginBrokerAvailable: false,
        chrome: { available: false, unavailableReason: "Chrome missing" },
        sourceProfilePath: "/Users/example/Chrome",
        paths,
        copiedProfile: {
          available: true,
          sourceProfilePath: "/Users/example/Chrome",
          copiedAt: "2026-06-22T09:00:00.000Z",
        },
        activePicker: {
          prompt: "Pick a button",
          profileMode: "isolated",
          startedAt: "2026-06-22T09:01:00.000Z",
        },
        activeTab: { id: "target-1", title: "Calculator", url: "http://127.0.0.1:4100/" },
        userAction: {
          id: "action-1",
          active: true,
          status: "waiting",
          kind: "login",
          runtime: "chrome",
          profileMode: "isolated",
          toolName: "browser_nav",
          startedAt: "2026-06-22T09:02:00.000Z",
          lastCheckedAt: "2026-06-22T09:02:01.000Z",
          canAutoResume: true,
          message: "Sign in required.",
        },
        sessionId: "session-1",
        processId: 1234,
        devToolsPort: 9333,
        activeTargetId: "target-1",
        runtimeProfilePath: "/state/browser/profiles/isolated-chrome",
        attachedToExistingSession: true,
        lastSessionEvent: {
          action: "reattached",
          at: "2026-06-22T09:03:00.000Z",
          profileMode: "isolated",
          reason: "Reattached.",
          sessionId: "session-1",
        },
        lastActivity: "Ready.",
        lastError: "Previous warning.",
      }),
    ).toMatchObject({
      running: true,
      runtime: "chrome",
      internalAvailable: true,
      browserLoginBrokerAvailable: false,
      chromeAvailable: false,
      chromeUnavailableReason: "Chrome missing",
      sourceProfilePath: "/Users/example/Chrome",
      isolatedProfilePath: paths.isolatedProfile,
      copiedProfileAvailable: true,
      copiedProfileSourcePath: "/Users/example/Chrome",
      copiedProfileCopiedAt: "2026-06-22T09:00:00.000Z",
      pickerActive: true,
      pickerPrompt: "Pick a button",
      activeTab: { id: "target-1" },
      userAction: { id: "action-1" },
      sessionId: "session-1",
      processId: 1234,
      devToolsPort: 9333,
      activeTargetId: "target-1",
      profilePath: "/state/browser/profiles/isolated-chrome",
      attachedToExistingSession: true,
      lastSessionEvent: { action: "reattached" },
      lastActivity: "Ready.",
      lastError: "Previous warning.",
    });
  });

  it("omits Chrome runtime-only fields for internal snapshots", () => {
    const snapshot = browserServiceStateSnapshot({
      runtime: "internal",
      running: true,
      profileMode: "isolated",
      internalAvailable: true,
      browserLoginBrokerAvailable: true,
      chrome: { available: true },
      paths: pathsStub("/state/browser"),
      copiedProfile: { available: false },
      activeTab: { id: "internal", title: "Preview", url: "http://127.0.0.1:4100/" },
      processId: 1234,
      devToolsPort: 9333,
      activeTargetId: "target-1",
      runtimeProfilePath: "/state/browser/profiles/isolated-chrome",
      attachedToExistingSession: true,
      viewVisible: false,
    });

    expect(snapshot).toMatchObject({
      runtime: "internal",
      running: true,
      viewVisible: false,
      activeTab: { id: "internal" },
    });
    expect(snapshot).not.toHaveProperty("processId");
    expect(snapshot).not.toHaveProperty("devToolsPort");
    expect(snapshot).not.toHaveProperty("activeTargetId");
    expect(snapshot).not.toHaveProperty("profilePath");
    expect(snapshot).not.toHaveProperty("attachedToExistingSession");
  });
});

function pathsStub(root: string): BrowserPaths {
  return {
    root,
    copiedProfile: `${root}/copied-chrome-profile`,
    copiedProfileMetadata: `${root}/copied-chrome-profile.json`,
    profilesRoot: `${root}/profiles`,
    isolatedProfile: `${root}/profiles/isolated-chrome`,
    sessionsRoot: `${root}/sessions`,
    sessionManifests: `${root}/session-manifests`,
    screenshots: `${root}/screenshots`,
  };
}
