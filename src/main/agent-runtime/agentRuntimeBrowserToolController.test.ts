import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import type {
  BrowserCapabilityState,
  BrowserScreenshotResult,
} from "../../shared/browserTypes";
import type { DesktopEvent } from "../../shared/desktopTypes";
import { AgentRuntimeBrowserToolController } from "./agentRuntimeBrowserToolController";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";

type RegisteredTool = {
  name: string;
  execute: (toolCallId: string, input: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
    details?: unknown;
  }>;
};

describe("AgentRuntimeBrowserToolController", () => {
  it("records full-access browser profile audits and emits copied-profile state", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-browser-owner-"));
    const store = new ProjectStore();
    const events: DesktopEvent[] = [];
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("browser profile");
      const thread = store.updateThreadSettings(created.id, { permissionMode: "full-access" });
      const copiedState = browserState({
        copiedProfileAvailable: true,
        copiedProfilePath: join(workspace.path, ".ambient", "chrome-copy"),
        copiedProfileSourcePath: "/Users/example/Chrome",
      });
      const controller = new AgentRuntimeBrowserToolController({
        store,
        browser: browserStub({
          getState: vi.fn(async () => browserState({ copiedProfileAvailable: false })),
          copyChromeProfile: vi.fn(async () => copiedState),
        }),
        browserCredentials: browserCredentialsStub(),
        localPreviewServers: localPreviewStub(),
        enableBrowserLoginBroker: () => true,
        getRunId: () => undefined,
        tryRouteBrowserContentThroughScrapling: vi.fn(async () => ({})),
        emit: (event) => events.push(event),
      });

      const profile = await controller.prepareBrowserToolProfile({ profileMode: "copied" }, thread.id);

      expect(profile).toEqual({ profileMode: "copied", runtime: "chrome" });
      expect(store.listPermissionAudit(10)).toEqual([
        expect.objectContaining({
          threadId: thread.id,
          permissionMode: "full-access",
          toolName: "browser_profile",
          risk: "browser-profile",
          decision: "allowed",
        }),
      ]);
      expect(events.map((event) => event.type)).toEqual(["permission-audit-created", "browser-updated"]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("owns browser screenshot artifact identity for latest-screenshot consumers", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-browser-screenshot-owner-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.createThread("browser screenshot");
      const screenshot: BrowserScreenshotResult = {
        path: join(workspace.path, ".ambient-codex/browser/screenshots/current.png"),
        artifactPath: ".ambient-codex/browser/screenshots/current.png",
        mimeType: "image/png",
        bytes: 12_345,
        width: 1280,
        height: 720,
        title: "Fixture",
        url: "https://example.test/",
        runtime: "chrome",
      };
      const controller = new AgentRuntimeBrowserToolController({
        store,
        browser: browserStub({ screenshot: vi.fn(async () => screenshot) }),
        browserCredentials: browserCredentialsStub(),
        localPreviewServers: localPreviewStub(),
        enableBrowserLoginBroker: () => true,
        getRunId: () => undefined,
        tryRouteBrowserContentThroughScrapling: vi.fn(async () => ({})),
        emit: vi.fn(),
      });
      const registeredTools: RegisteredTool[] = [];
      const pi = {
        registerTool: (tool: unknown) => {
          registeredTools.push(tool as unknown as RegisteredTool);
        },
        getActiveTools: () => ["browser_screenshot", "ambient_visual_analyze"],
        getAllTools: () => [{ name: "browser_screenshot" }, { name: "ambient_visual_analyze" }],
      } as unknown as Parameters<ExtensionFactory>[0];
      controller.createBrowserToolExtension(thread.id, workspace)(pi);

      const screenshotTool = registeredTools.find((tool) => tool.name === "browser_screenshot");
      expect(screenshotTool).toBeDefined();
      await screenshotTool!.execute("screenshot-call", {});

      expect(controller.getLatestBrowserScreenshotArtifact(thread.id)).toEqual(expect.objectContaining({
        artifactRef: "latest_browser_screenshot",
        artifactPath: ".ambient-codex/browser/screenshots/current.png",
        path: screenshot.path,
      }));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

function browserState(overrides: Partial<BrowserCapabilityState> = {}): BrowserCapabilityState {
  return {
    running: false,
    profileMode: "isolated",
    runtime: "chrome",
    internalAvailable: true,
    copiedProfileAvailable: false,
    chromeAvailable: true,
    browserLoginBrokerAvailable: true,
    ...overrides,
  };
}

function browserStub(overrides: Partial<AgentRuntimeBrowserToolControllerOptionsBrowser> = {}): AgentRuntimeBrowserToolControllerOptionsBrowser {
  return {
    search: vi.fn(async () => []),
    navigate: vi.fn(),
    content: vi.fn(),
    evaluate: vi.fn(),
    keypress: vi.fn(),
    login: vi.fn(),
    screenshot: vi.fn(async () => ({
      path: "/workspace/.ambient-codex/browser/screenshots/current.png",
      bytes: 1,
    })),
    pick: vi.fn(),
    getState: vi.fn(async () => browserState()),
    copyChromeProfile: vi.fn(async () => browserState({ copiedProfileAvailable: true })),
    ...overrides,
  };
}

function browserCredentialsStub(): AgentRuntimeBrowserToolControllerOptionsBrowserCredentials {
  return {
    resolve: vi.fn(),
    markUsed: vi.fn(),
  };
}

function localPreviewStub(): AgentRuntimeBrowserToolControllerOptionsLocalPreview {
  return {
    open: vi.fn(),
  };
}

type AgentRuntimeBrowserToolControllerOptionsBrowser = ConstructorParameters<
  typeof AgentRuntimeBrowserToolController
>[0]["browser"];
type AgentRuntimeBrowserToolControllerOptionsBrowserCredentials = ConstructorParameters<
  typeof AgentRuntimeBrowserToolController
>[0]["browserCredentials"];
type AgentRuntimeBrowserToolControllerOptionsLocalPreview = ConstructorParameters<
  typeof AgentRuntimeBrowserToolController
>[0]["localPreviewServers"];
