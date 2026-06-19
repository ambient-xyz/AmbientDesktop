import type { AgentToolResult } from "@mariozechner/pi-coding-agent";

import type {
  BrowserContentInput,
  BrowserPageContent,
  BrowserProfileMode,
  BrowserRuntimeKind,
  BrowserSearchInput,
  BrowserSearchResult,
  BrowserUserActionState,
} from "../../shared/browserTypes";
import type { WebResearchProviderConfig } from "../../shared/webResearchTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import {
  type AmbientCliRunResult,
  type RunAmbientCliInput,
  runAmbientCliPackageCommand,
} from "./localDeepResearchAmbientCliFacade";
import {
  browserToolFallback,
  browserUnavailableText,
  isBrowserUnavailableFallback,
  isBrowserUserActionState,
} from "./localDeepResearchAgentFacade";
import {
  ambientCliRunText,
  browserAuditRisk,
  browserContentText,
  browserSearchText,
  browserUserActionText,
  isWebResearchMcpProvider,
  materializeBrowserPageContent,
  webResearchNoProviderText,
} from "./localDeepResearchAgentRuntimeWebBrokerFacade";
import type { McpToolCallResult } from "./localDeepResearchMcpFacade";
import type { MaterializedTextOutput } from "./localDeepResearchToolRuntimeFacade";
import {
  callExaWebFetch,
  callExaWebSearch,
  type ExaWebFetchInput,
  type ExaWebResearchResult,
  type ExaWebSearchInput,
  isLikelyExaRateLimitError,
  type WebResearchProviderAttempt,
} from "./localDeepResearchWebResearchFacade";
import {
  WEB_RESEARCH_PROVIDER_IDS,
  type WebResearchProviderRequestPlan,
} from "./localDeepResearchWebResearchFacade";
import type { LocalDeepResearchBroker, LocalDeepResearchBrokerResult } from "./localDeepResearchAdapter";
import type { LocalDeepResearchProviderSnapshot } from "./localDeepResearchSetup";
import {
  localDeepResearchStatusSnapshot,
  localDeepResearchToolUpdate,
  type LocalDeepResearchRetrievalStatus,
} from "./localDeepResearchStatus";

type LocalDeepResearchWebBrokerUpdate = AgentToolResult<Record<string, unknown>>;
type LocalDeepResearchWebBrokerUpdateHandler = (update: LocalDeepResearchWebBrokerUpdate) => void;
type BrowserSearchWithActivityInput = BrowserSearchInput & { onActivity?: (activityMessage?: string) => void };
type BrowserContentWithActivityInput = BrowserContentInput & { onActivity?: (activityMessage?: string) => void };
type BrowserSearchResultOrUserAction = BrowserSearchResult[] | BrowserUserActionState;
type BrowserContentResultOrUserAction = BrowserPageContent | BrowserUserActionState;
type MaterializedBrowserPageContent = BrowserPageContent & { textOutput?: MaterializedTextOutput };

export interface LocalDeepResearchWebBrokerInput {
  threadId: string;
  workspace: WorkspaceState;
  providerSnapshot: LocalDeepResearchProviderSnapshot;
  signal?: AbortSignal;
  onUpdate?: LocalDeepResearchWebBrokerUpdateHandler;
}

export interface LocalDeepResearchWebResearchMcpProviderCallInput {
  threadId: string;
  workspace: WorkspaceState;
  provider: WebResearchProviderConfig;
  role: "search" | "fetch";
  value: string;
  rawInput: Record<string, unknown>;
  signal: AbortSignal | undefined;
  onUpdate?: LocalDeepResearchWebBrokerUpdateHandler;
}

export interface LocalDeepResearchScraplingRouteInput {
  threadId: string;
  workspace: WorkspaceState;
  url: string;
  rawInput: Record<string, unknown>;
  signal: AbortSignal | undefined;
  onUpdate?: LocalDeepResearchWebBrokerUpdateHandler;
}

