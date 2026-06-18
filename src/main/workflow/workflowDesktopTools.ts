import type { BrowserContentInput, BrowserEvaluateInput, BrowserKeypressInput, BrowserLoginInput, BrowserNavigateInput, BrowserPickInput, BrowserSearchInput, BrowserStartInput } from "../../shared/browserTypes";
import type { MiniCpmVisionAnalysisResult, MiniCpmVisionAnalyzeInput, MiniCpmVisionSetupInput, MiniCpmVisionSetupResult } from "../../shared/localRuntimeTypes";
import type { PermissionMode, PermissionRequest } from "../../shared/permissionTypes";
import type { WorkflowRunRuntime } from "../../shared/workflowTypes";
import type { OfficeTextExtraction, PdfTextExtraction, WorkspaceState } from "../../shared/workspaceTypes";
import type { Model } from "@mariozechner/pi-ai";
import { AMBIENT_DEFAULT_MODEL, ambientModelLabel, normalizeAmbientModelId } from "../../shared/ambientModels";
import {
  describeAmbientCliPackage,
  runAmbientCliPackageCommand,
  type AmbientCliPackageDescription,
  type AmbientCliRunResult,
  type DescribeAmbientCliPackageInput,
  type RunAmbientCliInput,
} from "../ambient-cli/ambientCliPackages";
import { readAmbientApiKey, getActiveAmbientProviderBaseUrl, getActiveAmbientProviderModelOverride } from "../security/credentialStore";
import { firstPartyDesktopToolDescriptors, type DesktopToolDescriptor } from "./workflowDesktopToolFacade";
import { completeAmbientText, executeLambdaRlm, type LambdaRlmTaskType } from "../tool-runtime/lambdaRlm";
import { classifyToolPermission } from "../permissions/permissionPolicy";
import { callPluginMcpTool, type PluginMcpLaunchPlan, type PluginMcpToolRegistration } from "../plugins/pluginMcpSupervisor";
import { normalizeAmbientBaseUrl } from "../provider/providerStatus";
import { runShellCommand, type ToolRunnerRunShellOptions } from "../tool-runtime/toolRunner";
import { materializeTextOutput, materializedTextNotice } from "../tool-runtime/toolOutputArtifacts";
import { analyzeMiniCpmVisionInput, setupMiniCpmVisionProvider } from "../mini-cpm/miniCpmVisionProvider";
import { readLocalFilePreview, readWorkspaceFile, writeWorkspaceTextFile } from "../workspace/workspaceFiles";
import { listLocalDirectory, readLocalTextFile } from "./localFiles";
import { createWorkflowToolBridge } from "./workflowToolBridge";
import type { WorkflowEventSink, WorkflowToolHandlers } from "./workflowAgentRuntime";
import type { WorkflowManifest } from "../../shared/workflowTypes";

export interface WorkflowBrowserAdapter {
  search(input: BrowserSearchInput): Promise<unknown>;
  navigate(input: BrowserNavigateInput): Promise<unknown>;
  content(input: BrowserContentInput): Promise<unknown>;
  evaluate(input: BrowserEvaluateInput): Promise<unknown>;
  keypress?(input: BrowserKeypressInput): Promise<unknown>;
  login?(input: BrowserLoginInput): Promise<unknown>;
  screenshot(input: BrowserStartInput): Promise<unknown>;
  pick(input: BrowserPickInput): Promise<unknown>;
}

export interface WorkflowShellResult {
  exitCode: number | null;
  output: string;
  truncated: boolean;
  outputArtifactPath?: string;
  outputArtifactBytes?: number;
  outputChars?: number;
  outputPreviewChars?: number;
  outputNotice?: string;
}

export interface WorkflowDesktopToolBridgeOptions {
  manifest: WorkflowManifest;
  workspace: Pick<WorkspaceState, "path">;
  permissionMode: PermissionMode;
  runtime?: WorkflowRunRuntime;
  model?: string;
  baseUrl?: string;
  runId: string;
  browser?: WorkflowBrowserAdapter;
  pluginRegistrations?: PluginMcpToolRegistration[];
  requestPermission?: (request: Omit<PermissionRequest, "id">) => Promise<boolean>;
  ensurePluginTrusted?: (registration: PluginMcpToolRegistration) => Promise<boolean>;
  eventSink?: WorkflowEventSink;
  dryRun?: boolean;
  abortSignal?: AbortSignal;
  shellRunner?: (options: ToolRunnerRunShellOptions) => Promise<{ exitCode: number | null }>;
  pluginCaller?: typeof callPluginMcpTool;
  ambientCliRunner?: (workspacePath: string, input: RunAmbientCliInput) => Promise<AmbientCliRunResult>;
  ambientCliDescriber?: (workspacePath: string, input: DescribeAmbientCliPackageInput) => Promise<AmbientCliPackageDescription>;
  longContextModelComplete?: (prompt: string, signal?: AbortSignal) => Promise<string>;
  vision?: {
    setupMiniCpm?: (workspacePath: string, input: MiniCpmVisionSetupInput, options?: { signal?: AbortSignal }) => Promise<MiniCpmVisionSetupResult> | MiniCpmVisionSetupResult;
    analyzeMiniCpm?: (workspacePath: string, input: MiniCpmVisionAnalyzeInput, options?: { signal?: AbortSignal }) => Promise<MiniCpmVisionAnalysisResult> | MiniCpmVisionAnalysisResult;
  };
  maxShellOutputChars?: number;
}

export interface WorkflowDesktopToolBridge {
  descriptors: DesktopToolDescriptor[];
  handlers: WorkflowToolHandlers;
}

