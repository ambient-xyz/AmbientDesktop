import type { AgentToolResult, ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { Model } from "@mariozechner/pi-ai";
import { piToolFieldsFromDescriptor, pluginInstallToolDescriptor } from "./desktopToolRegistry";
import {
  mcpAutowirePlanResultText,
  planMcpAutowire,
  type McpAutowirePlanInput,
  type McpAutowirePlanResult,
  type McpAutowirePlannerOptions,
} from "./mcpAutowirePlanner";
import { validateMcpAutowireCandidate } from "./mcpAutowireSchemas";
import { mcpAutowireReviewResultText, reviewMcpAutowireCandidate, reviewNextToolInput } from "./mcpAutowireReview";
import {
  applyMcpAutowirePlanEdit,
  createMcpAutowirePlanRevisionStore,
  describeMcpAutowirePlanEdit,
  mcpAutowirePlanEditText,
  mcpAutowirePlanRevisionListText,
  mcpAutowirePlanRevisionReadText,
  type McpAutowirePlanEditDescribeResult,
  type McpAutowirePlanRevision,
  type McpAutowirePlanRevisionStore,
} from "./mcpAutowirePlanEdits";
import {
  createMcpCustomSourceBuildImage,
  describeMcpCustomSourceBuild,
  mcpCustomSourceBuildCreateText,
  mcpCustomSourceBuildDescribeText,
  mcpCustomSourceBuildReviewText,
  reviewMcpCustomSourceBuildPlan,
  type McpCustomSourceBuildCommandRunner,
} from "./mcpCustomSourceBuild";
import type { McpAutowireCandidateRefStore } from "./mcpAutowireCandidateRefs";
import type { WorkflowPiProgress } from "./workflowPiTransport";

export interface McpAutowirePiToolThread {
  id: string;
  collaborationMode: "agent" | "planner";
  permissionMode: string;
}

export interface McpAutowirePiToolWorkspace {
  path: string;
  name?: string;
}

export interface McpAutowirePiToolOptions {
  apiKey?: string;
  model: Model<"openai-completions">;
  getThread: () => McpAutowirePiToolThread;
  workspace: McpAutowirePiToolWorkspace;
  planner?: (input: McpAutowirePlanInput, options: McpAutowirePlannerOptions) => Promise<McpAutowirePlanResult>;
  candidateRefs?: McpAutowireCandidateRefStore;
  planRevisions?: McpAutowirePlanRevisionStore;
  onPlanResult?: (result: McpAutowirePlanResult) => void;
  authorizePlanEdit?: (input: McpAutowirePlanEditApprovalInput) => Promise<boolean> | boolean;
  sourceBuildUserDataPath?: string;
  sourceBuildCommandRunner?: McpCustomSourceBuildCommandRunner;
  evidenceFetch?: typeof fetch;
}

export interface McpAutowirePlanEditApprovalInput {
  thread: McpAutowirePiToolThread;
  workspace: McpAutowirePiToolWorkspace;
  preview: McpAutowirePlanEditDescribeResult;
  detail: string;
}

const MCP_AUTOWIRE_PLAN_HEARTBEAT_MS = 5_000;

export function createMcpAutowirePiToolDefinitions(options: McpAutowirePiToolOptions): ToolDefinition<any, any, any>[] {
  const plan = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_autowire_plan"));
  const review = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_autowire_review"));
  const evidenceRead = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_autowire_evidence_read"));
  const revisionList = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_autowire_plan_revision_list"));
  const revisionRead = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_autowire_plan_revision_read"));
  const editDescribe = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_autowire_plan_edit_describe"));
  const editApply = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_autowire_plan_edit_apply"));
  const sourceBuildDescribe = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_autowire_source_build_describe"));
  const sourceBuildCreate = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_autowire_source_build_create"));
  const customSourceDescribe = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_autowire_custom_source_describe"));
  return [
    {
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
    },
    {
      ...review,
      parameters: review.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const thread = options.getThread();
        const input = objectInput(params);
        const candidateRef = optionalString(input.candidateRef);
        const candidate = candidateRef
          ? options.candidateRefs?.get(candidateRef)
          : input.candidate;
        if (candidateRef && (!candidate || typeof candidate !== "object" || Array.isArray(candidate))) {
          throw new Error(`No MCP autowire candidate is available for candidateRef ${candidateRef}. The reference may be from an earlier or reset Pi session; rerun ambient_mcp_autowire_plan or pass the exact candidate JSON.`);
        }
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("candidate or candidateRef is required.");
        const expectedCandidateHash = optionalString(input.expectedCandidateHash);
        const secretBindings = arrayInput(input.secretBindings).map((binding) => ({
          envName: requiredString(binding, "envName"),
          secretRef: requiredString(binding, "secretRef"),
        }));

        onUpdate?.({
          content: [{ type: "text", text: "Reviewing MCP autowire candidate handoff." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_autowire_review",
            status: "reviewing",
            threadId: thread.id,
            collaborationMode: thread.collaborationMode,
          },
        });

        const result = reviewMcpAutowireCandidate({ candidate, expectedCandidateHash, secretBindings });
        const storedCandidateRef = candidateRef
          ? options.candidateRefs?.markReviewed(candidateRef, result.candidate as unknown as Record<string, unknown>, result.validation.candidateHash) ?? candidateRef
          : options.candidateRefs?.put(result.candidate as unknown as Record<string, unknown>, result.validation.candidateHash, "reviewed");
        return toolResult(mcpAutowireReviewResultText(result, { candidateRef: storedCandidateRef }), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_autowire_review",
          status: result.handoff.status,
          outcome: result.handoff.outcome,
          candidateId: result.candidate.id,
          displayName: result.candidate.displayName,
          recommendedLane: result.candidate.recommendedLane,
          handoffKind: result.handoff.kind,
          nextToolName: result.handoff.nextToolName,
          nextToolInput: reviewNextToolInput(result, { candidateRef: storedCandidateRef }),
          forbiddenAlternatives: result.handoff.forbiddenAlternatives ?? [],
          readyForUserReview: result.validation.readyForUserReview,
          readyForToolHiveRun: result.validation.readyForToolHiveRun,
          blockerCount: result.review.blockers.length,
          warningCount: result.review.warnings.length,
          candidateHash: result.validation.candidateHash,
          candidateRef: storedCandidateRef,
        });
      },
    },
    {
      ...revisionList,
      parameters: revisionList.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const input = objectInput(params);
        const thread = options.getThread();
        onUpdate?.({
          content: [{ type: "text", text: "Listing MCP autowire plan revisions." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_autowire_plan_revision_list",
            status: "listing",
            threadId: thread.id,
            collaborationMode: thread.collaborationMode,
          },
        });
        const revisions = (options.planRevisions ?? createMcpAutowirePlanRevisionStore()).list({
          candidateRef: optionalString(input.candidateRef),
          candidateHash: optionalString(input.candidateHash),
          serverId: optionalString(input.serverId),
          workloadName: optionalString(input.workloadName),
          limit: optionalNumber(input.limit),
        });
        return toolResult(mcpAutowirePlanRevisionListText(revisions), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_autowire_plan_revision_list",
          status: "complete",
          revisionCount: revisions.length,
          revisions: revisions.map(revisionSummaryForDetails),
        });
      },
    },
    {
      ...revisionRead,
      parameters: revisionRead.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const input = objectInput(params);
        const revisionId = requiredString(input, "revisionId");
        const thread = options.getThread();
        onUpdate?.({
          content: [{ type: "text", text: `Reading MCP autowire plan revision ${revisionId}.` }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_autowire_plan_revision_read",
            status: "reading",
            revisionId,
            threadId: thread.id,
            collaborationMode: thread.collaborationMode,
          },
        });
        const revision = options.planRevisions?.read(revisionId);
        if (!revision) throw new Error(`No MCP autowire plan revision exists for ${revisionId}.`);
        return toolResult(mcpAutowirePlanRevisionReadText(revision), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_autowire_plan_revision_read",
          status: "complete",
          revision: revisionSummaryForDetails(revision),
          candidate: revision.candidate,
        });
      },
    },
    {
      ...editDescribe,
      parameters: editDescribe.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const input = objectInput(params);
        const candidateResolution = candidateOrRevisionInput(options, input);
        const thread = options.getThread();
        onUpdate?.({
          content: [{ type: "text", text: "Previewing MCP autowire plan edit." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_autowire_plan_edit_describe",
            status: "previewing",
            threadId: thread.id,
            collaborationMode: thread.collaborationMode,
          },
        });
        const result = describeMcpAutowirePlanEdit({
          candidate: candidateResolution.candidate,
          candidateRef: candidateResolution.candidateRef,
          parentRevisionId: candidateResolution.parentRevisionId,
          expectedCandidateHash: optionalString(input.expectedCandidateHash),
          reason: optionalString(input.reason),
          operations: Array.isArray(input.operations) ? input.operations : [],
        });
        return toolResult(mcpAutowirePlanEditText(result), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_autowire_plan_edit_describe",
          status: result.status,
          candidateRef: result.candidateRef,
          parentRevisionId: result.parentRevisionId,
          originalCandidateHash: result.originalCandidateHash,
          editedCandidateHash: result.editedCandidateHash,
          permissionExpanding: result.permissionExpanding,
          approvalRequired: result.approvalRequired,
          approvalReasons: result.approvalReasons,
          operationCount: result.operations.length,
          changedPaths: result.changedPaths,
          blockerCount: result.validation.blockers.length,
          warningCount: result.validation.warnings.length,
          nextToolName: result.nextToolName,
          nextToolInput: result.nextToolInput,
        });
      },
    },
    {
      ...editApply,
      parameters: editApply.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const input = objectInput(params);
        const thread = options.getThread();
        const candidateResolution = candidateOrRevisionInput(options, input);
        onUpdate?.({
          content: [{ type: "text", text: "Previewing MCP autowire plan edit before approval." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_autowire_plan_edit_apply",
            status: "previewing",
            threadId: thread.id,
            collaborationMode: thread.collaborationMode,
          },
        });
        const preview = describeMcpAutowirePlanEdit({
          candidate: candidateResolution.candidate,
          candidateRef: candidateResolution.candidateRef,
          parentRevisionId: candidateResolution.parentRevisionId,
          expectedCandidateHash: optionalString(input.expectedCandidateHash),
          reason: optionalString(input.reason),
          operations: Array.isArray(input.operations) ? input.operations : [],
        });
        const detail = mcpAutowirePlanEditText(preview);
        const allowed = await (options.authorizePlanEdit?.({
          thread,
          workspace: options.workspace,
          preview,
          detail,
        }) ?? true);
        if (!allowed) throw new Error("MCP autowire plan edit blocked by Ambient Desktop approval prompt.");
        const applied = applyMcpAutowirePlanEdit({
          describeResult: preview,
          store: options.planRevisions,
          putCandidateRef: (candidate, candidateHash) => options.candidateRefs?.put(candidate, candidateHash, "planned"),
        });
        return toolResult(mcpAutowirePlanEditText(applied), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_autowire_plan_edit_apply",
          status: applied.status,
          candidateRef: applied.candidateRef,
          revisionId: applied.revision?.revisionId,
          originalCandidateHash: applied.originalCandidateHash,
          editedCandidateHash: applied.editedCandidateHash,
          permissionExpanding: applied.permissionExpanding,
          approvalRequired: applied.approvalRequired,
          approvalReasons: applied.approvalReasons,
          operationCount: applied.operations.length,
          changedPaths: applied.changedPaths,
          blockerCount: applied.validation.blockers.length,
          warningCount: applied.validation.warnings.length,
          nextToolName: applied.nextToolName,
          nextToolInput: applied.nextToolInput,
        });
      },
    },
    {
      ...evidenceRead,
      parameters: evidenceRead.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, signal, onUpdate) => {
        const thread = options.getThread();
        const input = objectInput(params);
        const candidateRef = optionalString(input.candidateRef);
        const candidate = candidateRef
          ? options.candidateRefs?.get(candidateRef)
          : input.candidate;
        if (candidateRef && (!candidate || typeof candidate !== "object" || Array.isArray(candidate))) {
          throw new Error(`No MCP autowire candidate is available for candidateRef ${candidateRef}. Rerun ambient_mcp_autowire_plan or pass the exact candidate JSON.`);
        }
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("candidate or candidateRef is required.");
        const evidenceId = requiredString(input, "evidenceId");
        const maxBytes = Math.min(80_000, Math.max(1_000, Math.floor(optionalNumber(input.maxBytes) ?? 40_000)));
        const parsedCandidate = candidate as { evidence?: Array<{ id?: unknown; locator?: unknown; summary?: unknown; type?: unknown }> };
        const evidence = (parsedCandidate.evidence ?? []).find((entry) => entry.id === evidenceId);
        if (!evidence || typeof evidence.locator !== "string") throw new Error(`Evidence id ${evidenceId} is not available on this candidate.`);
        const url = evidence.locator.trim();
        if (!/^https:\/\//i.test(url)) throw new Error(`Evidence ${evidenceId} is not an HTTPS URL and cannot be fetched by evidence_read.`);

        onUpdate?.({
          content: [{ type: "text", text: `Reading MCP autowire evidence ${evidenceId}.` }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_autowire_evidence_read",
            status: "reading",
            evidenceId,
            threadId: thread.id,
            collaborationMode: thread.collaborationMode,
          },
        });

        const fetchImpl = options.evidenceFetch ?? fetch;
        const response = await fetchImpl(url, {
          signal,
          headers: {
            accept: "text/plain,*/*;q=0.1",
            "user-agent": "Ambient-MCP-Autowire-Evidence-Read",
          },
        });
        const text = await response.text();
        const truncated = text.length > maxBytes;
        const preview = truncated ? text.slice(0, maxBytes) : text;
        return toolResult([
          `Evidence ${evidenceId}`,
          `URL: ${url}`,
          `HTTP: ${response.status}`,
          `Returned chars: ${preview.length}/${text.length}${truncated ? " truncated" : ""}`,
          "",
          preview,
        ].join("\n"), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_autowire_evidence_read",
          status: response.ok ? "fetched" : "failed",
          evidenceId,
          url,
          httpStatus: response.status,
          returnedChars: preview.length,
          totalChars: text.length,
          truncated,
          candidateRef,
        });
      },
    },
    {
      ...sourceBuildDescribe,
      parameters: sourceBuildDescribe.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const thread = options.getThread();
        const input = objectInput(params);
        const candidateRef = optionalString(input.candidateRef);
        const candidate = candidateRef
          ? options.candidateRefs?.get(candidateRef)
          : input.candidate;
        if (candidateRef && (!candidate || typeof candidate !== "object" || Array.isArray(candidate))) {
          throw new Error(`No MCP autowire candidate is available for candidateRef ${candidateRef}. Rerun ambient_mcp_autowire_plan or pass the exact candidate JSON.`);
        }
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("candidate or candidateRef is required.");
        const expectedCandidateHash = optionalString(input.expectedCandidateHash);
        const ref = optionalString(input.ref);
        const sourceBuild = input.sourceBuild;

        onUpdate?.({
          content: [{ type: "text", text: "Deriving custom ToolHive source-build plan." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_autowire_source_build_describe",
            status: "planning",
            threadId: thread.id,
            collaborationMode: thread.collaborationMode,
          },
        });

        const result = await describeMcpCustomSourceBuild({
          candidate,
          expectedCandidateHash,
          sourceBuild,
          ref,
        }, {
          commandRunner: options.sourceBuildCommandRunner,
        });
        const candidateHash = result.status === "ready-to-build"
          ? expectedCandidateHash ?? validateMcpAutowireCandidate(result.candidate).candidateHash
          : undefined;
        const sourceBuildForCreate = result.nextToolInput?.sourceBuild ?? result.sourceBuild;
        const nextToolInput = result.nextToolName
          ? {
              ...(candidateRef ? { candidateRef } : { candidate: result.candidate }),
              ...(candidateHash ? { expectedCandidateHash: candidateHash } : {}),
              sourceBuild: sourceBuildForCreate,
            }
          : undefined;
        return toolResult(mcpCustomSourceBuildDescribeText(result, { candidateRef, expectedCandidateHash: candidateHash }), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_autowire_source_build_describe",
          status: result.status,
          sourceCandidateId: result.candidate.id,
          candidateRef,
          candidateHash,
          imageIdentifier: result.sourceBuild.image.identifier,
          resolvedCommit: result.sourceBuild.resolvedCommit,
          buildKind: result.sourceBuild.recipe.kind,
          blockerCount: result.blockers.length,
          warningCount: result.warnings.length,
          forbiddenAlternatives: result.forbiddenAlternatives,
          nextToolName: result.nextToolName,
          nextToolInput,
        });
      },
    },
    {
      ...sourceBuildCreate,
      parameters: sourceBuildCreate.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, signal, onUpdate) => {
        const thread = options.getThread();
        const input = objectInput(params);
        const candidateRef = optionalString(input.candidateRef);
        const candidate = candidateRef
          ? options.candidateRefs?.get(candidateRef)
          : input.candidate;
        if (candidateRef && (!candidate || typeof candidate !== "object" || Array.isArray(candidate))) {
          throw new Error(`No MCP autowire candidate is available for candidateRef ${candidateRef}. Rerun ambient_mcp_autowire_plan or pass the exact candidate JSON.`);
        }
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("candidate or candidateRef is required.");
        if (!options.sourceBuildUserDataPath) throw new Error("Ambient MCP userData path is unavailable, so source builds cannot run in this session.");
        const expectedCandidateHash = optionalString(input.expectedCandidateHash);
        const sourceBuild = input.sourceBuild;

        onUpdate?.({
          content: [{ type: "text", text: "Building custom ToolHive source image in Ambient-managed source-build state." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_autowire_source_build_create",
            status: "building",
            threadId: thread.id,
            collaborationMode: thread.collaborationMode,
          },
        });

        const result = await createMcpCustomSourceBuildImage({
          candidate,
          expectedCandidateHash,
          sourceBuild,
          userDataPath: options.sourceBuildUserDataPath,
          signal,
        }, {
          commandRunner: options.sourceBuildCommandRunner,
        });
        const customImageCandidateHash = result.customImageValidation?.candidateHash;
        const customImageCandidateRef = result.customImageCandidate
          ? options.candidateRefs?.put(result.customImageCandidate as unknown as Record<string, unknown>, customImageCandidateHash, "reviewed")
          : undefined;
        const nextToolInput = result.nextToolName
          ? customImageCandidateRef
            ? { candidateRef: customImageCandidateRef, ...(customImageCandidateHash ? { expectedCandidateHash: customImageCandidateHash } : {}) }
            : result.nextToolInput
          : undefined;
        return toolResult(mcpCustomSourceBuildCreateText(result, { customImageCandidateRef, customImageCandidateHash }), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_autowire_source_build_create",
          status: result.status,
          sourceCandidateId: result.candidate.id,
          customImageCandidateId: result.customImageCandidate?.id,
          customImageCandidateRef,
          candidateHash: customImageCandidateHash,
          imageIdentifier: result.build.imageIdentifier,
          imageDigest: result.build.imageDigest,
          buildRuntime: result.build.runtime,
          buildLogPath: result.build.buildLogPath,
          commandCount: result.build.commandCount,
          blockerCount: result.review.blockers.length,
          warningCount: result.review.warnings.length,
          forbiddenAlternatives: result.forbiddenAlternatives,
          nextToolName: result.nextToolName,
          nextToolInput,
        });
      },
    },
    {
      ...customSourceDescribe,
      parameters: customSourceDescribe.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const thread = options.getThread();
        const input = objectInput(params);
        const candidateRef = optionalString(input.candidateRef);
        const candidate = candidateRef
          ? options.candidateRefs?.get(candidateRef)
          : input.candidate;
        if (candidateRef && (!candidate || typeof candidate !== "object" || Array.isArray(candidate))) {
          throw new Error(`No MCP autowire candidate is available for candidateRef ${candidateRef}. The reference may be from an earlier or reset Pi session; rerun ambient_mcp_autowire_plan or pass the exact candidate JSON.`);
        }
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("candidate or candidateRef is required.");
        const expectedCandidateHash = optionalString(input.expectedCandidateHash);
        const sourceBuild = requiredObject(input, "sourceBuild");

        onUpdate?.({
          content: [{ type: "text", text: "Reviewing custom ToolHive source build plan." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_autowire_custom_source_describe",
            status: "reviewing",
            threadId: thread.id,
            collaborationMode: thread.collaborationMode,
          },
        });

        const result = reviewMcpCustomSourceBuildPlan({ candidate, expectedCandidateHash, sourceBuild });
        const customImageCandidateHash = result.customImageValidation?.candidateHash;
        const customImageCandidateRef = result.customImageCandidate
          ? options.candidateRefs?.put(result.customImageCandidate as unknown as Record<string, unknown>, customImageCandidateHash, "reviewed")
          : undefined;
        const nextToolInput = result.status === "ready-for-import"
          ? customImageCandidateRef
            ? { candidateRef: customImageCandidateRef, ...(customImageCandidateHash ? { expectedCandidateHash: customImageCandidateHash } : {}) }
            : { candidate: result.customImageCandidate, ...(customImageCandidateHash ? { expectedCandidateHash: customImageCandidateHash } : {}) }
          : undefined;
        return toolResult(mcpCustomSourceBuildReviewText(result, { customImageCandidateRef: customImageCandidateRef }), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_autowire_custom_source_describe",
          status: result.status,
          sourceCandidateId: result.candidate.id,
          customImageCandidateId: result.customImageCandidate?.id,
          customImageCandidateRef,
          candidateHash: customImageCandidateHash,
          buildKind: result.sourceBuild.recipe.kind,
          imageIdentifier: result.sourceBuild.image.identifier,
          imageDigest: result.sourceBuild.image.digest,
          blockerCount: result.blockers.length,
          warningCount: result.warnings.length,
          nextToolName: result.status === "ready-for-import" ? "ambient_mcp_standard_import_describe" : undefined,
          nextToolInput,
        });
      },
    },
  ];
}

