import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { Model } from "@mariozechner/pi-ai";
import { piToolFieldsFromDescriptor, pluginInstallToolDescriptor } from "./mcpAutowireDesktopToolsFacade";
import {
  type McpAutowirePlanInput,
  type McpAutowirePlanResult,
  type McpAutowirePlannerOptions,
} from "./mcpAutowirePlanner";
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
import type { McpCustomSourceBuildCommandRunner } from "./mcpAutowireMcpInstallFacade";
import type { McpAutowireCandidateRefStore } from "./mcpAutowireCandidateRefs";
import { createMcpAutowirePlanToolDefinition } from "./mcpAutowirePiPlanTool";
import { createMcpAutowireSourceBuildPiToolDefinitions } from "./mcpAutowireSourceBuildPiTools";
import {
  arrayInput,
  objectInput,
  optionalNumber,
  optionalString,
  requiredString,
  toolResult,
} from "./mcpAutowirePiToolSupport";

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

export function createMcpAutowirePiToolDefinitions(options: McpAutowirePiToolOptions): ToolDefinition<any, any, any>[] {
  const review = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_autowire_review"));
  const evidenceRead = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_autowire_evidence_read"));
  const revisionList = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_autowire_plan_revision_list"));
  const revisionRead = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_autowire_plan_revision_read"));
  const editDescribe = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_autowire_plan_edit_describe"));
  const editApply = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_autowire_plan_edit_apply"));
  return [
    createMcpAutowirePlanToolDefinition(options),
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
    ...createMcpAutowireSourceBuildPiToolDefinitions(options),
  ];
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