export function createWorkflowDesktopToolBridge(options: WorkflowDesktopToolBridgeOptions): WorkflowDesktopToolBridge {
  const pluginRegistrations = options.pluginRegistrations ?? [];
  const descriptors = [...firstPartyDesktopToolDescriptors(), ...pluginRegistrations.map((registration) => registration.descriptor)];
  const rawHandlers: WorkflowToolHandlers = {
    bash: (input) => runWorkflowShell(input, options),
    file_read: (input) => runWorkflowFileRead(input, options),
    long_context_process: (input) => runWorkflowLongContextProcess(input, options),
    local_directory_list: (input) => runWorkflowLocalDirectoryList(input),
    local_file_read: (input) => runWorkflowLocalFileRead(input, options),
    file_write: (input) => runWorkflowFileWrite(input, options),
    ambient_cli_describe: (input) => runWorkflowAmbientCliDescribe(input, options),
    ambient_cli: (input) => runWorkflowAmbientCli(input, options),
    ambient_visual_minicpm_setup: (input) => runWorkflowMiniCpmSetup(input, options),
    ambient_visual_analyze: (input) => runWorkflowMiniCpmAnalyze(input, options),
    ...(options.browser ? browserHandlers(options.browser, options.workspace.path) : {}),
    ...pluginHandlers(pluginRegistrations, options),
  };

  return {
    descriptors,
    handlers: createWorkflowToolBridge({
      manifest: options.manifest,
      descriptors,
      handlers: permissionWrappedHandlers(rawHandlers, options),
      dryRun: options.dryRun,
      dryRunHandlers: {
        bash: (input) => dryRunWorkflowShell(input),
        long_context_process: (input) => dryRunWorkflowLongContextProcess(input),
        local_directory_list: (input) => dryRunWorkflowLocalDirectoryList(input),
        local_file_read: (input) => dryRunWorkflowLocalFileRead(input),
        browser_search: (input) => dryRunBrowserSearch(input),
        browser_nav: (input) => dryRunBrowserNavigate(input),
        browser_content: (input) => dryRunBrowserContent(input),
        browser_eval: (input) => dryRunBrowserEvaluate(input),
        browser_keypress: (input) => dryRunBrowserKeypress(input),
        browser_login: (input) => dryRunBrowserLogin(input),
        browser_screenshot: () => dryRunBrowserScreenshot(),
        browser_pick: (input) => dryRunBrowserPick(input),
        ambient_cli_describe: (input) => dryRunWorkflowAmbientCliDescribe(input),
        ambient_cli: (input) => dryRunWorkflowAmbientCli(input),
        ambient_visual_minicpm_setup: (input) => dryRunMiniCpmSetup(input),
        ambient_visual_analyze: (input) => dryRunMiniCpmAnalyze(input),
      },
      eventSink: options.eventSink,
    }),
  };
}

function browserHandlers(browser: WorkflowBrowserAdapter, workspacePath: string): WorkflowToolHandlers {
  return {
    browser_search: async (input) =>
      materializeWorkflowBrowserSearch(workspacePath, await browser.search(withWorkflowBrowserArtifacts(input, workspacePath) as BrowserSearchInput)),
    browser_nav: async (input) =>
      materializeWorkflowBrowserContent(workspacePath, await browser.navigate(withWorkflowBrowserArtifacts(input, workspacePath) as BrowserNavigateInput), "workflow-browser-nav"),
    browser_content: async (input) =>
      materializeWorkflowBrowserContent(workspacePath, await browser.content(withWorkflowBrowserArtifacts(input, workspacePath) as BrowserContentInput), "workflow-browser-content"),
    browser_eval: (input) => browser.evaluate(withDefaultBrowserProfile(input) as BrowserEvaluateInput),
    browser_keypress: (input) => {
      if (!browser.keypress) throw new Error("browser_keypress is only available when browser input dispatch is attached to this runtime.");
      return browser.keypress(withDefaultBrowserProfile(input) as BrowserKeypressInput);
    },
    browser_login: (input) => {
      if (!browser.login) throw new Error("browser_login is only available when a credential broker is attached to this runtime.");
      return browser.login(withDefaultBrowserProfile(input) as BrowserLoginInput);
    },
    browser_screenshot: (input) => browser.screenshot({ ...(withDefaultBrowserProfile(input) as BrowserStartInput), artifactWorkspacePath: workspacePath }),
    browser_pick: (input) => browser.pick(withDefaultBrowserProfile(input) as BrowserPickInput),
  };
}

function withWorkflowBrowserArtifacts(input: unknown, workspacePath: string): unknown {
  return { ...(withDefaultBrowserProfile(input) as Record<string, unknown>), artifactWorkspacePath: workspacePath };
}

function withDefaultBrowserProfile(input: unknown): unknown {
  const record = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const runtime = record.runtime === "internal" || record.runtime === "chrome" ? record.runtime : "chrome";
  return { ...record, profileMode: record.profileMode === "copied" ? "copied" : "isolated", runtime };
}

async function materializeWorkflowBrowserSearch(workspacePath: string, result: unknown): Promise<unknown> {
  if (!Array.isArray(result)) return result;
  return Promise.all(
    result.map(async (item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const record = item as Record<string, unknown>;
      if (typeof record.content !== "string") return item;
      const output = await materializeTextOutput(workspacePath, {
        label: `workflow-browser-search-result-${index + 1}`,
        text: record.content,
        maxPreviewChars: 3_000,
      });
      if (!output.truncated) return { ...record, content: output.text };
      return {
        ...record,
        content: `${output.text}\n\n${materializedTextNotice("browser search result content", output)}`,
        contentTruncated: true,
        contentArtifactPath: output.artifactPath,
        contentArtifactBytes: output.artifactBytes,
        contentChars: output.totalChars,
        contentPreviewChars: output.previewChars,
      };
    }),
  );
}

async function materializeWorkflowBrowserContent(workspacePath: string, result: unknown, label: string): Promise<unknown> {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;
  const record = result as Record<string, unknown>;
  if (typeof record.text !== "string") return result;
  const output = await materializeTextOutput(workspacePath, {
    label,
    text: record.text,
    maxPreviewChars: 12_000,
  });
  if (!output.truncated) return { ...record, text: output.text };
  return {
    ...record,
    text: output.text,
    textTruncated: true,
    textArtifactPath: output.artifactPath,
    textArtifactBytes: output.artifactBytes,
    textChars: output.totalChars,
    textPreviewChars: output.previewChars,
    textNotice: materializedTextNotice("browser page text", output),
  };
}

