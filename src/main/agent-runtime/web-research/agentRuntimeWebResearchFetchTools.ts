import type { AgentToolResult, ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  BrowserContentInput,
  BrowserPageContent,
  BrowserProfileMode,
  BrowserRuntimeKind,
  BrowserUserActionState,
} from "../../../shared/browserTypes";
import type { WebResearchProviderConfig } from "../../../shared/webResearchTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import {
  browserToolFallback,
  browserUnavailableText,
  isBrowserUnavailableFallback,
  isBrowserUserActionState,
} from "../../agent/agentBrowserRuntime";
import { webResearchToolResult } from "./agentRuntimeWebResearchStatusTools";
import {
  isWebResearchMcpProvider,
  webResearchNoProviderText,
  webResearchResultText,
  webResearchToolUpdate,
} from "./agentRuntimeWebResearchToolFormatting";
import { webResearchToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import type { McpToolCallResult } from "../../mcp/mcpToolBridge";
import type { MaterializedTextOutput } from "../../tool-runtime/toolOutputArtifacts";
import {
  callExaWebFetch,
  type ExaWebFetchInput,
  type ExaWebResearchResult,
  isLikelyExaRateLimitError,
  type WebResearchProviderAttempt,
} from "../../web-research/webResearchBroker";
import {
  WEB_RESEARCH_PROVIDER_IDS,
  type WebResearchProviderRequestPlan,
} from "../../web-research/webResearchProviderStack";

type WebResearchFetchToolUpdate = AgentToolResult<Record<string, unknown>>;
type WebResearchFetchToolUpdateHandler = (update: WebResearchFetchToolUpdate) => void;
type BrowserContentWithActivityInput = BrowserContentInput & { onActivity?: (activityMessage?: string) => void };
type BrowserContentResultOrUserAction = BrowserPageContent | BrowserUserActionState;
type MaterializedBrowserPageContent = BrowserPageContent & { textOutput?: MaterializedTextOutput };

export interface WebResearchFetchMcpProviderCallInput {
  threadId: string;
  workspace: WorkspaceState;
  provider: WebResearchProviderConfig;
  role: "fetch";
  value: string;
  rawInput: Record<string, unknown>;
  signal: AbortSignal | undefined;
  onUpdate?: WebResearchFetchToolUpdateHandler;
}

export interface WebResearchFetchScraplingRouteInput {
  threadId: string;
  workspace: WorkspaceState;
  url: string | undefined;
  rawInput: Record<string, unknown>;
  signal: AbortSignal | undefined;
  onUpdate?: WebResearchFetchToolUpdateHandler;
}

export interface WebResearchFetchToolRegistrationOptions {
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
    onUpdate?: WebResearchFetchToolUpdateHandler,
  ) => Promise<{ profileMode: BrowserProfileMode; runtime: BrowserRuntimeKind | undefined }>;
  browserContent: (input: BrowserContentWithActivityInput) => Promise<BrowserContentResultOrUserAction>;
  emitBrowserState: () => Promise<void>;
  recordBrowserFetchAudit: (input: { profileMode: BrowserProfileMode; url: string }) => void;
  tryRouteBrowserContentThroughScrapling: (
    input: WebResearchFetchScraplingRouteInput,
  ) => Promise<{ result?: AgentToolResult<Record<string, unknown>>; fallbackReason?: string }>;
  tryCallWebResearchMcpProvider: (
    input: WebResearchFetchMcpProviderCallInput,
  ) => Promise<{ result?: McpToolCallResult; fallbackReason?: string }>;
  withBrowserToolHeartbeat: <T>(
    toolName: string,
    message: string,
    operation: (markActivity: (activityMessage?: string) => void) => Promise<T>,
    onUpdate: WebResearchFetchToolUpdateHandler | undefined,
    options?: { signal?: AbortSignal; timeoutMs?: number; heartbeatMs?: number },
  ) => Promise<T>;
  materializeBrowserPageContent: (
    workspacePath: string,
    label: string,
    content: BrowserPageContent,
  ) => Promise<MaterializedBrowserPageContent>;
  formatBrowserContent: (content: BrowserPageContent) => string;
  formatBrowserUserAction: (state: BrowserUserActionState) => string;
  formatErrorMessage: (error: unknown, maxChars: number) => string;
  callExaWebFetch?: (input: ExaWebFetchInput) => Promise<ExaWebResearchResult>;
  now?: () => number;
}

