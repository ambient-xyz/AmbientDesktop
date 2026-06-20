import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  BrowserChromeSessionStore,
  browserPathsForWorkspace,
  browserSessionLifecycleEvent,
} from "./browserChromeSessionStore";

describe("browser chrome session store", () => {
  it("derives all browser state paths from the workspace state path", () => {
    const paths = browserPathsForWorkspace(workspace("/repo", "/repo/.ambient-state"));

    expect(paths.root).toBe("/repo/.ambient-state/browser");
    expect(paths.copiedProfile).toBe("/repo/.ambient-state/browser/copied-chrome-profile");
    expect(paths.copiedProfileMetadata).toBe("/repo/.ambient-state/browser/copied-chrome-profile.json");
    expect(paths.profilesRoot).toBe("/repo/.ambient-state/browser/profiles");
    expect(paths.isolatedProfile).toBe("/repo/.ambient-state/browser/profiles/isolated-chrome");
    expect(paths.sessionsRoot).toBe("/repo/.ambient-state/browser/sessions");
    expect(paths.sessionManifests).toBe("/repo/.ambient-state/browser/session-manifests");
    expect(paths.screenshots).toBe("/repo/.ambient-state/browser/screenshots");
  });

  it("persists, validates, and updates Chrome session manifests for the active workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-session-store-"));
    const ticks = ["2026-06-20T10:00:00.000Z", "2026-06-20T10:01:00.000Z", "2026-06-20T10:02:00.000Z"];
    const store = new BrowserChromeSessionStore(
      () => workspace(join(root, "workspace"), join(root, "state")),
      () => ticks.shift() ?? "2026-06-20T10:03:00.000Z",
    );

    await store.write({
      sessionId: "session-1",
      profileMode: "isolated",
      profilePath: join(root, "state", "browser", "profiles", "isolated-chrome"),
      profileEphemeral: false,
      processId: 123,
      devToolsPort: 9222,
      browserWsUrl: "ws://127.0.0.1:9222/devtools/browser/session-1",
      activeTargetId: "target-1",
    });
    await store.write({
      sessionId: "session-1",
      profileMode: "isolated",
      profilePath: join(root, "state", "browser", "profiles", "isolated-chrome"),
      profileEphemeral: false,
      devToolsPort: 9223,
      browserWsUrl: "ws://127.0.0.1:9223/devtools/browser/session-1",
      activeTargetId: "target-2",
    });

    await expect(store.read("isolated")).resolves.toMatchObject({
      id: "session-1",
      workspacePath: join(root, "workspace"),
      profileMode: "isolated",
      profileEphemeral: false,
      processId: 123,
      devToolsPort: 9223,
      browserWsUrl: "ws://127.0.0.1:9223/devtools/browser/session-1",
      activeTargetId: "target-2",
      createdAt: "2026-06-20T10:00:00.000Z",
      lastUsedAt: "2026-06-20T10:01:00.000Z",
    });
  });

  it("ignores malformed or foreign-workspace manifests", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-session-invalid-"));
    const store = new BrowserChromeSessionStore(() => workspace(join(root, "workspace"), join(root, "state")));
    await mkdir(store.paths().sessionManifests, { recursive: true });

    await writeFile(store.manifestPath("isolated"), JSON.stringify({ id: "session-1", workspacePath: "/other", profileMode: "isolated" }), "utf8");
    await expect(store.read("isolated")).resolves.toBeUndefined();

    await writeFile(store.manifestPath("isolated"), "{", "utf8");
    await expect(store.read("isolated")).resolves.toBeUndefined();
  });

  it("clears profile-specific manifests", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-session-clear-"));
    const store = new BrowserChromeSessionStore(() => workspace(join(root, "workspace"), join(root, "state")));
    await mkdir(store.paths().sessionManifests, { recursive: true });
    await writeFile(store.manifestPath("copied"), "{}", "utf8");

    await store.clear("copied");

    await expect(readFile(store.manifestPath("copied"), "utf8")).rejects.toThrow();
  });

  it("builds lifecycle events with optional session ids", () => {
    expect(browserSessionLifecycleEvent("preserved", "Waiting for user action.", "copied", "session-2", () => "2026-06-20T11:00:00.000Z")).toEqual({
      action: "preserved",
      reason: "Waiting for user action.",
      at: "2026-06-20T11:00:00.000Z",
      profileMode: "copied",
      sessionId: "session-2",
    });
    expect(browserSessionLifecycleEvent("closed", "Stopped.", "isolated", undefined, () => "2026-06-20T11:01:00.000Z")).toEqual({
      action: "closed",
      reason: "Stopped.",
      at: "2026-06-20T11:01:00.000Z",
      profileMode: "isolated",
    });
  });
});

function workspace(path: string, statePath: string) {
  return {
    path,
    name: "workspace",
    statePath,
    sessionPath: join(statePath, "sessions"),
  };
}
