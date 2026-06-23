import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { Model } from "@mariozechner/pi-ai";
import { piToolFieldsFromDescriptor, pluginInstallToolDescriptor } from "./mcpAutowireDesktopToolsFacade";
import {
  mcpAutowirePlanResultText,
  planMcpAutowire,
  type McpAutowirePlanInput,
  type McpAutowirePlanResult,
  type McpAutowirePlannerOptions,
} from "./mcpAutowirePlanner";
import type { McpAutowireCandidateRefStore } from "./mcpAutowireCandidateRefs";
import type { McpAutowirePlanRevisionStore } from "./mcpAutowirePlanEdits";
import type { WorkflowPiProgress } from "./mcpAutowireWorkflowFacade";
import {
  formatElapsedMs,
  objectInput,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requiredString,
  toolResult,
} from "./mcpAutowirePiToolSupport";

export interface McpAutowirePlanToolThread {
  id: string;
  collaborationMode: "agent" | "planner";
  permissionMode: string;
}

export interface McpAutowirePlanToolOptions {
  apiKey?: string;
  model: Model<"openai-completions">;
  getThread: () => McpAutowirePlanToolThread;
  planner?: (input: McpAutowirePlanInput, options: McpAutowirePlannerOptions) => Promise<McpAutowirePlanResult>;
  candidateRefs?: McpAutowireCandidateRefStore;
  planRevisions?: McpAutowirePlanRevisionStore;
  onPlanResult?: (result: McpAutowirePlanResult) => void;
}

const MCP_AUTOWIRE_PLAN_HEARTBEAT_MS = 5_000;