export interface LocalDeepResearchWebBrokerOptions {
  webResearchProviderPlanForInput: (
    workspace: WorkspaceState,
    input: Record<string, unknown>,
    role: "search" | "fetch",
    signal?: AbortSignal,
    providerSnapshot?: LocalDeepResearchProviderSnapshot,
  ) => Promise<WebResearchProviderRequestPlan> | WebResearchProviderRequestPlan;
  webResearchExaApiKey: () => string | undefined;
  prepareBrowserToolProfile: (
    input: Record<string, unknown>,
    threadId: string,
    onUpdate?: LocalDeepResearchWebBrokerUpdateHandler,
  ) => Promise<{ profileMode: BrowserProfileMode; runtime: BrowserRuntimeKind | undefined }>;
  browserSearch: (input: BrowserSearchWithActivityInput) => Promise<BrowserSearchResultOrUserAction>;
  browserContent: (input: BrowserContentWithActivityInput) => Promise<BrowserContentResultOrUserAction>;
  emitBrowserState: () => Promise<void>;
  recordBrowserSearchAudit: (input: { threadId: string; profileMode: BrowserProfileMode; query: string }) => void;
  recordBrowserFetchAudit: (input: { threadId: string; profileMode: BrowserProfileMode; url: string }) => void;
  tryRouteBrowserContentThroughScrapling: (
    input: LocalDeepResearchScraplingRouteInput,
  ) => Promise<{ result?: AgentToolResult<Record<string, unknown>>; fallbackReason?: string }>;
  tryCallWebResearchMcpProvider: (
    input: LocalDeepResearchWebResearchMcpProviderCallInput,
  ) => Promise<{ result?: McpToolCallResult; fallbackReason?: string }>;
  materializeBrowserPageContent: (
    workspacePath: string,
    label: string,
    content: BrowserPageContent,
  ) => Promise<MaterializedBrowserPageContent>;
  withBrowserToolHeartbeat: <T>(
    toolName: string,
    message: string,
    operation: (markActivity: (activityMessage?: string) => void) => Promise<T>,
    onUpdate: LocalDeepResearchWebBrokerUpdateHandler | undefined,
    options?: { signal?: AbortSignal; timeoutMs?: number; heartbeatMs?: number },
  ) => Promise<T>;
  runAmbientCliPackageCommand?: (
    workspacePath: string,
    input: RunAmbientCliInput,
  ) => Promise<AmbientCliRunResult> | AmbientCliRunResult;
  callExaWebSearch?: (input: ExaWebSearchInput) => Promise<ExaWebResearchResult> | ExaWebResearchResult;
  callExaWebFetch?: (input: ExaWebFetchInput) => Promise<ExaWebResearchResult> | ExaWebResearchResult;
  formatAmbientCliRun?: (result: AmbientCliRunResult) => string;
  formatBrowserSearchResults?: (results: BrowserSearchResult[]) => string;
  formatBrowserContent: (content: MaterializedBrowserPageContent) => string;
  formatBrowserUserAction: (state: BrowserUserActionState) => string;
  formatErrorMessage: (error: unknown, maxChars: number) => string;
  truncateDiagnosticText: (value: string, maxChars: number) => string;
}

export interface AgentRuntimeLocalDeepResearchWebBrokerOptions {
  webResearchProviderPlanForInput: LocalDeepResearchWebBrokerOptions["webResearchProviderPlanForInput"];
  webResearchExaApiKey: LocalDeepResearchWebBrokerOptions["webResearchExaApiKey"];
  prepareBrowserToolProfile: LocalDeepResearchWebBrokerOptions["prepareBrowserToolProfile"];
  browserSearch: LocalDeepResearchWebBrokerOptions["browserSearch"];
  browserContent: LocalDeepResearchWebBrokerOptions["browserContent"];
  emitBrowserState: LocalDeepResearchWebBrokerOptions["emitBrowserState"];
  recordBrowserAudit: (
    threadId: string,
    toolName: "ambient_local_deep_research_run",
    risk: ReturnType<typeof browserAuditRisk>,
    detail: string,
  ) => void;
  tryRouteBrowserContentThroughScrapling: LocalDeepResearchWebBrokerOptions["tryRouteBrowserContentThroughScrapling"];
  tryCallWebResearchMcpProvider: LocalDeepResearchWebBrokerOptions["tryCallWebResearchMcpProvider"];
  withBrowserToolHeartbeat: LocalDeepResearchWebBrokerOptions["withBrowserToolHeartbeat"];
  formatErrorMessage: LocalDeepResearchWebBrokerOptions["formatErrorMessage"];
  truncateDiagnosticText: LocalDeepResearchWebBrokerOptions["truncateDiagnosticText"];
}

