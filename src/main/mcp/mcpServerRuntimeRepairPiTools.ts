import type { AgentToolResult, ToolDefinition } from "@mariozechner/pi-coding-agent";
import {
  applyMcpAutowirePlanEdit,
  backfillMcpAutowirePlanRevisionFromInstalledServer,
  describeMcpAutowireRuntimeRepair,
  mcpAutowireRuntimeRepairText,
  type McpAutowirePlanRevision,
} from "./mcpAutowireFacade";
import { piToolFieldsFromDescriptor, pluginInstallToolDescriptor } from "./mcpDesktopToolsFacade";
import type { McpServerPiToolOptions } from "./mcpServerPiToolTypes";
import type { ToolHiveInstalledServerState } from "./mcpToolRuntimeFacade";

export function createMcpServerRuntimeRepairPiToolDefinitions(options: McpServerPiToolOptions): ToolDefinition<any, any, any>[] {
  const runtimeRepairDescribe = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_runtime_repair_describe"));
  const runtimeRepairApply = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_runtime_repair_apply"));
  return [
    {
      ...runtimeRepairDescribe,
      parameters: runtimeRepairDescribe.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const input = objectInput(params);
        const thread = options.getThread();
        onUpdate?.({
          content: [{ type: "text", text: "Previewing MCP runtime repair from diagnostics." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_runtime_repair_describe",
            status: "previewing",
            threadId: thread.id,
            collaborationMode: thread.collaborationMode,
          },
        });
        const candidateResolution = await runtimeRepairCandidateInput(options, input);
        const result = describeMcpAutowireRuntimeRepair({
          candidate: candidateResolution.candidate,
          candidateRef: candidateResolution.candidateRef,
          parentRevisionId: candidateResolution.parentRevisionId,
          expectedCandidateHash: optionalString(input.expectedCandidateHash) ?? candidateResolution.expectedCandidateHash,
          serverId: candidateResolution.serverId,
          workloadName: candidateResolution.workloadName,
          failureText: optionalString(input.failureText),
          logText: optionalString(input.logText) ?? candidateResolution.installedValidationError,
          reason: optionalString(input.reason),
        });
        return toolResult(mcpAutowireRuntimeRepairText(result), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_runtime_repair_describe",
          status: result.status,
          serverId: result.serverId,
          workloadName: result.workloadName,
          candidateRef: result.candidateRef,
          parentRevisionId: result.parentRevisionId,
          backfilledRevisionId: candidateResolution.backfilledRevisionId,
          operationCount: result.operations.length,
          operations: result.operations,
          detectedIssues: result.detectedIssues,
          editStatus: result.editPreview?.status,
          editedCandidateHash: result.editPreview?.editedCandidateHash,
          permissionExpanding: result.editPreview?.permissionExpanding,
          nextToolName: result.editPreview?.nextToolName,
          nextToolInput: result.editPreview?.nextToolInput,
        });
      },
    },
    {
      ...runtimeRepairApply,
      parameters: runtimeRepairApply.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const input = objectInput(params);
        const thread = options.getThread();
        onUpdate?.({
          content: [{ type: "text", text: "Previewing MCP runtime repair before approval." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_runtime_repair_apply",
            status: "previewing",
            threadId: thread.id,
            collaborationMode: thread.collaborationMode,
          },
        });
        const candidateResolution = await runtimeRepairCandidateInput(options, input);
        const preview = describeMcpAutowireRuntimeRepair({
          candidate: candidateResolution.candidate,
          candidateRef: candidateResolution.candidateRef,
          parentRevisionId: candidateResolution.parentRevisionId,
          expectedCandidateHash: optionalString(input.expectedCandidateHash) ?? candidateResolution.expectedCandidateHash,
          serverId: candidateResolution.serverId,
          workloadName: candidateResolution.workloadName,
          failureText: optionalString(input.failureText),
          logText: optionalString(input.logText) ?? candidateResolution.installedValidationError,
          reason: optionalString(input.reason),
        });
        if (!preview.editPreview) {
          return toolResult(mcpAutowireRuntimeRepairText(preview), {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_runtime_repair_apply",
            status: preview.status,
            serverId: preview.serverId,
            workloadName: preview.workloadName,
            backfilledRevisionId: candidateResolution.backfilledRevisionId,
            operationCount: 0,
            detectedIssues: preview.detectedIssues,
          });
        }
        const detail = mcpAutowireRuntimeRepairText(preview);
        const allowed = await (options.authorizeRuntimeRepair?.({ thread, workspace: options.workspace, preview, detail }) ?? true);
        if (!allowed) throw new Error("MCP runtime repair blocked by Ambient Desktop approval prompt.");
        const applyResult = applyMcpAutowirePlanEdit({
          describeResult: preview.editPreview,
          store: options.planRevisions,
          putCandidateRef: (candidate, candidateHash) => options.putCandidateRef?.(candidate, candidateHash),
        });
        if (applyResult.revision && (preview.serverId || preview.workloadName)) {
          options.planRevisions?.recordCandidate({
            candidate: applyResult.editedCandidate ?? preview.editPreview.editedCandidate!,
            source: "runtime-repair",
            summary: optionalString(input.reason) ?? "Applied typed MCP runtime repair plan.",
            candidateRef: applyResult.candidateRef,
            parentRevisionId: applyResult.revision.revisionId,
            serverId: preview.serverId,
            workloadName: preview.workloadName,
            edit: {
              reason: optionalString(input.reason),
              operations: applyResult.operations,
              permissionExpanding: applyResult.permissionExpanding,
              approvalReasons: applyResult.approvalReasons,
            },
          });
        }
        const result = {
          ...preview,
          candidateRef: applyResult.candidateRef,
          applyResult,
        };
        const directRepairInstallHandoff = applyResult.candidateRef
          ? {
              nextToolName: "ambient_mcp_standard_import_install" as const,
              nextToolInput: {
                candidateRef: applyResult.candidateRef,
                ...(applyResult.editedCandidateHash ? { expectedCandidateHash: applyResult.editedCandidateHash } : {}),
              },
            }
          : undefined;
        const resultText = [
          mcpAutowireRuntimeRepairText(result),
          preview.parentRevisionId ? [
            "",
            `Rollback target revision: ${preview.parentRevisionId}`,
            "If the repaired reinstall behaves unexpectedly, use this revision id as the audit target for a future managed rollback flow.",
          ].join("\n") : undefined,
          directRepairInstallHandoff
            ? [
                "",
                "Direct Standard MCP reinstall handoff:",
                `Next tool: ${directRepairInstallHandoff.nextToolName} ${JSON.stringify(directRepairInstallHandoff.nextToolInput)}`,
                "This uses the normal install approval and ToolHive runtime service; do not restart ToolHive or edit profiles directly.",
              ].join("\n")
            : undefined,
        ].filter(Boolean).join("\n");
        return toolResult(resultText, {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_runtime_repair_apply",
          status: applyResult.status,
          serverId: preview.serverId,
          workloadName: preview.workloadName,
          candidateRef: applyResult.candidateRef,
          revisionId: applyResult.revision?.revisionId,
          rollbackRevisionId: preview.parentRevisionId,
          backfilledRevisionId: candidateResolution.backfilledRevisionId,
          editedCandidateHash: applyResult.editedCandidateHash,
          permissionExpanding: applyResult.permissionExpanding,
          operationCount: applyResult.operations.length,
          detectedIssues: preview.detectedIssues,
          nextToolName: applyResult.nextToolName,
          nextToolInput: applyResult.nextToolInput,
          ...(directRepairInstallHandoff ? {
            directRepairNextToolName: directRepairInstallHandoff.nextToolName,
            directRepairNextToolInput: directRepairInstallHandoff.nextToolInput,
          } : {}),
        });
      },
    },
  ];
}