function dryRunBrowserSearch(input: unknown) {
  const record = objectInput(input);
  const query = typeof record.query === "string" ? record.query : "";
  return [
    {
      title: "[dry-run] Browser search skipped",
      url: query ? `https://www.google.com/search?q=${encodeURIComponent(query)}` : "about:blank",
      snippet: query
        ? `Dry run did not load Google. The workflow would search for: ${query}`
        : "Dry run did not load Google. The workflow would perform a browser search.",
    },
  ];
}

function dryRunBrowserNavigate(input: unknown) {
  const record = objectInput(input);
  const url = typeof record.url === "string" ? record.url : undefined;
  return {
    title: "[dry-run] Browser navigation skipped",
    url,
    text: url ? `Dry run did not navigate to ${url}.` : "Dry run did not navigate the browser.",
    links: [],
  };
}

function dryRunBrowserContent(input: unknown) {
  const record = objectInput(input);
  const url = typeof record.url === "string" ? record.url : undefined;
  return {
    title: "[dry-run] Browser content skipped",
    url,
    text: url ? `Dry run did not load or read ${url}.` : "Dry run did not read the active browser page.",
    links: [],
  };
}

function dryRunBrowserEvaluate(input: unknown) {
  const record = objectInput(input);
  return {
    dryRun: true,
    skipped: true,
    toolName: "browser_eval",
    code: typeof record.code === "string" ? record.code.slice(0, 1_000) : undefined,
  };
}

function dryRunBrowserKeypress(input: unknown) {
  const record = objectInput(input);
  const keys = Array.isArray(record.keys) ? record.keys.slice(0, 10) : [];
  return {
    dryRun: true,
    skipped: true,
    toolName: "browser_keypress",
    keyCount: keys.length,
    focus: typeof record.focus === "string" ? record.focus : "page",
  };
}

function dryRunBrowserLogin(input: unknown) {
  const record = objectInput(input);
  return {
    dryRun: true,
    skipped: true,
    toolName: "browser_login",
    credentialId: typeof record.credentialId === "string" ? record.credentialId : undefined,
    expectedOrigin: typeof record.expectedOrigin === "string" ? record.expectedOrigin : undefined,
    submitted: record.submit !== false,
  };
}

function dryRunBrowserScreenshot() {
  return {
    path: "[dry-run] browser screenshot skipped",
    bytes: 0,
    title: "[dry-run]",
  };
}

function dryRunBrowserPick(input: unknown) {
  const record = objectInput(input);
  return {
    canceled: true,
    prompt: typeof record.prompt === "string" ? record.prompt : "Dry run skipped browser pick.",
    title: "[dry-run] Browser pick skipped",
    selections: [],
  };
}

function pluginHandlers(registrations: PluginMcpToolRegistration[], options: WorkflowDesktopToolBridgeOptions): WorkflowToolHandlers {
  const pluginCaller = options.pluginCaller ?? callPluginMcpTool;
  const runtime = options.runtime ?? "workflow";
  return Object.fromEntries(
    registrations.map((registration) => [
      registration.registeredName,
      async (input: unknown) => {
        if (options.ensurePluginTrusted) {
          const trusted = await options.ensurePluginTrusted(registration);
          if (!trusted) throw new Error(`Workflow plugin tool blocked by trust policy: ${registration.registeredName}`);
        }
        const toolArguments = objectInput(input);
        const eventData = {
          pluginId: registration.tool.pluginId,
          pluginName: registration.tool.pluginName,
          serverName: registration.tool.serverName,
          toolName: registration.originalName,
          registeredName: registration.registeredName,
          permissionMode: options.permissionMode,
          runtime,
        };
        await options.eventSink?.append({
          type: "plugin-mcp.start",
          message: registration.registeredName,
          data: eventData,
        });
        try {
          const result = await pluginCaller(
            registration.launchPlan as PluginMcpLaunchPlan,
            {
              toolName: registration.originalName,
              arguments: toolArguments,
            },
            {
              permissionMode: options.permissionMode,
              workspacePath: options.workspace.path,
              ...(options.abortSignal ? { signal: options.abortSignal } : {}),
            },
          );
          await options.eventSink?.append({
            type: "plugin-mcp.end",
            message: registration.registeredName,
            data: { ...eventData, status: "completed" },
          });
          return result;
        } catch (error) {
          await options.eventSink?.append({
            type: "plugin-mcp.error",
            message: registration.registeredName,
            data: {
              ...eventData,
              status: options.abortSignal?.aborted ? "canceled" : "error",
              error: error instanceof Error ? error.message : String(error),
            },
          });
          throw error;
        }
      },
    ]),
  );
}

function permissionWrappedHandlers(handlers: WorkflowToolHandlers, options: WorkflowDesktopToolBridgeOptions): WorkflowToolHandlers {
  return Object.fromEntries(
    Object.entries(handlers).map(([toolName, handler]) => [
      toolName,
      async (input: unknown) => {
        await enforceWorkflowToolPermission(toolName, input, options);
        return handler(input);
      },
    ]),
  );
}

async function enforceWorkflowToolPermission(
  toolName: string,
  toolInput: unknown,
  options: WorkflowDesktopToolBridgeOptions,
): Promise<void> {
  const decision = await classifyToolPermission({
    threadId: `workflow:${options.runId}`,
    permissionMode: options.permissionMode,
    workspacePath: options.workspace.path,
    toolName,
    toolInput,
  });

  if (decision.action === "allow") {
    await options.eventSink?.append({
      type: "desktop-tool.permission",
      message: toolName,
      data: { decision: "allowed", reason: "policy" },
    });
    return;
  }

  if (decision.action === "deny") {
    await options.eventSink?.append({
      type: "desktop-tool.permission",
      message: toolName,
      data: { decision: "denied", risk: decision.request.risk, detail: decision.request.detail, reason: decision.reason },
    });
    throw new Error(decision.reason);
  }

  await options.eventSink?.append({
    type: "desktop-tool.permission",
    message: toolName,
    data: { decision: "prompt", risk: decision.request.risk, detail: decision.request.detail },
  });
  if (!options.requestPermission) {
    throw new Error(`Workflow tool requires permission approval but no approval handler is available: ${toolName}`);
  }
  const allowed = await options.requestPermission(decision.request);
  await options.eventSink?.append({
    type: "desktop-tool.permission",
    message: toolName,
    data: { decision: allowed ? "allowed" : "denied", risk: decision.request.risk },
  });
  if (!allowed) throw new Error(`Workflow tool permission denied: ${toolName}`);
}