export function createLocalDeepResearchWebBroker(
  input: LocalDeepResearchWebBrokerInput,
  options: LocalDeepResearchWebBrokerOptions,
): LocalDeepResearchBroker {
  return {
    search: async (toolInput) => localDeepResearchWebSearch(input, toolInput, options),
    visit: async (toolInput) => localDeepResearchWebFetch(input, toolInput, options),
  };
}

export function createAgentRuntimeLocalDeepResearchWebBroker(
  input: LocalDeepResearchWebBrokerInput,
  options: AgentRuntimeLocalDeepResearchWebBrokerOptions,
): LocalDeepResearchBroker {
  return createLocalDeepResearchWebBroker(input, agentRuntimeLocalDeepResearchWebBrokerOptions(options));
}

export function agentRuntimeLocalDeepResearchWebBrokerOptions(
  options: AgentRuntimeLocalDeepResearchWebBrokerOptions,
): LocalDeepResearchWebBrokerOptions {
  return {
    webResearchProviderPlanForInput: options.webResearchProviderPlanForInput,
    webResearchExaApiKey: options.webResearchExaApiKey,
    prepareBrowserToolProfile: options.prepareBrowserToolProfile,
    browserSearch: options.browserSearch,
    browserContent: options.browserContent,
    emitBrowserState: options.emitBrowserState,
    recordBrowserSearchAudit: ({ threadId, profileMode, query }) =>
      options.recordBrowserAudit(threadId, "ambient_local_deep_research_run", browserAuditRisk(profileMode, "browser-network"), query),
    recordBrowserFetchAudit: ({ threadId, profileMode, url }) =>
      options.recordBrowserAudit(threadId, "ambient_local_deep_research_run", browserAuditRisk(profileMode, "browser-network"), url),
    tryRouteBrowserContentThroughScrapling: options.tryRouteBrowserContentThroughScrapling,
    tryCallWebResearchMcpProvider: options.tryCallWebResearchMcpProvider,
    materializeBrowserPageContent,
    withBrowserToolHeartbeat: options.withBrowserToolHeartbeat,
    runAmbientCliPackageCommand,
    formatAmbientCliRun: ambientCliRunText,
    formatBrowserSearchResults: browserSearchText,
    formatBrowserContent: browserContentText,
    formatBrowserUserAction: browserUserActionText,
    formatErrorMessage: options.formatErrorMessage,
    truncateDiagnosticText: options.truncateDiagnosticText,
  };
}