async function runtimeRepairCandidateInput(
  options: McpServerPiToolOptions,
  input: Record<string, unknown>,
): Promise<{
  candidate: Record<string, unknown>;
  candidateRef?: string;
  parentRevisionId?: string;
  expectedCandidateHash?: string;
  serverId?: string;
  workloadName?: string;
  installedValidationError?: string;
  backfilledRevisionId?: string;
}> {
  const revisionId = optionalString(input.revisionId);
  if (revisionId) {
    const revision = options.planRevisions?.read(revisionId);
    if (!revision) throw new Error(`No MCP autowire plan revision exists for ${revisionId}.`);
    return runtimeRepairCandidateFromRevision(revision, input);
  }

  const candidate = objectInput(input.candidate);
  if (Object.keys(candidate).length) {
    return {
      candidate,
      candidateRef: optionalString(input.candidateRef),
      expectedCandidateHash: optionalString(input.expectedCandidateHash),
      serverId: optionalString(input.serverId),
      workloadName: optionalString(input.workloadName),
    };
  }

  const candidateRef = optionalString(input.candidateRef);
  if (candidateRef) {
    const resolved = await options.resolveCandidateRef?.(candidateRef);
    const revision = options.planRevisions?.latestForCandidateRef(candidateRef);
    const candidateFromRef = resolved ?? revision?.candidate;
    if (!candidateFromRef || typeof candidateFromRef !== "object" || Array.isArray(candidateFromRef)) {
      throw new Error(`No MCP autowire candidate is available for candidateRef ${candidateRef}. Pass revisionId from ambient_mcp_autowire_plan_revision_list or rerun ambient_mcp_autowire_plan.`);
    }
    return {
      candidate: candidateFromRef as Record<string, unknown>,
      candidateRef,
      parentRevisionId: revision?.revisionId,
      expectedCandidateHash: optionalString(input.expectedCandidateHash) ?? revision?.candidateHash,
      serverId: optionalString(input.serverId) ?? revision?.serverId,
      workloadName: optionalString(input.workloadName) ?? revision?.workloadName,
    };
  }

  const serverId = optionalString(input.serverId);
  const workloadName = optionalString(input.workloadName);
  if (!serverId && !workloadName) throw new Error("runtime repair requires revisionId, candidateRef, candidate, serverId, or workloadName.");
  const state = await options.toolHive.readState();
  const matches = state.installedServers.filter((server) => {
    if (serverId && server.serverId !== serverId) return false;
    if (workloadName && server.workloadName !== workloadName) return false;
    return true;
  });
  if (!matches.length) throw new Error(`No Ambient-managed MCP installed server matches ${serverId ?? workloadName}.`);
  if (matches.length > 1) throw new Error("Multiple installed MCP servers matched runtime repair input; provide both serverId and workloadName.");
  const server = matches[0];
  const candidateHash = server.sourceIdentity?.candidateHash;
  const activeRevision = server.activeRevisionId ? options.planRevisions?.read(server.activeRevisionId) : undefined;
  const matchingActiveRevision = activeRevision && autowireRevisionMatchesInstalledServer(activeRevision, server) ? activeRevision : undefined;
  const revision = matchingActiveRevision ?? (candidateHash ? options.planRevisions?.latestForCandidateHash(candidateHash) : undefined);
  const effectiveRevision = revision ?? await backfillRuntimeRepairInstalledServerRevision(options, server);
  if (!effectiveRevision) {
    throw new Error(`Installed MCP server ${server.serverId} has no recorded Autowire candidate revision available for repair. Rerun ambient_mcp_autowire_plan for the original source, then use ambient_mcp_autowire_plan_edit_describe/apply.`);
  }
  return {
    ...runtimeRepairCandidateFromRevision(effectiveRevision, input),
    serverId: server.serverId,
    workloadName: server.workloadName,
    installedValidationError: server.installValidationError,
    ...(revision ? {} : { backfilledRevisionId: effectiveRevision.revisionId }),
  };
}