function startMcpAutowirePlanHeartbeat(input: {
  onUpdate?: Parameters<NonNullable<ToolDefinition<any, any, any>["execute"]>>[3];
  targetUrl: string;
  thread: McpAutowirePiToolThread;
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

function toolResult(text: string, details: Record<string, unknown>): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text }],
    details,
  };
}

function candidateOrRevisionInput(
  options: McpAutowirePiToolOptions,
  input: Record<string, unknown>,
): { candidate: Record<string, unknown>; candidateRef?: string; parentRevisionId?: string } {
  const revisionId = optionalString(input.revisionId);
  if (revisionId) {
    const revision = options.planRevisions?.read(revisionId);
    if (!revision) throw new Error(`No MCP autowire plan revision exists for ${revisionId}.`);
    return {
      candidate: revision.candidate as unknown as Record<string, unknown>,
      ...(revision.candidateRef ? { candidateRef: revision.candidateRef } : {}),
      parentRevisionId: revision.revisionId,
    };
  }
  const candidateRef = optionalString(input.candidateRef);
  const candidate = candidateRef
    ? options.candidateRefs?.get(candidateRef)
    : input.candidate;
  if (candidateRef && (!candidate || typeof candidate !== "object" || Array.isArray(candidate))) {
    throw new Error(`No MCP autowire candidate is available for candidateRef ${candidateRef}. Rerun ambient_mcp_autowire_plan, pass revisionId from ambient_mcp_autowire_plan_revision_list, or pass the exact candidate JSON.`);
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("candidate, candidateRef, or revisionId is required.");
  const parent = candidateRef ? options.planRevisions?.latestForCandidateRef(candidateRef) : undefined;
  return {
    candidate: candidate as Record<string, unknown>,
    ...(candidateRef ? { candidateRef } : {}),
    ...(parent ? { parentRevisionId: parent.revisionId } : {}),
  };
}

function revisionSummaryForDetails(revision: McpAutowirePlanRevision): Record<string, unknown> {
  return {
    revisionId: revision.revisionId,
    candidateId: revision.candidateId,
    candidateHash: revision.candidateHash,
    source: revision.source,
    summary: revision.summary,
    createdAt: revision.createdAt,
    status: revision.validation.status,
    blockerCount: revision.validation.blockers.length,
    warningCount: revision.validation.warnings.length,
    ...(revision.candidateRef ? { candidateRef: revision.candidateRef } : {}),
    ...(revision.parentRevisionId ? { parentRevisionId: revision.parentRevisionId } : {}),
    ...(revision.serverId ? { serverId: revision.serverId } : {}),
    ...(revision.workloadName ? { workloadName: revision.workloadName } : {}),
  };
}

function formatElapsedMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function requiredObject(input: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = input[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${key} is required.`);
  return value as Record<string, unknown>;
}

function arrayInput(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = optionalString(input[key]);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