export async function localDeepResearchWebSearch(
  runtime: LocalDeepResearchWebBrokerInput,
  input: { query: string; maxResults?: number },
  options: LocalDeepResearchWebBrokerOptions,
): Promise<LocalDeepResearchBrokerResult> {
  const runAmbientCli = options.runAmbientCliPackageCommand ?? runAmbientCliPackageCommand;
  const callExaSearch = options.callExaWebSearch ?? callExaWebSearch;
  const formatAmbientCli = options.formatAmbientCliRun ?? ambientCliRunText;
  const formatBrowserSearch = options.formatBrowserSearchResults ?? browserSearchText;
  const attempts: WebResearchProviderAttempt[] = [];
  const rawInput = { query: input.query, ...(input.maxResults ? { maxResults: input.maxResults } : {}) };
  const providerPlan = await options.webResearchProviderPlanForInput(runtime.workspace, rawInput, "search", runtime.signal, runtime.providerSnapshot);
  attempts.push(...providerPlan.skippedProviders.map((skipped) => ({
    providerId: skipped.providerId,
    status: "skipped" as const,
    reason: skipped.reason,
  })));
  const providerById = new Map(providerPlan.providers.map((provider) => [provider.providerId, provider]));
  for (const providerId of providerPlan.providerOrder) {
    if (providerId === WEB_RESEARCH_PROVIDER_IDS.exa) {
      emitLocalDeepResearchRetrievalUpdate(runtime, {
        role: "search",
        status: "starting",
        providerId,
        providerLabel: "Exa MCP",
        query: input.query,
        message: `Searching with Exa MCP for "${input.query}".`,
      });
      try {
        const result = await callExaSearch({
          workspacePath: runtime.workspace.path,
          query: input.query,
          maxResults: input.maxResults,
          signal: runtime.signal,
          apiKey: options.webResearchExaApiKey(),
        });
        attempts.push({ providerId, status: "succeeded", tool: result.tool, durationMs: result.durationMs });
        emitLocalDeepResearchRetrievalUpdate(runtime, {
          role: "search",
          status: "succeeded",
          providerId,
          providerLabel: "Exa MCP",
          query: input.query,
          durationMs: result.durationMs,
          outputChars: result.text.length,
          textOutputPath: result.output.artifactPath,
          message: `Exa MCP search returned ${result.text.length.toLocaleString()} chars for "${input.query}".`,
        });
        return { text: result.text, selectedProvider: providerId, attempts, textOutputPath: result.output.artifactPath, metadata: { textOutput: result.output } };
      } catch (error) {
        const reason = `${isLikelyExaRateLimitError(error) ? "rate-limited: " : ""}${options.formatErrorMessage(error, 1_000)}`;
        attempts.push({
          providerId,
          status: "failed",
          tool: "web_search_exa",
          reason,
        });
        emitLocalDeepResearchRetrievalUpdate(runtime, {
          role: "search",
          status: "failed",
          providerId,
          providerLabel: "Exa MCP",
          query: input.query,
          failureReason: reason,
          message: `Exa MCP search failed for "${input.query}".`,
        });
      }
      continue;
    }
    if (providerId === WEB_RESEARCH_PROVIDER_IDS.browser) {
      emitLocalDeepResearchRetrievalUpdate(runtime, {
        role: "search",
        status: "starting",
        providerId,
        providerLabel: "Ambient Browser",
        query: input.query,
        message: `Searching with Ambient Browser for "${input.query}".`,
      });
      const { profileMode, runtime: browserRuntime } = await options.prepareBrowserToolProfile(rawInput, runtime.threadId, runtime.onUpdate);
      const startedAt = Date.now();
      const results = await options.withBrowserToolHeartbeat(
        "ambient_local_deep_research_run",
        "Local Deep Research browser fallback search is still running. If a CAPTCHA or browser challenge is visible, complete it in the Browser panel.",
        (markActivity) =>
          options.browserSearch({
            query: input.query,
            maxResults: input.maxResults,
            fetchContent: false,
            profileMode,
            runtime: browserRuntime,
            waitForUserAction: false,
            sourceThreadId: runtime.threadId,
            onActivity: markActivity,
          }),
        runtime.onUpdate,
        { signal: runtime.signal },
      ).catch((error) => browserToolFallback(error));
      await options.emitBrowserState();
      if (!Array.isArray(results)) {
        const reason = options.truncateDiagnosticText(isBrowserUnavailableFallback(results) ? browserUnavailableText(results) : options.formatBrowserUserAction(results), 1_000);
        attempts.push({
          providerId,
          status: "failed",
          reason,
        });
        emitLocalDeepResearchRetrievalUpdate(runtime, {
          role: "search",
          status: "failed",
          providerId,
          providerLabel: "Ambient Browser",
          query: input.query,
          failureReason: reason,
          message: `Ambient Browser search failed for "${input.query}".`,
        });
        continue;
      }
      attempts.push({ providerId, status: "succeeded", tool: "browser_search", durationMs: Date.now() - startedAt });
      emitLocalDeepResearchRetrievalUpdate(runtime, {
        role: "search",
        status: "succeeded",
        providerId,
        providerLabel: "Ambient Browser",
        query: input.query,
        durationMs: Date.now() - startedAt,
        resultCount: results.length,
        outputChars: formatBrowserSearch(results).length,
        message: `Ambient Browser search returned ${results.length.toLocaleString()} result(s) for "${input.query}".`,
      });
      options.recordBrowserSearchAudit({ threadId: runtime.threadId, profileMode, query: input.query });
      return { text: formatBrowserSearch(results), selectedProvider: providerId, attempts, metadata: { profileMode, runtime: browserRuntime, results } };
    }
    const ambientCliProvider = providerById.get(providerId);
    if (ambientCliProvider?.kind === "ambient-cli" && ambientCliProvider.ambientCli) {
      const binding = ambientCliProvider.ambientCli;
      emitLocalDeepResearchRetrievalUpdate(runtime, {
        role: "search",
        status: "starting",
        providerId,
        providerLabel: ambientCliProvider.label,
        query: input.query,
        message: `Searching with ${ambientCliProvider.label} for "${input.query}".`,
      });
      try {
        const result = await runAmbientCli(runtime.workspace.path, {
          packageName: binding.packageName,
          command: binding.commandName,
          args: [input.query],
          signal: runtime.signal,
        });
        attempts.push({ providerId, status: "succeeded", tool: `ambient_cli:${result.packageName}:${result.commandName}`, durationMs: result.durationMs });
        emitLocalDeepResearchRetrievalUpdate(runtime, {
          role: "search",
          status: "succeeded",
          providerId,
          providerLabel: ambientCliProvider.label,
          query: input.query,
          durationMs: result.durationMs,
          outputChars: (result.stdout?.trim() ? result.stdout : formatAmbientCli(result)).length,
          textOutputPath: result.stdoutOutput?.artifactPath,
          message: `${ambientCliProvider.label} search returned output for "${input.query}".`,
        });
        return {
          text: result.stdout?.trim() ? result.stdout : formatAmbientCli(result),
          selectedProvider: providerId,
          attempts,
          textOutputPath: result.stdoutOutput?.artifactPath,
          metadata: { provider: ambientCliProvider.label, stdoutOutput: result.stdoutOutput, stderrOutput: result.stderrOutput },
        };
      } catch (error) {
        const reason = options.formatErrorMessage(error, 1_000);
        attempts.push({ providerId, status: "failed", tool: `ambient_cli:${binding.packageName}:${binding.commandName}`, reason });
        emitLocalDeepResearchRetrievalUpdate(runtime, {
          role: "search",
          status: "failed",
          providerId,
          providerLabel: ambientCliProvider.label,
          query: input.query,
          failureReason: reason,
          message: `${ambientCliProvider.label} search failed for "${input.query}".`,
        });
      }
      continue;
    }
    const mcpProvider = providerById.get(providerId);
    if (isWebResearchMcpProvider(mcpProvider, "search")) {
      emitLocalDeepResearchRetrievalUpdate(runtime, {
        role: "search",
        status: "starting",
        providerId,
        providerLabel: mcpProvider.label,
        query: input.query,
        message: `Searching with ${mcpProvider.label}.`,
      });
      const startedAt = Date.now();
      const mcpRoute = await options.tryCallWebResearchMcpProvider({
        threadId: runtime.threadId,
        workspace: runtime.workspace,
        provider: mcpProvider,
        role: "search",
        value: input.query,
        rawInput,
        signal: runtime.signal,
        onUpdate: runtime.onUpdate,
      });
      if (mcpRoute.result) {
        attempts.push({ providerId, status: "succeeded", tool: mcpRoute.result.descriptor.toolRef, durationMs: Date.now() - startedAt });
        emitLocalDeepResearchRetrievalUpdate(runtime, {
          role: "search",
          status: "succeeded",
          providerId,
          providerLabel: mcpProvider.label,
          query: input.query,
          durationMs: Date.now() - startedAt,
          outputChars: mcpRoute.result.text.length,
          textOutputPath: mcpRoute.result.output.artifactPath,
          message: `${mcpProvider.label} search returned ${mcpRoute.result.text.length.toLocaleString()} chars.`,
        });
        return {
          text: mcpRoute.result.text,
          selectedProvider: providerId,
          attempts,
          textOutputPath: mcpRoute.result.output.artifactPath,
          metadata: { textOutput: mcpRoute.result.output },
        };
      }
      const reason = options.truncateDiagnosticText(mcpRoute.fallbackReason ?? "MCP provider did not return a result.", 1_000);
      attempts.push({ providerId, status: "failed", reason });
      emitLocalDeepResearchRetrievalUpdate(runtime, {
        role: "search",
        status: "failed",
        providerId,
        providerLabel: mcpProvider.label,
        query: input.query,
        failureReason: reason,
        message: `${mcpProvider.label} search did not return a result.`,
      });
      continue;
    }
    attempts.push({ providerId, status: "skipped", reason: "Provider is registered for search, but no Local Deep Research broker adapter is available yet." });
  }
  return { text: webResearchNoProviderText("search", attempts), attempts };
}

