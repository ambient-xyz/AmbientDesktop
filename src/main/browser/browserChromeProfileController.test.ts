import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { BrowserProfileMode } from "../../shared/browserTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { BrowserChromeSessionStore } from "./browserChromeSessionStore";
import { BrowserChromeProfileController } from "./browserChromeProfileController";

describe("BrowserChromeProfileController", () => {
  it("copies Chrome profile state with the existing safety filter and metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-profile-"));
    const source = join(root, "source-profile");
    await mkdir(join(source, "Default", "Cache"), { recursive: true });
    await mkdir(join(source, "Default", "Code Cache"), { recursive: true });
    await writeFile(join(source, "Default", "Cookies"), "cookie-db", "utf8");
    await writeFile(join(source, "Default", "Cache", "data"), "cache", "utf8");
    await writeFile(join(source, "Default", "Code Cache", "bytecode"), "cache", "utf8");
    await writeFile(join(source, "SingletonLock"), "lock", "utf8");
    const { controller, store, lastActivity, lastError } = createController(root, {
      chromeProfileSourcePath: () => source,
    });

    const metadata = await controller.copyProfile();
    const paths = store.paths();

    expect(await pathExists(join(paths.copiedProfile, "Default", "Cookies"))).toBe(true);
    expect(await pathExists(join(paths.copiedProfile, "Default", "Cache", "data"))).toBe(false);
    expect(await pathExists(join(paths.copiedProfile, "Default", "Code Cache", "bytecode"))).toBe(false);
    expect(await pathExists(join(paths.copiedProfile, "SingletonLock"))).toBe(false);
    expect(metadata.sourceProfilePath).toBe(source);
    expect(metadata.copiedProfilePath).toBe(paths.copiedProfile);
    expect(JSON.parse(await readFile(paths.copiedProfileMetadata, "utf8"))).toMatchObject({
      sourceProfilePath: source,
      copiedProfilePath: paths.copiedProfile,
    });
    expect(controller.copiedProfileState()).toMatchObject({
      available: true,
      sourceProfilePath: source,
    });
    expect(lastActivity()).toBe("Copied Chrome profile into Ambient-controlled state.");
    expect(lastError()).toBeUndefined();

    const runtimeProfile = join(root, "runtime-profile");
    await controller.copyCopiedProfileToRuntime(runtimeProfile);
    expect(await pathExists(join(runtimeProfile, "Default", "Cookies"))).toBe(true);
    expect(await pathExists(join(runtimeProfile, "Default", "Cache", "data"))).toBe(false);
  });

  it("clears copied and isolated profile state through the existing stop and user-action side effects", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-profile-clear-"));
    let profileMode: BrowserProfileMode = "copied";
    const stopChrome = vi.fn(async () => undefined);
    const clearUserActions = vi.fn();
    const { controller, store, lastActivity, lastError } = createController(root, {
      getProfileMode: () => profileMode,
      isChromeRunning: () => true,
      stopChrome,
      clearUserActions,
    });
    const paths = store.paths();
    await mkdir(paths.copiedProfile, { recursive: true });
    await writeFile(paths.copiedProfileMetadata, "{}", "utf8");
    await mkdir(paths.isolatedProfile, { recursive: true });

    await controller.clearCopiedProfile();

    expect(stopChrome).toHaveBeenCalledWith("Copied browser profile is being cleared.");
    expect(await pathExists(paths.copiedProfile)).toBe(false);
    expect(await pathExists(paths.copiedProfileMetadata)).toBe(false);
    expect(lastActivity()).toBe("Cleared copied Chrome profile.");
    expect(lastError()).toBeUndefined();

    profileMode = "isolated";
    await controller.clearIsolatedProfile();

    expect(stopChrome).toHaveBeenCalledWith("Isolated browser profile is being cleared.");
    expect(clearUserActions).toHaveBeenCalledWith("Cleared isolated browser profile.");
    expect(await pathExists(paths.isolatedProfile)).toBe(false);
    expect(lastActivity()).toBe("Cleared isolated browser profile.");
    expect(lastError()).toBeUndefined();
  });
});

function createController(
  root: string,
  overrides: Partial<{
    chromeProfileSourcePath: () => string | undefined;
    clearUserActions: (reason: string) => void;
    getProfileMode: () => BrowserProfileMode;
    isChromeRunning: () => boolean;
    stopChrome: (reason: string) => Promise<void>;
  }> = {},
): {
  controller: BrowserChromeProfileController;
  lastActivity: () => string | undefined;
  lastError: () => string | undefined;
  store: BrowserChromeSessionStore;
} {
  let activity: string | undefined;
  let error: string | undefined = "previous error";
  const store = new BrowserChromeSessionStore(() => workspace(root));
  const controller = new BrowserChromeProfileController({
    chromeSessions: store,
    chromeProfileSourcePath: overrides.chromeProfileSourcePath,
    clearUserActions: overrides.clearUserActions ?? vi.fn(),
    getProfileMode: overrides.getProfileMode ?? (() => "isolated"),
    isChromeRunning: overrides.isChromeRunning ?? (() => false),
    setLastActivity: (message) => {
      activity = message;
    },
    setLastError: (message) => {
      error = message;
    },
    stopChrome: overrides.stopChrome ?? vi.fn(async () => undefined),
  });
  return {
    controller,
    lastActivity: () => activity,
    lastError: () => error,
    store,
  };
}

function workspace(root: string): WorkspaceState {
  return {
    path: join(root, "workspace"),
    name: "Workspace",
    statePath: join(root, "state"),
    sessionPath: join(root, "session"),
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
