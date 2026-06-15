import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import { createAgentRuntimeBrowserToolExtension, registerAgentRuntimeBrowserTools } from "./agentRuntimeBrowserTools";

describe("agentRuntimeBrowserTools", () => {
  it("registers the browser tool group in the existing order", () => {
    const registeredTools: ToolDefinition<any, any, any>[] = [];

    registerAgentRuntimeBrowserTools({
      registerTool: (tool: any) => registeredTools.push(tool),
      getActiveTools: () => [],
      getAllTools: () => [],
    }, browserToolOptions({ enableBrowserLoginBroker: true }));

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "browser_search",
      "browser_local_preview",
      "browser_nav",
      "browser_content",
      "browser_eval",
      "browser_click",
      "browser_get_value",
      "browser_wait_for",
      "browser_assert",
      "browser_keypress",
      "browser_login",
      "browser_screenshot",
      "browser_pick",
    ]);
    expect(registeredTools.every((tool) => tool.executionMode === "sequential")).toBe(true);
  });

  it("omits browser login when the broker feature is disabled", () => {
    const registeredTools: ToolDefinition<any, any, any>[] = [];

    registerAgentRuntimeBrowserTools({
      registerTool: (tool: any) => registeredTools.push(tool),
      getActiveTools: () => [],
      getAllTools: () => [],
    }, browserToolOptions({ enableBrowserLoginBroker: false }));

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "browser_search",
      "browser_local_preview",
      "browser_nav",
      "browser_content",
      "browser_eval",
      "browser_click",
      "browser_get_value",
      "browser_wait_for",
      "browser_assert",
      "browser_keypress",
      "browser_screenshot",
      "browser_pick",
    ]);
  });

  it("creates AgentRuntime browser tool options with default audit wiring", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-browser-tools-"));
    try {
      await mkdir(join(workspacePath, ".ambient"), { recursive: true });
      const registeredTools: ToolDefinition<any, any, any>[] = [];
      const recordBrowserAudit = vi.fn();
      const browserSearch = vi.fn(async () => [{
        title: "Browser result",
        url: "https://example.test/result",
        snippet: "A browser search result.",
      }]);

      createAgentRuntimeBrowserToolExtension({
        ...browserToolOptions({ enableBrowserLoginBroker: true, workspacePath }),
        browserSearch,
        prepareBrowserToolProfile: vi.fn(async () => ({ profileMode: "copied" as const, runtime: "chrome" as const })),
        recordBrowserAudit,
        withBrowserToolHeartbeat: vi.fn(async (_toolName, _message, operation) => operation(() => undefined)),
      })({
        registerTool: (tool: any) => registeredTools.push(tool),
        getActiveTools: () => [],
        getAllTools: () => [],
      } as any);

      const browserSearchTool = registeredTools.find((tool) => tool.name === "browser_search");
      expect(browserSearchTool).toBeDefined();

      const result = await (browserSearchTool!.execute as any)("browser-search-call", { query: "ambient browser" });

      expect(browserSearch).toHaveBeenCalledWith(expect.objectContaining({
        query: "ambient browser",
        profileMode: "copied",
        runtime: "chrome",
        sourceThreadId: "thread-1",
      }));
      expect(recordBrowserAudit).toHaveBeenCalledWith(
        "thread-1",
        "browser_search",
        "browser-profile",
        "ambient browser",
      );
      expect((result.content[0] as { text: string }).text).toContain("Browser result");
      expect(result.details).toMatchObject({
        toolName: "browser_search",
        profileMode: "copied",
        runtime: "chrome",
      });
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

function browserToolOptions(input: { enableBrowserLoginBroker: boolean; workspacePath?: string }): any {
  return {
    enableBrowserLoginBroker: input.enableBrowserLoginBroker,
    threadId: "thread-1",
    workspace: {
      path: input.workspacePath ?? "/workspace",
      name: "Workspace",
      statePath: `${input.workspacePath ?? "/workspace"}/.ambient`,
      sessionPath: `${input.workspacePath ?? "/workspace"}/.ambient/sessions`,
    },
    prepareBrowserToolProfile: vi.fn(async () => ({ profileMode: "isolated", runtime: "internal" })),
    browserSearch: vi.fn(),
    openLocalPreview: vi.fn(),
    browserNavigate: vi.fn(),
    browserContent: vi.fn(),
    tryRouteBrowserContentThroughScrapling: vi.fn(async () => ({})),
    browserEvaluate: vi.fn(),
    browserKeypress: vi.fn(),
    resolveBrowserCredential: vi.fn(),
    markBrowserCredentialUsed: vi.fn(),
    browserLogin: vi.fn(),
    browserScreenshot: vi.fn(),
    browserPick: vi.fn(),
    emitBrowserState: vi.fn(),
    recordBrowserSearchAudit: vi.fn(),
    recordBrowserLocalPreviewAudit: vi.fn(),
    recordBrowserNavAudit: vi.fn(),
    recordBrowserContentAudit: vi.fn(),
    recordBrowserEvalAudit: vi.fn(),
    recordBrowserActionAudit: vi.fn(),
    recordBrowserKeypressAudit: vi.fn(),
    recordBrowserLoginAudit: vi.fn(),
    recordBrowserScreenshotAudit: vi.fn(),
    recordBrowserPickAudit: vi.fn(),
    withBrowserToolHeartbeat: vi.fn(),
    materializeBrowserPageContent: vi.fn(),
    formatBrowserContent: vi.fn(),
    formatBrowserUserAction: vi.fn(),
    formatDiagnosticText: vi.fn(),
    formatMediaArtifactNotice: vi.fn(),
  };
}