async function runWorkflowShell(input: unknown, options: WorkflowDesktopToolBridgeOptions): Promise<WorkflowShellResult> {
  const command = commandInput(input);
  const chunks: Buffer[] = [];
  const shellRunner = options.shellRunner ?? runShellCommand;
  const result = await shellRunner({
    command,
    cwd: options.workspace.path,
    policy: {
      permissionMode: options.permissionMode,
      workspacePath: options.workspace.path,
      subject: "workflow-tool",
    },
    onData: (chunk) => chunks.push(chunk),
    signal: options.abortSignal,
    timeout: Math.ceil(120_000 / 1000),
  });
  return boundedShellResult(options.workspace.path, result.exitCode, Buffer.concat(chunks).toString("utf8"), options.maxShellOutputChars ?? 16_000);
}

async function runWorkflowFileRead(input: unknown, options: WorkflowDesktopToolBridgeOptions): Promise<{
  path: string;
  content: string;
  truncated: boolean;
  kind: string;
  language?: string;
  pdfText?: Omit<PdfTextExtraction, "text">;
  officeText?: Omit<OfficeTextExtraction, "text">;
}> {
  const { path } = filePathInput(input, "file_read");
  const file = await readWorkspaceFile(options.workspace.path, path);
  if (file.kind === "office" && file.officeText?.status !== "available") {
    throw new Error(`file_read could not extract Office text from ${file.path}: ${file.officeText?.error ?? file.officeText?.status ?? "unsupported"}`);
  }
  if (file.kind === "pdf" && file.pdfText && file.pdfText.status !== "available" && file.pdfText.status !== "no-text") {
    throw new Error(`file_read could not extract PDF text from ${file.path}: ${file.pdfText.error ?? file.pdfText.status}`);
  }
  if (file.binary && file.kind !== "office" && file.kind !== "pdf") {
    throw new Error(`file_read only supports text files, PDFs, or supported Office documents: ${file.path}`);
  }
  return {
    path: file.path,
    content: file.content,
    truncated: file.kind === "pdf" ? file.pdfText?.truncated === true : file.truncated,
    kind: file.kind,
    language: file.language,
    ...(file.pdfText ? { pdfText: pdfTextMetadata(file.pdfText) } : {}),
    ...(file.officeText ? { officeText: officeTextMetadata(file.officeText) } : {}),
  };
}

async function runWorkflowLocalDirectoryList(input: unknown): Promise<unknown> {
  const record = objectInput(input);
  const path = typeof record.path === "string" && record.path.trim() ? record.path : undefined;
  if (!path) throw new Error("local_directory_list path is required.");
  return listLocalDirectory({
    path,
    maxEntries: typeof record.maxEntries === "number" ? record.maxEntries : undefined,
    maxDepth: typeof record.maxDepth === "number" ? record.maxDepth : undefined,
    includeHidden: record.includeHidden === true,
  });
}

async function runWorkflowLocalFileRead(input: unknown, options: WorkflowDesktopToolBridgeOptions): Promise<{
  path: string;
  absolutePath: string;
  fileUrl?: string;
  content: string;
  truncated: boolean;
  kind: string;
  language?: string;
  size?: number;
  mtimeMs?: number;
  pdfText?: Omit<PdfTextExtraction, "text">;
  officeText?: Omit<OfficeTextExtraction, "text">;
}> {
  const { path } = filePathInput(input, "local_file_read");
  return readLocalTextFile(options.workspace.path, path, readLocalFilePreview);
}

async function runWorkflowLongContextProcess(input: unknown, options: WorkflowDesktopToolBridgeOptions): Promise<{
  runtime: string;
  response: string;
  taskType: LambdaRlmTaskType;
  composeOp: string;
  plan: unknown;
  inputLength: number;
  chunkCount: number;
  leafCount: number;
  modelCalls: number;
  elapsedMs: number;
  truncated: boolean;
  inputSources: Array<Record<string, unknown>>;
}> {
  const normalized = workflowLongContextInput(input);
  const maxOutputChars = Math.max(1, Math.floor(normalized.maxOutputChars ?? 120_000));
  const timeoutMs = Math.max(1_000, Math.floor(normalized.timeoutMs ?? 120_000));
  const collected = await workflowLongContextCollectedText(options.workspace.path, normalized);
  const text = collected.text;
  const query = normalized.question || normalized.instruction || "";
  const result = await executeLambdaRlm({
    text,
    taskType: normalized.taskType,
    query,
    contextWindowChars: normalized.contextWindowChars,
    accuracyTarget: normalized.accuracyTarget,
    aLeaf: normalized.aLeaf,
    aCompose: normalized.aCompose,
    maxModelCalls: normalized.maxModelCalls,
    signal: options.abortSignal,
    modelComplete:
      options.longContextModelComplete ??
      ((prompt, signal) =>
        completeAmbientText(workflowLongContextAmbientModel(options), prompt, {
          apiKey: readAmbientApiKey(),
          signal,
          timeoutMs,
        })),
  });
  const truncated = result.response.length > maxOutputChars;
  const response = truncated ? `${result.response.slice(0, maxOutputChars)}\n\n... truncated ...` : result.response;
  return {
    runtime: "ambient-lambda-rlm",
    response,
    taskType: result.taskType,
    composeOp: result.composeOp,
    plan: result.plan,
    inputLength: result.inputLength,
    chunkCount: result.chunkCount,
    leafCount: result.leafCount,
    modelCalls: result.modelCalls,
    elapsedMs: result.elapsedMs,
    truncated,
    inputSources: collected.sources,
  };
}

async function runWorkflowFileWrite(input: unknown, options: WorkflowDesktopToolBridgeOptions): Promise<{ path: string; bytes: number }> {
  const { path, content } = fileWriteInput(input);
  return writeWorkspaceTextFile(options.workspace.path, path, content);
}

