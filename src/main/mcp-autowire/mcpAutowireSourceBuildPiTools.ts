import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { piToolFieldsFromDescriptor, pluginInstallToolDescriptor } from "./mcpAutowireDesktopToolsFacade";
import type { McpAutowireCandidateRefStore } from "./mcpAutowireCandidateRefs";
import {
  createMcpCustomSourceBuildImage,
  describeMcpCustomSourceBuild,
  mcpCustomSourceBuildCreateText,
  mcpCustomSourceBuildDescribeText,
  mcpCustomSourceBuildReviewText,
  reviewMcpCustomSourceBuildPlan,
  type McpCustomSourceBuildCommandRunner,
} from "./mcpAutowireMcpInstallFacade";
import { objectInput, optionalString, requiredObject, toolResult } from "./mcpAutowirePiToolSupport";
import { validateMcpAutowireCandidate } from "./mcpAutowireSchemas";

export interface McpAutowireSourceBuildPiToolThread {
  id: string;
  collaborationMode: "agent" | "planner";
}

export interface McpAutowireSourceBuildPiToolOptions {
  getThread: () => McpAutowireSourceBuildPiToolThread;
  candidateRefs?: McpAutowireCandidateRefStore;
  sourceBuildUserDataPath?: string;
  sourceBuildCommandRunner?: McpCustomSourceBuildCommandRunner;
}

export function createMcpAutowireSourceBuildPiToolDefinitions(
  options: McpAutowireSourceBuildPiToolOptions,
): ToolDefinition<any, any, any>[] {
  const sourceBuildDescribe = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_autowire_source_build_describe"));
  const sourceBuildCreate = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_autowire_source_build_create"));
  const customSourceDescribe = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_autowire_custom_source_describe"));
  return [
    {
      ...sourceBuildDescribe,
      parameters: sourceBuildDescribe.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const thread = options.getThread();
        const input = objectInput(params);
        const { candidate, candidateRef } = candidateInput(options, input);
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
        const { candidate, candidateRef } = candidateInput(options, input);
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
        const { candidate, candidateRef } = candidateInput(options, input, true);
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

function candidateInput(
  options: McpAutowireSourceBuildPiToolOptions,
  input: Record<string, unknown>,
  staleSessionHint = false,
): { candidate: Record<string, unknown>; candidateRef?: string } {
  const candidateRef = optionalString(input.candidateRef);
  const candidate = candidateRef
    ? options.candidateRefs?.get(candidateRef)
    : input.candidate;
  if (candidateRef && (!candidate || typeof candidate !== "object" || Array.isArray(candidate))) {
    const recovery = staleSessionHint
      ? "The reference may be from an earlier or reset Pi session; rerun ambient_mcp_autowire_plan or pass the exact candidate JSON."
      : "Rerun ambient_mcp_autowire_plan or pass the exact candidate JSON.";
    throw new Error(`No MCP autowire candidate is available for candidateRef ${candidateRef}. ${recovery}`);
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("candidate or candidateRef is required.");
  return {
    candidate: candidate as Record<string, unknown>,
    ...(candidateRef ? { candidateRef } : {}),
  };
}