export async function localDeepResearchWebFetch(
  runtime: LocalDeepResearchWebBrokerInput,
  input: { url: string; maxCharacters?: number },
  options: LocalDeepResearchWebBrokerOptions,
): Promise<LocalDeepResearchBrokerResult> {
  const callExaFetch = options.callExaWebFetch ?? callExaWebFetch;
  const url = normalizeWebResearchUrl(input.url);
  const attempts: WebResearchProviderAttempt[] = [];
  const rawInput = { url, ...(input.maxCharacters ? { maxCharacters: input.maxCharacters } : {}) };
  const providerPlan = await options.webResearchProviderPlanForInput(runtime.workspace, rawInput, "fetch", runtime.signal, runtime.providerSnapshot);
  attempts.push(...providerPlan.skippedProviders.map((skipped) => ({
    providerId: skipped.providerId,
    status: "skipped" as const,
    reason: skipped.reason,
  })));
  const providerById = new Map(providerPlan.providers.map((provider) => [provider.providerId, provider]));
  for (const providerId of providerPlan.providerOrder) {
    if (providerId === WEB_RESEARCH_PROVIDER_IDS.scrapling) {
      emitLocalDeepResearchRetrievalUpdate(runtime, {
        role: "fetch",
        status: "starting",
        providerId,
        providerLabel: "Scrapling MCP",
        url,
        message: `Reading ${url} with Scrapling MCP.`,
      });
      const startedAt = Date.now();
      const scraplingRoute = await options.tryRouteBrowserContentThroughScrapling({
        threadId: runtime.threadId,
        workspace: runtime.workspace,
        url,
        rawInput,
        signal: runtime.signal,
        onUpdate: runtime.onUpdate,
      });
      if (scraplingRoute.result) {
        const text = textFromToolResult(scraplingRoute.result);
        attempts.push({ providerId, status: "succeeded", tool: String(scraplingRoute.result.details?.targetToolName ?? "scrapling"), durationMs: Date.now() - startedAt });
        const textOutput = scraplingRoute.result.details?.textOutput as MaterializedTextOutput | undefined;
        emitLocalDeepResearchRetrievalUpdate(runtime, {
          role: "fetch",
          status: "succeeded",
          providerId,
          providerLabel: "Scrapling MCP",
          url,
          durationMs: Date.now() - startedAt,
          outputChars: text.length,
          textOutputPath: textOutput?.artifactPath,
          message: `Scrapling MCP read ${text.length.toLocaleString()} chars from ${url}.`,
        });
        return { text, selectedProvider: providerId, attempts, textOutputPath: textOutput?.artifactPath, metadata: { textOutput } };
      }
      const reason = options.truncateDiagnosticText(scraplingRoute.fallbackReason ?? "Scrapling did not return a result.", 1_000);
      attempts.push({ providerId, status: "failed", reason });
      emitLocalDeepResearchRetrievalUpdate(runtime, {
        role: "fetch",
        status: "failed",
        providerId,
        providerLabel: "Scrapling MCP",
        url,
        failureReason: reason,
        message: `Scrapling MCP did not return a result for ${url}.`,
      });
      continue;
    }
    if (providerId === WEB_RESEARCH_PROVIDER_IDS.exa) {
      emitLocalDeepResearchRetrievalUpdate(runtime, {
        role: "fetch",
        status: "starting",
        providerId,
        providerLabel: "Exa MCP",
        url,
        message: `Reading ${url} with Exa MCP fetch.`,
      });
      try {
        const result = await callExaFetch({
          workspacePath: runtime.workspace.path,
          url,
          maxCharacters: input.maxCharacters,
          signal: runtime.signal,
          apiKey: options.webResearchExaApiKey(),
        });
        attempts.push({ providerId, status: "succeeded", tool: result.tool, durationMs: result.durationMs });
        emitLocalDeepResearchRetrievalUpdate(runtime, {
          role: "fetch",
          status: "succeeded",
          providerId,
          providerLabel: "Exa MCP",
          url,
          durationMs: result.durationMs,
          outputChars: result.text.length,
          textOutputPath: result.output.artifactPath,
          message: `Exa MCP fetch read ${result.text.length.toLocaleString()} chars from ${url}.`,
        });
        return { text: result.text, selectedProvider: providerId, attempts, textOutputPath: result.output.artifactPath, metadata: { textOutput: result.output } };
      } catch (error) {
        const reason = `${isLikelyExaRateLimitError(error) ? "rate-limited: " : ""}${options.formatErrorMessage(error, 1_000)}`;
        attempts.push({
          providerId,
          status: "failed",
          tool: "web_fetch_exa",
          reason,
        });
        emitLocalDeepResearchRetrievalUpdate(runtime, {
          role: "fetch",
          status: "failed",
          providerId,
          providerLabel: "Exa MCP",
          url,
          failureReason: reason,
          message: `Exa MCP fetch failed for ${url}.`,
        });
      }
      continue;
    }
    if (providerId === WEB_RESEARCH_PROVIDER_IDS.browser) {
      emitLocalDeepResearchRetrievalUpdate(runtime, {
        role: "fetch",
        status: "starting",
        providerId,
        providerLabel: "Ambient Browser",
        url,
        message: `Reading ${url} with Ambient Browser.`,
      });
      const { profileMode, runtime: browserRuntime } = await options.prepareBrowserToolProfile(rawInput, runtime.threadId, runtime.onUpdate);
      const startedAt = Date.now();
      const content = await options.withBrowserToolHeartbeat(
        "ambient_local_deep_research_run",
        "Local Deep Research browser fallback page reading is still running. If a CAPTCHA or browser challenge is visible, complete it in the Browser panel.",
        (markActivity) => options.browserContent({ url, profileMode, runtime: browserRuntime, waitForUserAction: false, sourceThreadId: runtime.threadId, onActivity: markActivity }),
        runtime.onUpdate,
        { signal: runtime.signal },
      ).catch((error) => browserToolFallback(error));
      await options.emitBrowserState();
      if (isBrowserUnavailableFallback(content) || isBrowserUserActionState(content)) {
        const reason = options.truncateDiagnosticText(isBrowserUnavailableFallback(content) ? browserUnavailableText(content) : options.formatBrowserUserAction(content), 1_000);
        attempts.push({ providerId, status: "failed", reason });
        emitLocalDeepResearchRetrievalUpdate(runtime, {
          role: "fetch",
          status: "failed",
          providerId,
          providerLabel: "Ambient Browser",
          url,
          failureReason: reason,
          message: `Ambient Browser could not read ${url}.`,
        });
        continue;
      }
      attempts.push({ providerId, status: "succeeded", tool: "browser_content", durationMs: Date.now() - startedAt });
      options.recordBrowserFetchAudit({ threadId: runtime.threadId, profileMode, url: content.url ?? url });
      const materialized = await options.materializeBrowserPageContent(runtime.workspace.path, "local-deep-research-fetch", content);
      emitLocalDeepResearchRetrievalUpdate(runtime, {
        role: "fetch",
        status: "succeeded",
        providerId,
        providerLabel: "Ambient Browser",
        url: content.url ?? url,
        durationMs: Date.now() - startedAt,
        outputChars: content.text.length,
        textOutputPath: materialized.textOutput?.artifactPath,
        message: `Ambient Browser read ${content.text.length.toLocaleString()} chars from ${content.url ?? url}.`,
      });
      return {
        text: options.formatBrowserContent(materialized),
        selectedProvider: providerId,
        attempts,
        textOutputPath: materialized.textOutput?.artifactPath,
        metadata: { profileMode, runtime: browserRuntime, textOutput: materialized.textOutput },
      };
    }
    const mcpProvider = providerById.get(providerId);
    if (isWebResearchMcpProvider(mcpProvider, "fetch")) {
      emitLocalDeepResearchRetrievalUpdate(runtime, {
        role: "fetch",
        status: "starting",
        providerId,
        providerLabel: mcpProvider.label,
        url,
        message: `Reading ${url} with ${mcpProvider.label}.`,
      });
      const startedAt = Date.now();
      const mcpRoute = await options.tryCallWebResearchMcpProvider({
        threadId: runtime.threadId,
        workspace: runtime.workspace,
        provider: mcpProvider,
        role: "fetch",
        value: url,
        rawInput,
        signal: runtime.signal,
        onUpdate: runtime.onUpdate,
      });
      if (mcpRoute.result) {
        attempts.push({ providerId, status: "succeeded", tool: mcpRoute.result.descriptor.toolRef, durationMs: Date.now() - startedAt });
        emitLocalDeepResearchRetrievalUpdate(runtime, {
          role: "fetch",
          status: "succeeded",
          providerId,
          providerLabel: mcpProvider.label,
          url,
          durationMs: Date.now() - startedAt,
          outputChars: mcpRoute.result.text.length,
          textOutputPath: mcpRoute.result.output.artifactPath,
          message: `${mcpProvider.label} read ${mcpRoute.result.text.length.toLocaleString()} chars from ${url}.`,
        });
        return {
          text: mcpRoute.result.text,
          selectedProvider: providerId,
          attempts,
          textOutputPath: mcpRoute.result.output.artifactPath,
          metadata: { textOutput: mcpRoute.result.output },
        };
      }
      const reason = options.truncateDiagnosticText(mcpRoute.fallbackReason ?? "MCP provider did not return a result.", 1_000);
      attempts.push({ providerId, status: "failed", reason });
      emitLocalDeepResearchRetrievalUpdate(runtime, {
        role: "fetch",
        status: "failed",
        providerId,
        providerLabel: mcpProvider.label,
        url,
        failureReason: reason,
        message: `${mcpProvider.label} did not return content for ${url}.`,
      });
      continue;
    }
    attempts.push({ providerId, status: "skipped", reason: "Provider is registered for URL fetch, but no Local Deep Research broker adapter is available yet." });
  }
  return { text: webResearchNoProviderText("fetch", attempts), attempts };
}