async function runWorkflowAmbientCli(input: unknown, options: WorkflowDesktopToolBridgeOptions): Promise<AmbientCliRunResult> {
  const commandInput = ambientCliInput(input);
  const grant = options.manifest.ambientCliCapabilities?.find(
    (capability) =>
      capability.command === commandInput.command &&
      (capability.packageId === commandInput.packageId || capability.packageName === commandInput.packageName),
  );
  if (!grant) {
    throw new Error(`Workflow manifest does not declare Ambient CLI capability for ${commandInput.packageName ?? commandInput.packageId ?? "unknown"}:${commandInput.command}.`);
  }
  const runner = options.ambientCliRunner ?? runAmbientCliPackageCommand;
  return runner(options.workspace.path, {
    packageId: grant.packageId,
    command: grant.command,
    args: commandInput.args,
    ...(commandInput.cwd ? { cwd: commandInput.cwd } : {}),
  });
}

async function runWorkflowAmbientCliDescribe(input: unknown, options: WorkflowDesktopToolBridgeOptions): Promise<AmbientCliPackageDescription> {
  const describeInput = ambientCliDescribeInput(input);
  const describer =
    options.ambientCliDescriber ??
    ((workspacePath: string, request: DescribeAmbientCliPackageInput) =>
      describeAmbientCliPackage(workspacePath, request, {
        modelComplete: options.longContextModelComplete,
        signal: options.abortSignal,
      }));
  return describer(options.workspace.path, describeInput);
}

async function runWorkflowMiniCpmSetup(input: unknown, options: WorkflowDesktopToolBridgeOptions): Promise<MiniCpmVisionSetupResult> {
  const runner = options.vision?.setupMiniCpm ?? setupMiniCpmVisionProvider;
  return runner(options.workspace.path, miniCpmSetupInput(input), { signal: options.abortSignal });
}

async function runWorkflowMiniCpmAnalyze(input: unknown, options: WorkflowDesktopToolBridgeOptions): Promise<MiniCpmVisionAnalysisResult> {
  const runner = options.vision?.analyzeMiniCpm ?? analyzeMiniCpmVisionInput;
  return runner(options.workspace.path, miniCpmAnalyzeInput(input), { signal: options.abortSignal });
}

function dryRunWorkflowShell(input: unknown): WorkflowShellResult {
  const command = commandInput(input);
  return {
    exitCode: null,
    output: `[dry-run] skipped shell command: ${command}\n`,
    truncated: false,
  };
}

function dryRunMiniCpmSetup(input: unknown): unknown {
  const setup = miniCpmSetupInput(input);
  const stop = setup.action === "stop";
  return {
    provider: "minicpm-v",
    action: setup.action ?? "validate",
    status: stop ? "stopped" : "ready",
    packageName: "ambient-minicpm-v-vision",
    validation: stop
      ? { status: "stopped", runtimeState: { status: "stopped", running: false, recordedAt: new Date(0).toISOString() } }
      : { status: "passed", summary: "[dry-run] MiniCPM-V setup validated." },
    diagnostics: [],
    installStatuses: [],
    runtimeCandidates: [],
    nextSteps: [],
  };
}

function dryRunMiniCpmAnalyze(input: unknown): unknown {
  const analyze = miniCpmAnalyzeInput(input);
  const path = analyze.image?.path ?? analyze.imagePath ?? analyze.video?.path ?? analyze.videoPath ?? "[dry-run] image";
  return {
    provider: "minicpm-v",
    status: "passed",
    packageName: "ambient-minicpm-v-vision",
    task: analyze.task ?? "image_description",
    summary: `[dry-run] MiniCPM-V visual analysis for ${path}`,
    observations: [
      {
        kind: "uncertainty",
        description: "Dry-run visual placeholder.",
        confidence: "low",
        evidence: path,
      },
    ],
    limitations: ["Dry-run did not inspect image pixels."],
    image: { path, basename: path.split(/[\\/]/).pop() ?? path, bytes: 0, sha256: "0".repeat(64), source: "external_file" },
    artifacts: { jsonPath: analyze.outputJsonPath ?? ".ambient/vision/dry-run-analysis.json" },
    validation: { valid: true, errors: [] },
    redaction: {
      returnedImagePathIsWorkspaceRelative: false,
      stdoutDoesNotContainAbsoluteImagePath: true,
      artifactPathIsWorkspaceRelative: true,
    },
    installStatuses: [],
    commands: [],
    durationMs: 0,
  };
}

function dryRunWorkflowAmbientCli(input: unknown) {
  const commandInput = ambientCliInput(input);
  return {
    dryRun: true,
    skipped: true,
    toolName: "ambient_cli",
    packageId: commandInput.packageId,
    packageName: commandInput.packageName,
    command: commandInput.command,
    args: commandInput.args,
    cwd: commandInput.cwd,
  };
}

function dryRunWorkflowAmbientCliDescribe(input: unknown) {
  const describeInput = ambientCliDescribeInput(input);
  return {
    dryRun: true,
    skipped: true,
    toolName: "ambient_cli_describe",
    packageId: describeInput.packageId,
    packageName: describeInput.packageName,
    command: describeInput.command,
    includeSkill: describeInput.includeSkill,
    includeSummary: describeInput.includeSummary,
    maxSkillChars: describeInput.maxSkillChars,
  };
}

function dryRunWorkflowLongContextProcess(input: unknown) {
  const normalized = workflowLongContextInput(input);
  const text = normalized.text !== undefined ? workflowLongContextDirectText(normalized.text) : "";
  const workspacePaths = normalized.workspacePaths ?? [];
  const inputLength = text.length + workspacePaths.reduce((sum, path) => sum + path.length, 0);
  return {
    runtime: "ambient-lambda-rlm",
    dryRun: true,
    skipped: true,
    response: `[dry-run] long_context_process ${normalized.taskType ?? "general"} over ${inputLength} chars`,
    taskType: normalized.taskType ?? "general",
    composeOp: "concatenate",
    plan: { dryRun: true, n: inputLength },
    inputLength,
    chunkCount: 1,
    leafCount: 1,
    modelCalls: 0,
    elapsedMs: 0,
    truncated: false,
    inputSources: [
      ...(normalized.text !== undefined ? [{ type: "workflowInput", chars: text.length, structured: typeof normalized.text !== "string" }] : []),
      ...workspacePaths.map((path) => ({ type: "workspacePath", path, dryRun: true })),
    ],
  };
}