export function registerWebResearchFetchTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: WebResearchFetchToolRegistrationOptions,
): void {
  const exaFetch = options.callExaWebFetch ?? callExaWebFetch;
  const now = options.now ?? Date.now;

  registerDesktopTool(pi, webResearchToolDescriptor("web_research_fetch"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal, onUpdate) => {
      const input = params as Record<string, unknown>;
      const url = normalizeWebResearchUrl(requiredString(input, "url"));
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
        if (providerId === WEB_RESEARCH_PROVIDER_IDS.scrapling) {
          onUpdate?.(webResearchToolUpdate("web_research_fetch", `Reading ${url} with Scrapling MCP.`));
          const startedAt = now();
          const scraplingRoute = await options.tryRouteBrowserContentThroughScrapling({
            threadId: options.threadId,
            workspace: options.workspace,
            url,
            rawInput: { ...input, url },
            signal,
            onUpdate,
          });
          if (scraplingRoute.result) {
            const text = textFromToolResult(scraplingRoute.result);
            attempts.push({ providerId, status: "succeeded", tool: String(scraplingRoute.result.details?.targetToolName ?? "scrapling"), durationMs: now() - startedAt });
            return webResearchToolResult(webResearchResultText(text, "fetch", providerId, attempts, scraplingRoute.result.details?.textOutput as MaterializedTextOutput | undefined), {
              ...scraplingRoute.result.details,
              runtime: "ambient-web-research",
              toolName: "web_research_fetch",
              role: "fetch",
              url,
              selectedProvider: providerId,
              attempts,
            });
          }
          attempts.push({
            providerId,
            status: "failed",
            reason: options.formatErrorMessage(scraplingRoute.fallbackReason ?? "Scrapling did not return a result.", 1_000),
          });
          continue;
        }
        if (providerId === WEB_RESEARCH_PROVIDER_IDS.exa) {
          onUpdate?.(webResearchToolUpdate("web_research_fetch", `Reading ${url} with Exa MCP fetch.`));
          try {
            const result = await exaFetch({
              workspacePath: options.workspace.path,
              url,
              maxCharacters: optionalNumber(input.maxCharacters),
              signal,
              apiKey: options.webResearchExaApiKey(),
            });
            attempts.push({ providerId, status: "succeeded", tool: result.tool, durationMs: result.durationMs });
            return webResearchToolResult(webResearchResultText(result.text, "fetch", providerId, attempts, result.output), {
              toolName: "web_research_fetch",
              role: "fetch",
              url,
              selectedProvider: providerId,
              attempts,
              textOutput: result.output,
            });
          } catch (error) {
            attempts.push({
              providerId,
              status: "failed",
              tool: "web_fetch_exa",
              reason: `${isLikelyExaRateLimitError(error) ? "rate-limited: " : ""}${options.formatErrorMessage(error, 1_000)}`,
            });
          }
          continue;
        }
        if (providerId === WEB_RESEARCH_PROVIDER_IDS.browser) {
          onUpdate?.(webResearchToolUpdate("web_research_fetch", `Reading ${url} with Ambient Browser.`));
          const { profileMode, runtime } = await options.prepareBrowserToolProfile(input, options.threadId, onUpdate);
          const startedAt = now();
          const content = await options.withBrowserToolHeartbeat(
            "web_research_fetch",
            "Browser fallback page reading is still running. If a CAPTCHA or browser challenge is visible, complete it in the Browser panel.",
            (markActivity) => options.browserContent({ url, profileMode, runtime, waitForUserAction: false, sourceThreadId: options.threadId, onActivity: markActivity }),
            onUpdate,
            { signal },
          ).catch((error) => browserToolFallback(error));
          await options.emitBrowserState();
          if (isBrowserUnavailableFallback(content)) {
            attempts.push({ providerId, status: "failed", reason: options.formatErrorMessage(browserUnavailableText(content), 1_000) });
            continue;
          }
          if (isBrowserUserActionState(content)) {
            attempts.push({ providerId, status: "failed", reason: options.formatErrorMessage(options.formatBrowserUserAction(content), 1_000) });
            if (providerIndex < providerOrder.length - 1) continue;
            return webResearchToolResult(options.formatBrowserUserAction(content), {
              toolName: "web_research_fetch",
              role: "fetch",
              url,
              attempts,
              profileMode,
              runtime,
              userAction: content,
            });
          }
          attempts.push({ providerId, status: "succeeded", tool: "browser_content", durationMs: now() - startedAt });
          options.recordBrowserFetchAudit({ profileMode, url: content.url ?? url });
          const materialized = await options.materializeBrowserPageContent(options.workspace.path, "web-research-fetch", content);
          return webResearchToolResult(webResearchResultText(options.formatBrowserContent(materialized), "fetch", providerId, attempts, materialized.textOutput), {
            toolName: "web_research_fetch",
            role: "fetch",
            selectedProvider: providerId,
            profileMode,
            runtime,
            url: content.url,
            attempts,
            ...(materialized.textOutput ? { textOutput: materialized.textOutput } : {}),
          });
        }
        const mcpProvider = providerById.get(providerId);
        if (isWebResearchMcpProvider(mcpProvider, "fetch")) {
          onUpdate?.(webResearchToolUpdate("web_research_fetch", `Reading ${url} with ${mcpProvider.label}.`));
          const startedAt = now();
          const mcpRoute = await options.tryCallWebResearchMcpProvider({
            threadId: options.threadId,
            workspace: options.workspace,
            provider: mcpProvider,
            role: "fetch",
            value: url,
            rawInput: { ...input, url },
            signal,
            onUpdate,
          });
          if (mcpRoute.result) {
            attempts.push({ providerId, status: "succeeded", tool: mcpRoute.result.descriptor.toolRef, durationMs: now() - startedAt });
            return webResearchToolResult(webResearchResultText(mcpRoute.result.text, "fetch", providerId, attempts, mcpRoute.result.output), {
              toolName: "web_research_fetch",
              role: "fetch",
              url,
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
        attempts.push({ providerId, status: "skipped", reason: "Provider is registered for public URL fetch, but this broker adapter is not implemented yet." });
      }
      return webResearchToolResult(webResearchNoProviderText("fetch", attempts), {
        toolName: "web_research_fetch",
        role: "fetch",
        url,
        attempts,
      });
    },
  });
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

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
