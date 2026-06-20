import { mkdirSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  BrowserProfileMode,
  BrowserSessionLifecycleAction,
  BrowserSessionLifecycleEvent,
} from "../../shared/browserTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";

export interface BrowserPaths {
  root: string;
  copiedProfile: string;
  copiedProfileMetadata: string;
  profilesRoot: string;
  isolatedProfile: string;
  sessionsRoot: string;
  sessionManifests: string;
  screenshots: string;
}

export interface ChromeSessionManifest {
  id: string;
  workspacePath: string;
  profileMode: BrowserProfileMode;
  profilePath: string;
  profileEphemeral: boolean;
  processId?: number;
  devToolsPort: number;
  browserWsUrl: string;
  activeTargetId?: string;
  createdAt: string;
  lastUsedAt: string;
}

export interface ChromeSessionManifestWriteInput {
  sessionId: string;
  profileMode: BrowserProfileMode;
  profilePath: string;
  profileEphemeral: boolean;
  processId?: number;
  devToolsPort: number;
  browserWsUrl: string;
  activeTargetId?: string;
}

export function browserPathsForWorkspace(workspace: WorkspaceState): BrowserPaths {
  const root = join(workspace.statePath, "browser");
  return {
    root,
    copiedProfile: join(root, "copied-chrome-profile"),
    copiedProfileMetadata: join(root, "copied-chrome-profile.json"),
    profilesRoot: join(root, "profiles"),
    isolatedProfile: join(root, "profiles", "isolated-chrome"),
    sessionsRoot: join(root, "sessions"),
    sessionManifests: join(root, "session-manifests"),
    screenshots: join(root, "screenshots"),
  };
}

export function browserSessionLifecycleEvent(
  action: BrowserSessionLifecycleAction,
  reason: string,
  profileMode: BrowserProfileMode,
  sessionId?: string,
  now: () => string = () => new Date().toISOString(),
): BrowserSessionLifecycleEvent {
  return {
    action,
    reason,
    at: now(),
    profileMode,
    ...(sessionId ? { sessionId } : {}),
  };
}

export class BrowserChromeSessionStore {
  constructor(
    private readonly getWorkspace: () => WorkspaceState,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  paths(): BrowserPaths {
    return browserPathsForWorkspace(this.getWorkspace());
  }

  manifestPath(profileMode: BrowserProfileMode): string {
    return join(this.paths().sessionManifests, `${profileMode}.json`);
  }

  async read(profileMode: BrowserProfileMode): Promise<ChromeSessionManifest | undefined> {
    try {
      const parsed = JSON.parse(await readFile(this.manifestPath(profileMode), "utf8")) as Partial<ChromeSessionManifest>;
      if (
        typeof parsed.id !== "string" ||
        typeof parsed.workspacePath !== "string" ||
        parsed.workspacePath !== this.getWorkspace().path ||
        parsed.profileMode !== profileMode ||
        typeof parsed.profilePath !== "string" ||
        typeof parsed.devToolsPort !== "number" ||
        typeof parsed.browserWsUrl !== "string"
      ) {
        return undefined;
      }
      const readAt = () => this.now();
      return {
        id: parsed.id,
        workspacePath: parsed.workspacePath,
        profileMode,
        profilePath: parsed.profilePath,
        profileEphemeral: parsed.profileEphemeral === true,
        processId: typeof parsed.processId === "number" ? parsed.processId : undefined,
        devToolsPort: parsed.devToolsPort,
        browserWsUrl: parsed.browserWsUrl,
        activeTargetId: typeof parsed.activeTargetId === "string" ? parsed.activeTargetId : undefined,
        createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : readAt(),
        lastUsedAt: typeof parsed.lastUsedAt === "string" ? parsed.lastUsedAt : readAt(),
      };
    } catch {
      return undefined;
    }
  }

  async write(input: ChromeSessionManifestWriteInput): Promise<void> {
    const path = this.manifestPath(input.profileMode);
    mkdirSync(this.paths().sessionManifests, { recursive: true });
    const existing = await this.read(input.profileMode);
    const now = this.now();
    const manifest: ChromeSessionManifest = {
      id: input.sessionId,
      workspacePath: this.getWorkspace().path,
      profileMode: input.profileMode,
      profilePath: input.profilePath,
      profileEphemeral: input.profileEphemeral,
      processId: input.processId ?? existing?.processId,
      devToolsPort: input.devToolsPort,
      browserWsUrl: input.browserWsUrl,
      activeTargetId: input.activeTargetId,
      createdAt: existing?.id === input.sessionId ? existing.createdAt : now,
      lastUsedAt: now,
    };
    await writeFile(path, JSON.stringify(manifest, null, 2), "utf8");
  }

  async clear(profileMode: BrowserProfileMode): Promise<void> {
    await rm(this.manifestPath(profileMode), { force: true });
  }
}
