import type { AgentToolResult, ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  BrowserProfileMode,
  BrowserRuntimeKind,
  BrowserSearchInput,
  BrowserSearchResult,
  BrowserUserActionState,
  WebResearchProviderConfig,
  WorkspaceState,
} from "../../../shared/types";
import {
  type AmbientCliRunResult,
  type RunAmbientCliInput,
  runAmbientCliPackageCommand,
} from "../../ambient-cli/ambientCliPackages";
import {
  browserToolFallback,
  browserUnavailableText,
  isBrowserUnavailableFallback,
} from "../../agent/agentBrowserRuntime";
import { webResearchToolDescriptor } from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";
import type { McpToolCallResult } from "../../mcp/mcpToolBridge";
import { webResearchToolResult } from "./agentRuntimeWebResearchStatusTools";
import {
  isWebResearchMcpProvider,
  webResearchMaterializedToolResult,
  webResearchNoProviderText,
  webResearchResultText,
  webResearchToolUpdate,
} from "./agentRuntimeWebResearchToolFormatting";
import {
  callExaWebSearch,
  type ExaWebResearchResult,
  type ExaWebSearchInput,
  isLikelyExaRateLimitError,
  type WebResearchProviderAttempt,
} from "../../web-research/webResearchBroker";
import {
  WEB_RESEARCH_PROVIDER_IDS,
  type WebResearchProviderRequestPlan,
} from "../../web-research/webResearchProviderStack";

type WebResearchSearchToolUpdate = AgentToolResult<Record<string, unknown>>;
type WebResearchSearchToolUpdateHandler = (update: WebResearchSearchToolUpdate) => void;
type BrowserSearchWithActivityInput = BrowserSearchInput & { onActivity?: (activityMessage?: string) => void };
type BrowserSearchResultOrUserAction = BrowserSearchResult[] | BrowserUserActionState;

export interface WebResearchSearchMcpProviderCallInput {
  threadId: string;
  workspace: WorkspaceState;
  provider: WebResearchProviderConfig;
  role: "search";
  value: string;
  rawInput: Record<string, unknown>;
  signal: AbortSignal | undefined;
  onUpdate?: WebResearchSearchToolUpdateHandler;
}

