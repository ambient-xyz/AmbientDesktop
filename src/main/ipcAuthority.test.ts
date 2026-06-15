import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mainSource = readSource("src/main/index.ts");
const mainHandleSources = readMainHandleSources();
const ambientIpcSource = readSource("src/main/ipc/registerAmbientIpc.ts");
const workflowIpcSource = readSource("src/main/ipc/registerWorkflowIpc.ts");
const preloadSource = readSource("src/preload/index.ts");
const desktopTypesSource = readSource("src/shared/desktopTypes.ts");

function uniqueMatches(source: string, pattern: RegExp): string[] {
  return [...new Set([...source.matchAll(pattern)].map((match) => match[1]).filter((item): item is string => Boolean(item)))].sort();
}

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

function readMainHandleSources(): string {
  const sources = [mainSource];
  const ipcDir = resolve(process.cwd(), "src/main/ipc");
  for (const entry of readdirSync(ipcDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      sources.push(readFileSync(resolve(ipcDir, entry.name), "utf8"));
    }
  }
  return sources.join("\n");
}

describe("IPC authority boundary", () => {
  it("routes every main-process invoke handler through the sender-validating wrapper", () => {
    const rawMainHandlerCount = mainHandleSources.match(/\bipcMain\.handle\(/g)?.length ?? 0;
    expect(rawMainHandlerCount).toBe(1);
    expect(mainSource).toMatch(/function handleIpc[\s\S]*ipcMain\.handle\(channel[\s\S]*assertTrustedMainWindowIpc\(event, `IPC channel "\$\{channel\}"`\)/);

    const allRegisteredChannels = [...mainHandleSources.matchAll(/\bhandleIpc\("([^"]+)"/g)].map((match) => match[1]).filter((item): item is string => Boolean(item));
    const registeredChannels = [...new Set(allRegisteredChannels)].sort();
    expect(registeredChannels.length).toBeGreaterThan(150);
    expect(allRegisteredChannels.length).toBe(registeredChannels.length);
  });

  it("keeps preload-exposed invoke channels backed by main-process handlers", () => {
    const registeredChannels = new Set(uniqueMatches(mainHandleSources, /\bhandleIpc\("([^"]+)"/g));
    const preloadChannels = uniqueMatches(preloadSource, /\bipcRenderer\.invoke\("([^"]+)"/g);
    const missingHandlers = preloadChannels.filter((channel) => !registeredChannels.has(channel));

    expect(missingHandlers).toEqual([]);
  });

  it("does not allow thread actions to carry renderer-supplied workspace paths", () => {
    const threadActionSchemaBody = mainSource.match(/const threadActionSchema = z\.object\(\{([\s\S]*?)\n\}\);/)?.[1] ?? "";
    const threadActionTypeBody = desktopTypesSource.match(/export interface ThreadActionInput \{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(threadActionSchemaBody).toContain("projectId: projectIdSchema.optional()");
    expect(threadActionSchemaBody).not.toContain("workspacePath");
    expect(threadActionTypeBody).toContain("projectId?: string");
    expect(threadActionTypeBody).not.toContain("workspacePath");
    expect(preloadSource).not.toMatch(/workspacePath:.*threadId/);
  });

  it("limits trusted renderer IPC origins to exact renderer entrypoints", () => {
    const trustedRendererRegion = sourceBetween(mainSource, "function isTrustedRendererUrl", "\nasync function readCodexPluginCatalog");

    expect(trustedRendererRegion).toContain("trustedMainRendererUrl()");
    expect(trustedRendererRegion).toContain("url.href === trustedUrl.href");
    expect(trustedRendererRegion).toContain("url.origin === trustedUrl.origin");
    expect(trustedRendererRegion).toContain('pathToFileURL(resolveBuiltOutputPath("renderer", "index.html"))');
    expect(trustedRendererRegion).not.toContain('url.protocol === "file:") return true');
    expect(trustedRendererRegion).not.toContain('isLoopbackHost(url.hostname)) return true');
  });

  it("binds diagnostic export reads to the runtime host captured at export start", () => {
    const diagnosticSource = sourceBetween(mainSource, "function createMainDiagnosticSource", "\nasync function readDiagnosticSection");
    expect(diagnosticSource).toContain("host: ProjectRuntimeHost = requireActiveProjectRuntimeHost()");
    expect(diagnosticSource).toContain("const targetStore = host.store;");
    expect(diagnosticSource).toContain("const targetRuntime = host.runtime;");
    expect(diagnosticSource).toContain("readAmbientPluginRegistry(targetStore)");
    expect(diagnosticSource).toContain("pluginStateReaderForStore(targetStore)");
    expect(diagnosticSource).not.toMatch(/\bstore\./);
    expect(diagnosticSource).not.toMatch(/\bruntime\./);
    expect(diagnosticSource).not.toContain("pluginStateReader()");

    const diagnosticExport = sourceBetween(mainHandleSources, "registerDiagnosticsIpc({", "\n    registerThreadExportChatIpc({");
    expect(diagnosticExport).toContain("const host = requireActiveProjectRuntimeHost();");
    expect(diagnosticExport).toContain("createMainDiagnosticSource(host)");
    expect(diagnosticExport).toContain("importDiagnosticBundle: async");
    expect(diagnosticExport).toContain("importDiagnosticBundleFromFile(filePath)");
  });

  it("tracks active workflow run controllers with their owner workspace", () => {
    const activeWorkflowRunRegion = sourceBetween(
      mainSource,
      "interface ActiveWorkflowRunController",
      "\nfunction isProjectBoardSynthesisPauseRequested",
    );
    expect(activeWorkflowRunRegion).toContain("workspacePath: string;");
    expect(activeWorkflowRunRegion).toContain("rememberActiveWorkflowRun(runId: string, controller: AbortController, workspacePath: string)");
    expect(activeWorkflowRunRegion).toContain("projectRuntimeHostForKnownWorkspacePath(activeRun.workspacePath)");
    expect(mainSource).not.toContain("activeWorkflowRuns.set(runId, abortController);");
    expect(mainSource).not.toContain("activeWorkflowRuns.delete(startedRunId)");

    const cancelRunHandler = sourceBetween(
      workflowIpcSource,
      'handleIpc("workflow:cancel-run"',
      "\nexport function registerWorkflowArtifactReviewIpc",
    );
    expect(cancelRunHandler).toContain("projectRuntimeHostForWorkflowRun(input.runId) ?? activeWorkflowRunHost(input.runId)");
    expect(cancelRunHandler).toContain("activeWorkflowRunController(input.runId)");
    expect(cancelRunHandler).not.toContain("?? requireActiveProjectRuntimeHost()");
  });

  it("keeps project-scoped plugin mutations from resetting every loaded project runtime", () => {
    const appCredentialRegion = sourceBetween(
      ambientIpcSource,
      "const refreshProvider = () => {",
      "\n\n  handleIpc",
    );
    expect(appCredentialRegion).toContain("resetRuntimeAndPluginServers()");

    const projectResetHelper = sourceBetween(mainSource, "function resetProjectRuntimeAndPluginServers", "\nfunction disposeProjectRuntimeHost");
    expect(projectResetHelper).toContain("workspacePathsForProjectRuntimeHost(host)");

    const pluginMutationRegion = sourceBetween(mainHandleSources, "registerPluginSetEnabledIpc({", "\n    registerPluginSetTrustedIpc({");
    expect(pluginMutationRegion).toContain("resetProjectRuntimeAndPluginServers(host)");
    expect(pluginMutationRegion).not.toContain("resetRuntimeAndPluginServers()");
  });
});
