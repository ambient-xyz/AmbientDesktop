import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import type {
  BrowserScreenshotResult,
  BrowserStartInput,
  BrowserTabSnapshot,
} from "../../shared/browserTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";

export const BROWSER_SCREENSHOT_MIME_TYPE = "image/png";

export interface BrowserScreenshotStorageTarget {
  screenshots: string;
  artifactWorkspacePath: string;
}

type BrowserScreenshotActivityInput = {
  onActivity?: (message: string) => void;
};

type BrowserChromeScreenshotPageClient = {
  request<T = unknown>(method: string, params: Record<string, unknown>, timeoutMs?: number): Promise<T>;
  close(): void;
};

export interface BrowserChromeScreenshotControllerOptions {
  getWorkspace: () => WorkspaceState;
  ensureChromeStarted: (profileMode?: BrowserStartInput["profileMode"]) => Promise<void>;
  getActiveTabSnapshot: () => Promise<BrowserTabSnapshot>;
  connectActivePage: () => Promise<BrowserChromeScreenshotPageClient>;
  refuseStateLosingInternalPreviewScreenshotIfBlank: (onActivity?: (message: string) => void) => Promise<void>;
  sameAsLastChromeBrowserActionTarget: (tab?: BrowserTabSnapshot) => boolean | undefined;
  captureChromeScreenshotData: () => Promise<string>;
  setLastActivity: (message: string) => void;
  setLastError: (message: string | undefined) => void;
}

export class BrowserChromeScreenshotController {
  constructor(private readonly options: BrowserChromeScreenshotControllerOptions) {}

  async screenshot(input: BrowserStartInput & BrowserScreenshotActivityInput = {}): Promise<BrowserScreenshotResult> {
    await this.options.ensureChromeStarted(input.profileMode);
    input.onActivity?.("Chrome browser runtime is ready.");
    await this.options.refuseStateLosingInternalPreviewScreenshotIfBlank(input.onActivity);
    const tabBeforeCapture = await this.options.getActiveTabSnapshot().catch(() => undefined);
    assertBrowserScreenshotTargetLoaded(tabBeforeCapture);
    const data = await this.options.captureChromeScreenshotData();
    input.onActivity?.("Chrome screenshot bytes captured.");
    const tab = await this.options.getActiveTabSnapshot().catch(() => undefined);
    const sameTargetAsLastBrowserAction = this.options.sameAsLastChromeBrowserActionTarget(tab ?? tabBeforeCapture);
    const fileName = `browser-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    const target = browserScreenshotStorageTarget(this.options.getWorkspace(), input);
    mkdirSync(target.screenshots, { recursive: true });
    const filePath = join(target.screenshots, fileName);
    const bytes = Buffer.from(data, "base64");
    const dimensions = pngImageDimensions(bytes);
    await writeFile(filePath, bytes);
    input.onActivity?.("Chrome screenshot artifact was written.");
    this.options.setLastActivity(`Captured browser screenshot ${fileName}.`);
    return {
      path: filePath,
      artifactPath: browserScreenshotArtifactPath(target, filePath),
      mimeType: BROWSER_SCREENSHOT_MIME_TYPE,
      bytes: bytes.length,
      ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
      title: tab?.title,
      url: tab?.url,
      runtime: "chrome",
      targetId: tab?.id ?? tabBeforeCapture?.id,
      statePreserved: true,
      freshLoad: false,
      ...(sameTargetAsLastBrowserAction !== undefined ? { sameTargetAsLastBrowserAction } : {}),
    };
  }

  async captureChromeScreenshotData(): Promise<string> {
    const attempts: Array<{ prepare?: boolean; params: Record<string, unknown> }> = [
      { params: { format: "png", fromSurface: true } },
      { prepare: true, params: { format: "png", fromSurface: false, captureBeyondViewport: false } },
      {
        prepare: true,
        params: {
          format: "png",
          fromSurface: true,
          captureBeyondViewport: false,
          clip: { x: 0, y: 0, width: 1280, height: 720, scale: 1 },
        },
      },
    ];
    let lastError: unknown;
    for (const attempt of attempts) {
      const client = await this.options.connectActivePage();
      try {
        await client.request("Page.enable", {}, 5_000).catch(() => undefined);
        await client.request("Page.bringToFront", {}, 5_000).catch(() => undefined);
        if (attempt.prepare) {
          await client.request("Page.stopLoading", {}, 2_000).catch(() => undefined);
          await client
            .request("Runtime.evaluate", { expression: "window.stop(); true", returnByValue: true }, 2_000)
            .catch(() => undefined);
          await delay(350);
        }
        const result = await client.request<{ data?: string }>("Page.captureScreenshot", attempt.params, 12_000);
        if (result.data) return result.data;
        lastError = new Error("Chrome did not return screenshot data.");
      } catch (error) {
        lastError = error;
      } finally {
        client.close();
      }
    }
    this.options.setLastError(errorMessage(lastError));
    throw lastError instanceof Error ? lastError : new Error("Chrome screenshot failed.");
  }
}

export function assertBrowserScreenshotTargetLoaded(activeTab: Pick<BrowserTabSnapshot, "url"> | undefined): void {
  const url = activeTab?.url?.trim() ?? "";
  if (url && !isAboutBlankUrl(url)) return;
  throw new Error(
    [
      "Browser screenshot refused: the active browser target is about:blank.",
      "Reopen the intended page with browser_local_preview or browser_nav before capturing visual evidence.",
      "Ambient will not write an about:blank screenshot artifact.",
    ].join(" "),
  );
}

export function browserScreenshotStorageTarget(workspace: WorkspaceState, input: BrowserStartInput = {}): BrowserScreenshotStorageTarget {
  const artifactWorkspacePath = typeof input.artifactWorkspacePath === "string" ? input.artifactWorkspacePath.trim() : "";
  if (artifactWorkspacePath) {
    return {
      screenshots: join(artifactWorkspacePath, ".ambient-codex", "browser", "screenshots"),
      artifactWorkspacePath,
    };
  }
  return {
    screenshots: join(workspace.statePath, "browser", "screenshots"),
    artifactWorkspacePath: workspace.path,
  };
}

export function browserScreenshotArtifactPath(target: BrowserScreenshotStorageTarget, filePath: string): string | undefined {
  const artifactPath = relative(target.artifactWorkspacePath, filePath);
  if (
    !artifactPath ||
    artifactPath.startsWith("..") ||
    artifactPath.startsWith("/") ||
    /^[a-z]:[\\/]/i.test(artifactPath)
  ) {
    return undefined;
  }
  return artifactPath;
}

export function pngImageDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  if (bytes.length < 24) return undefined;
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  if (!isPng || bytes.toString("ascii", 12, 16) !== "IHDR") return undefined;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width <= 0 || height <= 0) return undefined;
  return { width, height };
}

function isAboutBlankUrl(value: string): boolean {
  return value.trim().toLowerCase() === "about:blank";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