export interface WebResearchSearchToolRegistrationOptions {
  threadId: string;
  workspace: WorkspaceState;
  webResearchProviderPlanForInput: (
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<WebResearchProviderRequestPlan>;
  webResearchExaApiKey: () => string | undefined;
  prepareBrowserToolProfile: (
    input: Record<string, unknown>,
    threadId: string,
    onUpdate?: WebResearchSearchToolUpdateHandler,
  ) => Promise<{ profileMode: BrowserProfileMode; runtime: BrowserRuntimeKind | undefined }>;
  browserSearch: (input: BrowserSearchWithActivityInput) => Promise<BrowserSearchResultOrUserAction>;
  emitBrowserState: () => Promise<void>;
  recordBrowserSearchAudit: (input: { profileMode: BrowserProfileMode; query: string }) => void;
  tryCallWebResearchMcpProvider: (
    input: WebResearchSearchMcpProviderCallInput,
  ) => Promise<{ result?: McpToolCallResult; fallbackReason?: string }>;
  withBrowserToolHeartbeat: <T>(
    toolName: string,
    message: string,
    operation: (markActivity: (activityMessage?: string) => void) => Promise<T>,
    onUpdate: WebResearchSearchToolUpdateHandler | undefined,
    options?: { signal?: AbortSignal; timeoutMs?: number; heartbeatMs?: number },
  ) => Promise<T>;
  formatAmbientCliRun: (result: AmbientCliRunResult) => string;
  formatBrowserSearchResults: (results: BrowserSearchResult[]) => string;
  formatBrowserUserAction: (state: BrowserUserActionState) => string;
  formatErrorMessage: (error: unknown, maxChars: number) => string;
  callExaWebSearch?: (input: ExaWebSearchInput) => Promise<ExaWebResearchResult>;
  runAmbientCliPackageCommand?: (workspacePath: string, input: RunAmbientCliInput) => Promise<AmbientCliRunResult>;
  now?: () => number;
}

export function registerWebResearchSearchTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: WebResearchSearchToolRegistrationOptions,
): void {
  const exaSearch = options.callExaWebSearch ?? callExaWebSearch;
  const ambientCliCommand = options.runAmbientCliPackageCommand ?? runAmbientCliPackageCommand;
  const now = options.now ?? Date.now;

  registerDesktopTool(pi, webResearchToolDescriptor("web_research_search"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal, onUpdate) => {
      const input = params as Record<string, unknown>;
      const query = requiredString(input, "query");
      const attempts: WebResearchProviderAttempt[] = [];
      const providerPlan = await options.webResearchProviderPlanForInput(input, signal);
      attempts.push(...providerPlan.skippedProviders.map((skipped) => ({
        providerId: skipped.providerId,
        status: "skipped" as const,
        reason: skipped.reason,
      })));
      const providerOrder = providerPlan.providerOrder;
      const providerById = new Map(providerPlan.providers.map((provider) => [provider.providerId, provider]));
      for (let providerIndex = 0; providerIndex < providerOrder.length; providerIndex += 1) {
        const providerId = providerOrder[providerIndex]!;
        if (providerId === WEB_RESEARCH_PROVIDER_IDS.exa) {
          onUpdate?.(webResearchToolUpdate("web_research_search", `Searching with Exa MCP for "${query}".`));
          try {
            const result = await exaSearch({
              workspacePath: options.workspace.path,
              query,
              maxResults: optionalNumber(input.maxResults),
              signal,
              apiKey: options.webResearchExaApiKey(),
            });
            attempts.push({ providerId, status: "succeeded", tool: result.tool, durationMs: result.durationMs });
            return webResearchToolResult(webResearchResultText(result.text, "search", providerId, attempts, result.output), {
              toolName: "web_research_search",
              role: "search",
              query,
              selectedProvider: providerId,
              attempts,
              textOutput: result.output,
            });
          } catch (error) {
            attempts.push({
              providerId,
              status: "failed",
              tool: "web_search_exa",
              reason: `${isLikelyExaRateLimitError(error) ? "rate-limited: " : ""}${options.formatErrorMessage(error, 1_000)}`,
            });
          }
          continue;
        }
        if (providerId === WEB_RESEARCH_PROVIDER_IDS.browser) {
          onUpdate?.(webResearchToolUpdate("web_research_search", `Searching with Ambient Browser for "${query}".`));
          const { profileMode, runtime } = await options.prepareBrowserToolProfile(input, options.threadId, onUpdate);
          const startedAt = now();
          const results = await options.withBrowserToolHeartbeat(
            "web_research_search",
            "Browser fallback search is still running. If a CAPTCHA or browser challenge is visible, complete it in the Browser panel.",
            (markActivity) =>
              options.browserSearch({
                query,
                maxResults: optionalNumber(input.maxResults),
                fetchContent: input.fetchContent === true,
                profileMode,
                runtime,
                waitForUserAction: false,
                sourceThreadId: options.threadId,
                onActivity: markActivity,
              }),
            onUpdate,
            { signal },
          ).catch((error) => browserToolFallback(error));
          await options.emitBrowserState();
          if (isBrowserUnavailableFallback(results)) {
            attempts.push({ providerId, status: "failed", reason: options.formatErrorMessage(browserUnavailableText(results), 1_000) });
            continue;
          }
          if (!Array.isArray(results)) {
            attempts.push({ providerId, status: "failed", reason: options.formatErrorMessage(options.formatBrowserUserAction(results), 1_000) });
            if (providerIndex < providerOrder.length - 1) continue;
            return webResearchToolResult(options.formatBrowserUserAction(results), {
              toolName: "web_research_search",
              role: "search",
              query,
              attempts,
              profileMode,
              runtime,
              userAction: results,
            });
          }
          attempts.push({ providerId, status: "succeeded", tool: "browser_search", durationMs: now() - startedAt });
          options.recordBrowserSearchAudit({ profileMode, query });
          return webResearchMaterializedToolResult(options.workspace.path, "web-research-search", "web research search output", options.formatBrowserSearchResults(results), {
            toolName: "web_research_search",
            role: "search",
            query,
            selectedProvider: providerId,
            attempts,
            profileMode,
            runtime,
            results,
          });
        }
        const ambientCliProvider = providerById.get(providerId);
        if (ambientCliProvider?.kind === "ambient-cli" && ambientCliProvider.ambientCli) {
          const binding = ambientCliProvider.ambientCli;
          onUpdate?.(webResearchToolUpdate("web_research_search", `Searching with ${ambientCliProvider.label} for "${query}".`));
          try {
            const result = await ambientCliCommand(options.workspace.path, {
              packageName: binding.packageName,
              command: binding.commandName,
              args: [query],
              signal,
            });
            attempts.push({ providerId, status: "succeeded", tool: `ambient_cli:${result.packageName}:${result.commandName}`, durationMs: result.durationMs });
            return webResearchToolResult(webResearchResultText(result.stdout?.trim() ? result.stdout : options.formatAmbientCliRun(result), "search", providerId, attempts, result.stdoutOutput), {
              toolName: "web_research_search",
              role: "search",
              query,
              selectedProvider: providerId,
              attempts,
              provider: {
                kind: "ambient-cli",
                providerId,
                label: ambientCliProvider.label,
                packageId: result.packageId,
                packageName: result.packageName,
                commandName: result.commandName,
                capabilityId: binding.capabilityId,
              },
              ...(result.stdoutOutput ? { textOutput: result.stdoutOutput } : {}),
              ...(result.stderrOutput ? { stderrOutput: result.stderrOutput } : {}),
            });
          } catch (error) {
            attempts.push({
              providerId,
              status: "failed",
              tool: `ambient_cli:${binding.packageName}:${binding.commandName}`,
              reason: options.formatErrorMessage(error, 1_000),
            });
          }
          continue;
        }
        const mcpProvider = providerById.get(providerId);
        if (isWebResearchMcpProvider(mcpProvider, "search")) {
          onUpdate?.(webResearchToolUpdate("web_research_search", `Searching with ${mcpProvider.label} for "${query}".`));
          const startedAt = now();
          const mcpRoute = await options.tryCallWebResearchMcpProvider({
            threadId: options.threadId,
            workspace: options.workspace,
            provider: mcpProvider,
            role: "search",
            value: query,
            rawInput: input,
            signal,
            onUpdate,
          });
          if (mcpRoute.result) {
            attempts.push({ providerId, status: "succeeded", tool: mcpRoute.result.descriptor.toolRef, durationMs: now() - startedAt });
            return webResearchToolResult(webResearchResultText(mcpRoute.result.text, "search", providerId, attempts, mcpRoute.result.output), {
              toolName: "web_research_search",
              role: "search",
              query,
              selectedProvider: providerId,
              attempts,
              provider: {
                kind: mcpProvider.kind,
                providerId,
                label: mcpProvider.label,
                serverId: mcpRoute.result.descriptor.serverId,
                workloadName: mcpRoute.result.descriptor.workloadName,
                targetToolName: mcpRoute.result.descriptor.name,
                targetToolRef: mcpRoute.result.descriptor.toolRef,
              },
              textOutput: mcpRoute.result.output,
            });
          }
          attempts.push({ providerId, status: "failed", reason: options.formatErrorMessage(mcpRoute.fallbackReason ?? "MCP provider did not return a result.", 1_000) });
          continue;
        }
        attempts.push({ providerId, status: "skipped", reason: "Provider is registered for public search, but this broker adapter is not implemented yet." });
      }
      return webResearchToolResult(webResearchNoProviderText("search", attempts), {
        toolName: "web_research_search",
        role: "search",
        query,
        attempts,
      });
    },
  });
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