function dryRunWorkflowLocalDirectoryList(input: unknown) {
  const record = objectInput(input);
  const path = typeof record.path === "string" && record.path.trim() ? record.path : "[dry-run] local directory";
  return {
    rootPath: path,
    rootName: path.split(/[\\/]/).filter(Boolean).pop() ?? path,
    entries: [
      {
        path: "example-document.txt",
        name: "example-document.txt",
        type: "file",
        depth: 0,
        absolutePath: `${path.replace(/\/$/, "")}/example-document.txt`,
        extension: ".txt",
        size: 128,
      },
    ],
    truncated: false,
    totalKnownEntries: 1,
    skipped: [],
  };
}

function dryRunWorkflowLocalFileRead(input: unknown) {
  const record = objectInput(input);
  const path = typeof record.path === "string" && record.path.trim() ? record.path : "[dry-run] local file";
  return {
    path,
    absolutePath: path,
    content: "[dry-run] local file content",
    truncated: false,
    kind: "text",
  };
}

async function boundedShellResult(workspacePath: string, exitCode: number | null, output: string, maxChars: number): Promise<WorkflowShellResult> {
  const materialized = await materializeTextOutput(workspacePath, {
    label: "workflow-bash-output",
    text: output,
    maxPreviewChars: maxChars,
  });
  return {
    exitCode,
    output: materialized.text,
    truncated: materialized.truncated,
    ...(materialized.truncated
      ? {
          outputArtifactPath: materialized.artifactPath,
          outputArtifactBytes: materialized.artifactBytes,
          outputChars: materialized.totalChars,
          outputPreviewChars: materialized.previewChars,
          outputNotice: materializedTextNotice("workflow bash output", materialized),
        }
      : {}),
  };
}

function commandInput(input: unknown): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("bash input must be an object.");
  const command = (input as Record<string, unknown>).command;
  if (typeof command !== "string" || !command.trim()) throw new Error("bash command is required.");
  return command;
}

function filePathInput(input: unknown, toolName: string): { path: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`${toolName} input must be an object.`);
  const path = (input as Record<string, unknown>).path;
  if (typeof path !== "string" || !path.trim()) throw new Error(`${toolName} path is required.`);
  return { path };
}

function fileWriteInput(input: unknown): { path: string; content: string } {
  const { path } = filePathInput(input, "file_write");
  const content = (input as Record<string, unknown>).content;
  if (typeof content !== "string") throw new Error("file_write content is required.");
  return { path, content };
}

interface WorkflowLongContextInput {
  taskType?: LambdaRlmTaskType;
  instruction?: string;
  question?: string;
  text?: unknown;
  workspacePaths?: string[];
  contextWindowChars?: number;
  accuracyTarget?: number;
  aLeaf?: number;
  aCompose?: number;
  maxModelCalls?: number;
  timeoutMs?: number;
  maxOutputChars?: number;
}

function workflowLongContextInput(input: unknown): WorkflowLongContextInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("long_context_process input must be an object.");
  const record = input as Record<string, unknown>;
  const taskType = optionalString(record.taskType);
  if (taskType && !["summarization", "qa", "translation", "classification", "extraction", "analysis", "general"].includes(taskType)) {
    throw new Error(`Invalid long_context_process taskType: ${taskType}`);
  }
  const workspacePaths = optionalStringArray(record.workspacePaths, "workspacePaths");
  if (!("text" in record) && !workspacePaths?.length) throw new Error("long_context_process requires text or workspacePaths for workflow runtime use.");
  return {
    ...(taskType ? { taskType: taskType as LambdaRlmTaskType } : {}),
    ...(optionalString(record.instruction) ? { instruction: optionalString(record.instruction) } : {}),
    ...(optionalString(record.question) ? { question: optionalString(record.question) } : {}),
    ...("text" in record ? { text: record.text } : {}),
    ...(workspacePaths?.length ? { workspacePaths } : {}),
    ...(optionalNumber(record.contextWindowChars) !== undefined ? { contextWindowChars: optionalNumber(record.contextWindowChars) } : {}),
    ...(optionalNumber(record.accuracyTarget) !== undefined ? { accuracyTarget: optionalNumber(record.accuracyTarget) } : {}),
    ...(optionalNumber(record.aLeaf) !== undefined ? { aLeaf: optionalNumber(record.aLeaf) } : {}),
    ...(optionalNumber(record.aCompose) !== undefined ? { aCompose: optionalNumber(record.aCompose) } : {}),
    ...(optionalNumber(record.maxModelCalls) !== undefined ? { maxModelCalls: optionalNumber(record.maxModelCalls) } : {}),
    ...(optionalNumber(record.timeoutMs) !== undefined ? { timeoutMs: optionalNumber(record.timeoutMs) } : {}),
    ...(optionalNumber(record.maxOutputChars) !== undefined ? { maxOutputChars: optionalNumber(record.maxOutputChars) } : {}),
  };
}