function autowireRevisionMatchesInstalledServer(
  revision: McpAutowirePlanRevision,
  server: ToolHiveInstalledServerState,
): boolean {
  if (revision.serverId && revision.serverId !== server.serverId) return false;
  if (revision.workloadName && revision.workloadName !== server.workloadName) return false;
  return true;
}

async function backfillRuntimeRepairInstalledServerRevision(
  options: McpServerPiToolOptions,
  server: ToolHiveInstalledServerState,
): Promise<McpAutowirePlanRevision | undefined> {
  if (!options.planRevisions) return undefined;
  const profile = await options.toolHive.readInstalledServerPermissionProfile(server.workloadName).catch(() => undefined);
  if (!profile) return undefined;
  if (!profile.sha256Verified) return undefined;
  return backfillMcpAutowirePlanRevisionFromInstalledServer({
    server: profile.server,
    permissionProfile: profile.profile,
    store: options.planRevisions,
    putCandidateRef: options.putCandidateRef,
  })?.revision;
}

function runtimeRepairCandidateFromRevision(
  revision: McpAutowirePlanRevision,
  input: Record<string, unknown>,
): {
  candidate: Record<string, unknown>;
  candidateRef?: string;
  parentRevisionId?: string;
  expectedCandidateHash?: string;
  serverId?: string;
  workloadName?: string;
} {
  return {
    candidate: revision.candidate as unknown as Record<string, unknown>,
    candidateRef: optionalString(input.candidateRef) ?? revision.candidateRef,
    parentRevisionId: revision.revisionId,
    expectedCandidateHash: optionalString(input.expectedCandidateHash) ?? revision.candidateHash,
    serverId: optionalString(input.serverId) ?? revision.serverId,
    workloadName: optionalString(input.workloadName) ?? revision.workloadName,
  };
}

function toolResult(text: string, details: Record<string, unknown>): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text }],
    details,
  };
}

function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