function emitLocalDeepResearchRetrievalUpdate(
  runtime: LocalDeepResearchWebBrokerInput,
  input: LocalDeepResearchRetrievalStatus & { message: string },
): void {
  runtime.onUpdate?.(localDeepResearchToolUpdate("ambient_local_deep_research_run", localDeepResearchStatusSnapshot({
    stage: "retrieval",
    message: input.message,
    retrieval: {
      role: input.role,
      status: input.status,
      ...(input.providerId ? { providerId: input.providerId } : {}),
      ...(input.providerLabel ? { providerLabel: input.providerLabel } : {}),
      ...(input.query ? { query: input.query } : {}),
      ...(input.url ? { url: input.url } : {}),
      ...(input.resultCount !== undefined ? { resultCount: input.resultCount } : {}),
      ...(input.outputChars !== undefined ? { outputChars: input.outputChars } : {}),
      ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
      ...(input.repeatedVisitCount !== undefined ? { repeatedVisitCount: input.repeatedVisitCount } : {}),
      ...(input.failureReason ? { failureReason: input.failureReason } : {}),
      ...(input.textOutputPath ? { textOutputPath: input.textOutputPath } : {}),
    },
  })));
}

function normalizeWebResearchUrl(url: string): string {
  const trimmed = url.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withScheme);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("web_research_fetch only supports public HTTP(S) URLs.");
  return parsed.toString();
}

function textFromToolResult(result: AgentToolResult<Record<string, unknown>>): string {
  return result.content.map((item) => item.type === "text" ? item.text : "").filter(Boolean).join("\n").trim();
}