async function workflowLongContextCollectedText(
  workspacePath: string,
  input: WorkflowLongContextInput,
): Promise<{ text: string; sources: Array<Record<string, unknown>> }> {
  const parts: string[] = [];
  const sources: Array<Record<string, unknown>> = [];
  if (input.text !== undefined) {
    const text = workflowLongContextDirectText(input.text);
    parts.push(text);
    sources.push({ type: "workflowInput", chars: text.length, structured: typeof input.text !== "string" });
  }
  for (const requestedPath of input.workspacePaths ?? []) {
    const file = await readWorkspaceFile(workspacePath, requestedPath);
    if (file.kind === "office" && file.officeText?.status !== "available") {
      throw new Error(`long_context_process could not extract Office text from ${file.path}: ${file.officeText?.error ?? file.officeText?.status ?? "unsupported"}`);
    }
    if (file.kind === "pdf" && file.pdfText?.status !== "available") {
      throw new Error(`long_context_process could not extract PDF text from ${file.path}: ${file.pdfText?.error ?? file.pdfText?.status ?? "unsupported"}`);
    }
    if (file.binary && file.kind !== "office" && file.kind !== "pdf") {
      throw new Error(`long_context_process only supports text files, PDFs, or supported Office documents: ${file.path}`);
    }
    const content = file.content;
    if (!content.trim()) throw new Error(`long_context_process found no extractable text in ${file.path}.`);
    parts.push([`File: ${file.path}`, workflowLongContextFileHeader(file), content].filter(Boolean).join("\n"));
    sources.push({
      type: "workspacePath",
      path: file.path,
      chars: content.length,
      truncated: file.kind === "pdf" ? file.pdfText?.truncated === true : file.truncated,
      ...(file.kind === "pdf" ? { pdfPages: file.pdfText?.pages } : {}),
      ...(file.kind === "office"
        ? {
            officeFormat: file.officeText?.format,
            officeUnitLabel: file.officeText?.unitLabel,
            officeUnitCount: file.officeText?.unitCount,
          }
        : {}),
    });
  }
  const text = parts.join("\n\n");
  if (!text.trim()) throw new Error("long_context_process requires non-empty text or workspacePaths.");
  return { text, sources };
}

