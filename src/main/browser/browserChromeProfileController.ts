import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { cp, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative } from "node:path";

import type { BrowserProfileMode } from "../../shared/browserTypes";
import {
  BrowserChromeSessionStore,
  type BrowserPaths,
} from "./browserChromeSessionStore";

export interface CopiedChromeProfileMetadata {
  sourceProfilePath: string;
  copiedProfilePath: string;
  copiedAt: string;
}

export type CopiedChromeProfileState = {
  available: boolean;
  sourceProfilePath?: string;
  copiedAt?: string;
};

export interface BrowserChromeProfileControllerOptions {
  chromeSessions: BrowserChromeSessionStore;
  clearUserActions: (reason: string) => void;
  getProfileMode: () => BrowserProfileMode;
  isChromeRunning: () => boolean;
  setLastActivity: (message: string) => void;
  setLastError: (message: string | undefined) => void;
  stopChrome: (reason: string) => Promise<void>;
  chromeProfileSourcePath?: () => string | undefined;
}

export class BrowserChromeProfileController {
  constructor(private readonly options: BrowserChromeProfileControllerOptions) {}

  copiedProfileState(): CopiedChromeProfileState {
    return copiedChromeProfileState(this.options.chromeSessions.paths());
  }

  async copyProfile(): Promise<CopiedChromeProfileMetadata> {
    const metadata = await this.copyChromeProfileIntoState();
    this.options.setLastActivity("Copied Chrome profile into Ambient-controlled state.");
    this.options.setLastError(undefined);
    return metadata;
  }

  async ensureCopiedProfileAvailable(): Promise<void> {
    const paths = this.options.chromeSessions.paths();
    if (!existsSync(paths.copiedProfile)) {
      await this.copyChromeProfileIntoState(paths);
    }
  }

  async copyCopiedProfileToRuntime(runtimeProfilePath: string): Promise<void> {
    const paths = this.options.chromeSessions.paths();
    if (!existsSync(paths.copiedProfile)) {
      throw new Error("No copied Chrome profile is available. Copy a profile from the Browser panel first.");
    }
    await cp(paths.copiedProfile, runtimeProfilePath, {
      recursive: true,
      force: true,
      filter: (source) => shouldCopyChromeProfilePath(paths.copiedProfile, source),
    });
  }

  async clearCopiedProfile(): Promise<void> {
    if (this.options.isChromeRunning() && this.options.getProfileMode() === "copied") {
      await this.options.stopChrome("Copied browser profile is being cleared.");
    }
    const paths = this.options.chromeSessions.paths();
    await this.options.chromeSessions.clear("copied").catch(() => undefined);
    await rm(paths.copiedProfile, { recursive: true, force: true });
    await rm(paths.copiedProfileMetadata, { force: true });
    this.options.setLastActivity("Cleared copied Chrome profile.");
    this.options.setLastError(undefined);
  }

  async clearIsolatedProfile(): Promise<void> {
    if (this.options.isChromeRunning() && this.options.getProfileMode() === "isolated") {
      await this.options.stopChrome("Isolated browser profile is being cleared.");
    }
    const paths = this.options.chromeSessions.paths();
    await this.options.chromeSessions.clear("isolated").catch(() => undefined);
    await rm(paths.isolatedProfile, { recursive: true, force: true });
    this.options.clearUserActions("Cleared isolated browser profile.");
    this.options.setLastActivity("Cleared isolated browser profile.");
    this.options.setLastError(undefined);
  }

  private async copyChromeProfileIntoState(paths = this.options.chromeSessions.paths()): Promise<CopiedChromeProfileMetadata> {
    const source = this.options.chromeProfileSourcePath?.() ?? chromeProfileSourcePath();
    if (!source || !existsSync(source)) {
      throw new Error("Google Chrome profile directory was not found.");
    }
    mkdirSync(paths.root, { recursive: true });
    await rm(paths.copiedProfile, { recursive: true, force: true });
    await cp(source, paths.copiedProfile, {
      recursive: true,
      force: true,
      filter: (candidate) => shouldCopyChromeProfilePath(source, candidate),
    });
    const metadata: CopiedChromeProfileMetadata = {
      sourceProfilePath: source,
      copiedProfilePath: paths.copiedProfile,
      copiedAt: new Date().toISOString(),
    };
    await writeFile(
      paths.copiedProfileMetadata,
      JSON.stringify(metadata, null, 2),
      "utf8",
    );
    return metadata;
  }
}

export function chromeProfileSourcePath(platform = process.platform, home = homedir()): string | undefined {
  if (process.env.AMBIENT_BROWSER_CHROME_PROFILE) return process.env.AMBIENT_BROWSER_CHROME_PROFILE;
  if (platform === "darwin") return join(home, "Library", "Application Support", "Google", "Chrome");
  if (platform === "linux") return join(home, ".config", "google-chrome");
  if (platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    return localAppData ? join(localAppData, "Google", "Chrome", "User Data") : undefined;
  }
  return undefined;
}

export function copiedChromeProfileState(paths: BrowserPaths): CopiedChromeProfileState {
  if (!existsSync(paths.copiedProfile)) return { available: false };
  const metadata = readCopiedChromeProfileMetadata(paths.copiedProfileMetadata);
  if (metadata) {
    return {
      available: true,
      sourceProfilePath: metadata.sourceProfilePath,
      copiedAt: metadata.copiedAt,
    };
  }
  try {
    return {
      available: true,
      copiedAt: statSync(paths.copiedProfile).mtime.toISOString(),
    };
  } catch {
    return { available: true };
  }
}

export function readCopiedChromeProfileMetadata(path: string): CopiedChromeProfileMetadata | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<CopiedChromeProfileMetadata>;
    if (typeof parsed.sourceProfilePath !== "string" || typeof parsed.copiedAt !== "string") return undefined;
    return {
      sourceProfilePath: parsed.sourceProfilePath,
      copiedProfilePath: typeof parsed.copiedProfilePath === "string" ? parsed.copiedProfilePath : "",
      copiedAt: parsed.copiedAt,
    };
  } catch {
    return undefined;
  }
}

export function shouldCopyChromeProfilePath(sourceRoot: string, sourcePath: string): boolean {
  const relativePath = relative(sourceRoot, sourcePath);
  if (!relativePath) return true;
  const parts = relativePath.split(/[\\/]/).filter(Boolean);
  if (parts.some((part) => part.startsWith("Singleton") || excludedChromeProfileParts.has(part))) return false;
  return true;
}

const excludedChromeProfileParts = new Set([
  "Cache",
  "Code Cache",
  "Crashpad",
  "DawnCache",
  "DevToolsActivePort",
  "GPUCache",
  "GrShaderCache",
  "GraphiteDawnCache",
  "ShaderCache",
  "Safe Browsing",
  "SingletonCookie",
  "SingletonLock",
  "SingletonSocket",
  "lockfile",
]);