export function createMcpAutowirePlanToolDefinition(options: McpAutowirePlanToolOptions): ToolDefinition<any, any, any> {
  const plan = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_autowire_plan"));
  return {
    ...plan,
    parameters: plan.parameters as any,
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal, onUpdate) => {
      const thread = options.getThread();
      const input = objectInput(params);
      const targetUrl = requiredString(input, "targetUrl");
      const instructions = optionalString(input.instructions);
      const allowedDiscovery = objectInput(input.allowedDiscovery);
      const planInput: McpAutowirePlanInput = {
        targetUrl,
        ...(instructions ? { instructions } : {}),
        allowedDiscovery: {
          urlFetch: optionalBoolean(allowedDiscovery.urlFetch),
          githubRaw: optionalBoolean(allowedDiscovery.githubRaw),
          search: optionalBoolean(allowedDiscovery.search),
          maxFetches: optionalNumber(allowedDiscovery.maxFetches),
          maxSearches: optionalNumber(allowedDiscovery.maxSearches),
          maxBytesPerFetch: optionalNumber(allowedDiscovery.maxBytesPerFetch),
        },
        signal,
      };

      onUpdate?.({
        content: [{ type: "text", text: `Planning MCP autowire for ${targetUrl}.` }],
        details: {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_autowire_plan",
          status: "planning",
          targetUrl,
          threadId: thread.id,
          collaborationMode: thread.collaborationMode,
        },
      });

      const startedAt = Date.now();
      let latestPlannerProgress: WorkflowPiProgress | undefined;
      const emitPlannerProgress = (progress: WorkflowPiProgress) => {
        latestPlannerProgress = progress;
        onUpdate?.({
          content: [{
            type: "text",
            text: mcpAutowirePlanProgressText(targetUrl, progress),
          }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_autowire_plan",
            status: "planning",
            stage: progress.stage,
            targetUrl,
            threadId: thread.id,
            collaborationMode: thread.collaborationMode,
            elapsedMs: progress.elapsedMs,
            outputChars: progress.outputChars,
            thinkingChars: progress.thinkingChars,
            idleElapsedMs: progress.idleElapsedMs,
            idleTimeoutMs: progress.idleTimeoutMs,
            timeoutMode: progress.timeoutMode,
          },
        });
      };
      const emitDiscoveryToolProgress: NonNullable<McpAutowirePlannerOptions["onToolProgress"]> = (progress) => {
        onUpdate?.({
          content: [{
            type: "text",
            text: mcpAutowireDiscoveryToolProgressText(targetUrl, progress),
          }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_autowire_plan",
            status: "planning",
            stage: `discovery-tool-${progress.status}`,
            targetUrl,
            threadId: thread.id,
            collaborationMode: thread.collaborationMode,
            elapsedMs: Date.now() - startedAt,
            outputChars: latestPlannerProgress?.outputChars,
            thinkingChars: latestPlannerProgress?.thinkingChars,
            idleElapsedMs: latestPlannerProgress?.idleElapsedMs,
            idleTimeoutMs: latestPlannerProgress?.idleTimeoutMs,
            timeoutMode: latestPlannerProgress?.timeoutMode,
            ...(progress.status === "running" ? { waitingOn: progress.toolName } : {}),
          },
        });
      };
      const stopHeartbeat = startMcpAutowirePlanHeartbeat({
        onUpdate,
        targetUrl,
        thread,
        startedAt,
        progress: () => latestPlannerProgress,
      });
      let result: McpAutowirePlanResult;
      try {
        result = await (options.planner ?? planMcpAutowire)(planInput, {
          apiKey: options.apiKey,
          model: options.model.id,
          baseUrl: (options.model as { baseUrl?: string }).baseUrl,
          onProgress: emitPlannerProgress,
          onToolProgress: emitDiscoveryToolProgress,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        onUpdate?.({
          content: [{ type: "text", text: `MCP autowire planning failed for ${targetUrl}: ${message}` }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_autowire_plan",
            status: "failed",
            targetUrl,
            threadId: thread.id,
            collaborationMode: thread.collaborationMode,
            error: message,
          },
        });
        throw error;
      } finally {
        stopHeartbeat();
      }
      const candidateRef = result.candidate
        ? options.candidateRefs?.put(result.candidate as unknown as Record<string, unknown>, result.validation.candidateHash, "planned")
        : undefined;
      if (result.candidate && candidateRef) {
        options.planRevisions?.recordCandidate({
          candidate: result.candidate as unknown as Record<string, unknown>,
          source: "plan",
          summary: `Planned MCP autowire candidate for ${targetUrl}.`,
          candidateRef,
          targetUrl,
        });
      }
      options.onPlanResult?.(result);
      return toolResult(mcpAutowirePlanResultText(result, { candidateRef }), {
        runtime: "ambient-mcp",
        toolName: "ambient_mcp_autowire_plan",
        status: result.validation.status,
        outcome: result.validation.outcome,
        targetUrl: result.targetUrl,
        candidateId: result.candidate?.id,
        displayName: result.candidate?.displayName,
        recommendedLane: result.candidate?.recommendedLane,
        runtimeProvider: result.candidate?.runtime.provider,
        runtimeSourceKind: result.candidate?.runtime.sourceKind,
        sourceClassification: result.sourceClassification?.kind,
        sourceClassificationConfidence: result.sourceClassification?.confidence,
        setupRecipe: result.sourceClassification?.setupRecipe,
        readyForUserReview: result.validation.readyForUserReview,
        readyForToolHiveRun: result.validation.readyForToolHiveRun,
        blockerCount: result.validation.blockers.length,
        warningCount: result.validation.warnings.length,
        fetchCount: result.discovery.fetches.filter((fetch) => fetch.status === "fetched").length,
        blockedFetchCount: result.discovery.fetches.filter((fetch) => fetch.status === "blocked").length,
        searchCount: result.discovery.searches.filter((search) => search.status === "searched").length,
        blockedSearchCount: result.discovery.searches.filter((search) => search.status === "blocked").length,
        ...(result.validation.candidateHash ? { candidateHash: result.validation.candidateHash } : {}),
        ...(candidateRef ? { candidateRef } : {}),
      });
    },
  };
}

function startMcpAutowirePlanHeartbeat(input: {
  onUpdate?: Parameters<NonNullable<ToolDefinition<any, any, any>["execute"]>>[3];
  targetUrl: string;
  thread: McpAutowirePlanToolThread;
  startedAt?: number;
  progress?: () => WorkflowPiProgress | undefined;
}): () => void {
  if (!input.onUpdate) return () => undefined;
  const startedAt = input.startedAt ?? Date.now();
  let heartbeatCount = 0;
  const timer = setInterval(() => {
    heartbeatCount += 1;
    const elapsedMs = Date.now() - startedAt;
    const progress = input.progress?.();
    input.onUpdate?.({
      content: [{
        type: "text",
        text: `Still planning MCP autowire for ${input.targetUrl} (${formatElapsedMs(elapsedMs)} elapsed).`,
      }],
      details: {
        runtime: "ambient-mcp",
        toolName: "ambient_mcp_autowire_plan",
        status: "planning",
        stage: "heartbeat",
        targetUrl: input.targetUrl,
        threadId: input.thread.id,
        collaborationMode: input.thread.collaborationMode,
        elapsedMs,
        heartbeatCount,
        outputChars: progress?.outputChars,
        thinkingChars: progress?.thinkingChars,
        idleElapsedMs: progress?.idleElapsedMs,
        idleTimeoutMs: progress?.idleTimeoutMs,
        timeoutMode: progress?.timeoutMode,
      },
    });
  }, MCP_AUTOWIRE_PLAN_HEARTBEAT_MS);
  if (typeof timer === "object" && "unref" in timer && typeof timer.unref === "function") {
    timer.unref();
  }
  return () => clearInterval(timer);
}

function mcpAutowirePlanProgressText(targetUrl: string, progress: WorkflowPiProgress): string {
  const counts = [
    progress.outputChars > 0 ? `${progress.outputChars.toLocaleString()} output chars` : undefined,
    progress.thinkingChars > 0 ? `${progress.thinkingChars.toLocaleString()} thinking chars` : undefined,
  ].filter(Boolean).join(", ");
  const suffix = counts ? `, ${counts}` : "";
  return `Planning MCP autowire for ${targetUrl} (${formatElapsedMs(progress.elapsedMs)} elapsed${suffix}).`;
}

function mcpAutowireDiscoveryToolProgressText(
  targetUrl: string,
  progress: Parameters<NonNullable<McpAutowirePlannerOptions["onToolProgress"]>>[0],
): string {
  const verb = progress.status === "done" ? "finished" : progress.status === "error" ? "failed" : "is running";
  const elapsed = progress.elapsedMs === undefined ? "" : ` after ${formatElapsedMs(progress.elapsedMs)}`;
  const summary = (progress.error ?? progress.resultSummary ?? progress.inputSummary ?? "").trim();
  return [
    `Autowire discovery ${verb} ${progress.toolName} for ${targetUrl}${elapsed}.`,
    summary ? ` ${summary}` : "",
  ].join("");
}