function workflowLongContextFileHeader(file: Awaited<ReturnType<typeof readWorkspaceFile>>): string {
  if (file.kind === "pdf") {
    return [
      "PDF text extraction: available",
      file.pdfText?.pages !== undefined ? `PDF pages: ${file.pdfText.pages}` : undefined,
      file.pdfText?.truncated ? "PDF extracted text truncated." : undefined,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (file.kind === "office") {
    return [
      `Office format: ${file.officeText?.format ?? "unknown"}`,
      file.officeText?.unitLabel && file.officeText.unitCount !== undefined
        ? `Office ${file.officeText.unitLabel}: ${file.officeText.unitCount}`
        : undefined,
      file.officeText?.truncated ? "Office extracted text truncated." : undefined,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function workflowLongContextDirectText(value: unknown): string {
  if (typeof value === "string") {
    if (!value.trim()) throw new Error("long_context_process text must not be empty.");
    return value;
  }
  try {
    const text = JSON.stringify(value, null, 2);
    if (!text?.trim()) throw new Error("empty serialized value");
    return text;
  } catch (error) {
    throw new Error(`long_context_process could not serialize workflow text input: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function optionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${fieldName} must be an array of strings.`);
  const strings = value.map((item) => {
    if (typeof item !== "string" || !item.trim()) throw new Error(`${fieldName} must contain non-empty strings.`);
    return item.trim();
  });
  return strings.length ? strings : undefined;
}

function workflowLongContextAmbientModel(options: WorkflowDesktopToolBridgeOptions): Model<"openai-completions"> {
  const normalizedModelId = normalizeAmbientModelId(getActiveAmbientProviderModelOverride() ?? options.model ?? AMBIENT_DEFAULT_MODEL);
  return {
    id: normalizedModelId,
    name: ambientModelLabel(normalizedModelId),
    api: "openai-completions",
    provider: "ambient",
    baseUrl: normalizeAmbientBaseUrl(options.baseUrl ?? getActiveAmbientProviderBaseUrl()),
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "zai",
      zaiToolStream: true,
    },
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 131072,
  };
}

function objectInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function officeTextMetadata(officeText: OfficeTextExtraction): Omit<OfficeTextExtraction, "text"> {
  const { text: _text, ...metadata } = officeText;
  return metadata;
}

function pdfTextMetadata(pdfText: PdfTextExtraction): Omit<PdfTextExtraction, "text"> {
  const { text: _text, ...metadata } = pdfText;
  return metadata;
}

function ambientCliInput(input: unknown): RunAmbientCliInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("ambient_cli input must be an object.");
  const record = input as Record<string, unknown>;
  const packageId = typeof record.packageId === "string" && record.packageId.trim() ? record.packageId.trim() : undefined;
  const packageName = typeof record.packageName === "string" && record.packageName.trim() ? record.packageName.trim() : undefined;
  const command = typeof record.command === "string" && record.command.trim() ? record.command.trim() : undefined;
  if (!packageId && !packageName) throw new Error("ambient_cli packageId or packageName is required.");
  if (!command) throw new Error("ambient_cli command is required.");
  const args = Array.isArray(record.args)
    ? record.args.map((arg) => {
        if (typeof arg !== "string") throw new Error("ambient_cli args must be strings.");
        return arg;
      })
    : undefined;
  const cwd = typeof record.cwd === "string" && record.cwd.trim() ? record.cwd.trim() : undefined;
  return {
    ...(packageId ? { packageId } : {}),
    ...(packageName ? { packageName } : {}),
    command,
    ...(args ? { args } : {}),
    ...(cwd ? { cwd } : {}),
  };
}

function ambientCliDescribeInput(input: unknown): DescribeAmbientCliPackageInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("ambient_cli_describe input must be an object.");
  const record = input as Record<string, unknown>;
  const packageId = optionalString(record.packageId);
  const packageName = optionalString(record.packageName);
  if (!packageId && !packageName) throw new Error("ambient_cli_describe packageId or packageName is required.");
  return {
    ...(packageId ? { packageId } : {}),
    ...(packageName ? { packageName } : {}),
    ...(optionalString(record.command) ? { command: optionalString(record.command) } : {}),
    ...(optionalBoolean(record.includeSkill) !== undefined ? { includeSkill: optionalBoolean(record.includeSkill) } : {}),
    ...(optionalBoolean(record.includeSummary) !== undefined ? { includeSummary: optionalBoolean(record.includeSummary) } : {}),
    ...(optionalNumber(record.maxSkillChars) !== undefined ? { maxSkillChars: optionalNumber(record.maxSkillChars) } : {}),
  };
}

function miniCpmSetupInput(input: unknown): MiniCpmVisionSetupInput {
  const record = objectInput(input);
  const action = optionalString(record.action);
  if (action && !["install", "repair", "validate", "stop", "uninstall"].includes(action)) throw new Error("ambient_visual_minicpm_setup action must be install, repair, validate, stop, or uninstall.");
  const validationTask = miniCpmVisionTask(record.validationTask, "validationTask");
  return {
    provider: "minicpm-v",
    ...(action ? { action: action as MiniCpmVisionSetupInput["action"] } : {}),
    ...(optionalBoolean(record.installRuntime) !== undefined ? { installRuntime: optionalBoolean(record.installRuntime) } : {}),
    ...(optionalString(record.runtimeBinaryPath) ? { runtimeBinaryPath: optionalString(record.runtimeBinaryPath) } : {}),
    ...(optionalString(record.runtimeArchivePath) ? { runtimeArchivePath: optionalString(record.runtimeArchivePath) } : {}),
    ...(optionalString(record.runtimeArtifactId) ? { runtimeArtifactId: optionalString(record.runtimeArtifactId) } : {}),
    ...(optionalString(record.endpointUrl) ? { endpointUrl: optionalString(record.endpointUrl) } : {}),
    ...(optionalString(record.validationImagePath) ? { validationImagePath: optionalString(record.validationImagePath) } : {}),
    ...(validationTask ? { validationTask } : {}),
    ...(optionalString(record.validationPrompt) ? { validationPrompt: optionalString(record.validationPrompt) } : {}),
  };
}

function miniCpmAnalyzeInput(input: unknown): MiniCpmVisionAnalyzeInput {
  const record = objectInput(input);
  const image = miniCpmImageReference(record.image, "image");
  const video = miniCpmVideoReference(record.video, "video");
  const referenceImage = miniCpmImageReference(record.referenceImage, "referenceImage");
  const imagePath = optionalString(record.imagePath);
  const videoPath = optionalString(record.videoPath);
  if ((image || imagePath) && (video || videoPath)) {
    throw new Error("ambient_visual_analyze accepts one primary visual input: image/imagePath or video/videoPath, not both.");
  }
  if (!image && !imagePath && !video && !videoPath) throw new Error("ambient_visual_analyze requires image.path, imagePath, video.path, or videoPath.");
  const task = miniCpmVisionTask(record.task, "task");
  return {
    ...(imagePath ? { imagePath } : {}),
    ...(image ? { image } : {}),
    ...(videoPath ? { videoPath } : {}),
    ...(video ? { video } : {}),
    ...(optionalNumber(record.frameTimestampMs) !== undefined ? { frameTimestampMs: optionalNumber(record.frameTimestampMs) } : {}),
    ...(optionalString(record.referenceImagePath) ? { referenceImagePath: optionalString(record.referenceImagePath) } : {}),
    ...(referenceImage ? { referenceImage } : {}),
    ...(task ? { task } : {}),
    ...(optionalString(record.prompt) ? { prompt: optionalString(record.prompt) } : {}),
    ...(optionalString(record.outputJsonPath) ? { outputJsonPath: optionalString(record.outputJsonPath) } : {}),
    ...(optionalString(record.runtimeBinaryPath) ? { runtimeBinaryPath: optionalString(record.runtimeBinaryPath) } : {}),
    ...(optionalString(record.endpointUrl) ? { endpointUrl: optionalString(record.endpointUrl) } : {}),
    ...(optionalBoolean(record.allowExternalImagePaths) !== undefined ? { allowExternalImagePaths: optionalBoolean(record.allowExternalImagePaths) } : {}),
    ...(optionalBoolean(record.allowExternalMediaPaths) !== undefined ? { allowExternalMediaPaths: optionalBoolean(record.allowExternalMediaPaths) } : {}),
    ...(optionalBoolean(record.offline) !== undefined ? { offline: optionalBoolean(record.offline) } : {}),
    ...(optionalNumber(record.maxTokens) !== undefined ? { maxTokens: optionalNumber(record.maxTokens) } : {}),
  };
}

function miniCpmImageReference(value: unknown, label: string): MiniCpmVisionAnalyzeInput["image"] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const record = value as Record<string, unknown>;
  const path = optionalString(record.path);
  if (!path) throw new Error(`${label}.path is required.`);
  const source = optionalString(record.source);
  if (source && !["workspace_file", "browser_screenshot", "chat_attachment", "media_artifact", "selected_screenshot", "external_file"].includes(source)) {
    throw new Error(`${label}.source is not a supported MiniCPM-V image source.`);
  }
  return {
    path,
    ...(optionalBoolean(record.absolute) !== undefined ? { absolute: optionalBoolean(record.absolute) } : {}),
    ...(source ? { source: source as NonNullable<MiniCpmVisionAnalyzeInput["image"]>["source"] } : {}),
    ...(optionalString(record.label) ? { label: optionalString(record.label) } : {}),
  };
}

function miniCpmVideoReference(value: unknown, label: string): MiniCpmVisionAnalyzeInput["video"] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const record = value as Record<string, unknown>;
  const path = optionalString(record.path);
  if (!path) throw new Error(`${label}.path is required.`);
  const source = optionalString(record.source);
  if (source && !["workspace_file", "chat_attachment", "media_artifact", "external_file"].includes(source)) throw new Error(`${label}.source is not a supported MiniCPM-V video source.`);
  return {
    path,
    ...(optionalBoolean(record.absolute) !== undefined ? { absolute: optionalBoolean(record.absolute) } : {}),
    ...(source ? { source: source as NonNullable<MiniCpmVisionAnalyzeInput["video"]>["source"] } : {}),
    ...(optionalString(record.label) ? { label: optionalString(record.label) } : {}),
    ...(optionalNumber(record.frameTimestampMs) !== undefined ? { frameTimestampMs: optionalNumber(record.frameTimestampMs) } : {}),
  };
}

function miniCpmVisionTask(value: unknown, field: string): MiniCpmVisionAnalyzeInput["task"] | undefined {
  const task = optionalString(value);
  if (!task) return undefined;
  if (!["ui_review", "game_visual_review", "screenshot_ocr", "image_description", "design_comparison", "video_frame_review"].includes(task)) {
    throw new Error(`${field} must be a supported MiniCPM-V task.`);
  }
  return task as MiniCpmVisionAnalyzeInput["task"];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
