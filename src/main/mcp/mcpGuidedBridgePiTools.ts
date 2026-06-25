import { piToolFieldsFromDescriptor, pluginInstallToolDescriptor } from "./mcpDesktopToolsFacade";
import {
  mcpGuidedLocalBridgeInstallReviewState,
  mcpGuidedLocalBridgePermissionProfile,
  mcpGuidedLocalBridgePreflightText,
  mcpGuidedLocalBridgePreviewText,
  mcpGuidedLocalBridgeSourceIdentity,
  mcpGuidedLocalBridgeWorkloadName,
  previewGuidedLocalBridge,
  runGuidedLocalBridgePreflight,
  type McpGuidedLocalBridgePreview,
} from "./mcpGuidedLocalBridge";
import type { McpSecretBinding } from "./mcpInstallCatalog";
import { storedMcpSecretBindingsForCandidate } from "./mcpSecretReferences";
import { isSecretReference } from "./mcpSecurityFacade";
import {
  errorMessage,
  installedServerForServerId,
  mcpToolDiscoveryNextAction,
  objectInput,
  optionalNumber,
  optionalString,
  requiredObject,
  secretBindingsInput,
  toolResult,
  type McpServerPiToolDefinition,
} from "./mcpServerPiToolSupport";
import type { McpServerPiToolOptions, McpServerPiToolWorkspace } from "./mcpServerPiToolTypes";
import { McpToolBridge, mcpToolDescriptorReviewText } from "./mcpToolBridge";

export function createMcpGuidedBridgePiToolDefinitions(options: McpServerPiToolOptions): McpServerPiToolDefinition[] {
  const guidedDescribe = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_guided_bridge_describe"));
  const guidedPreflight = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_guided_bridge_preflight"));
  const guidedRegister = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_guided_bridge_register"));
  return [
    {
      ...guidedDescribe,
      parameters: guidedDescribe.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const input = objectInput(params);
        const candidate = requiredObject(input, "candidate");
        const expectedCandidateHash = optionalString(input.expectedCandidateHash);
        const explicitSecretBindings = secretBindingsInput(input.secretBindings);
        onUpdate?.({
          content: [{ type: "text", text: "Building guided local bridge setup review." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_guided_bridge_describe",
            status: "reviewing",
          },
        });
        const { preview, secretBindings, secretReview } = await previewGuidedLocalBridgeWithStoredSecrets(options, {
          candidate,
          expectedCandidateHash,
          explicitSecretBindings,
        });
        const blocked = preview.hardBlockers.length || secretReview.blockers.length;
        return toolResult(mcpGuidedLocalBridgePreviewTextWithSecrets(preview, secretReview), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_guided_bridge_describe",
          status: blocked ? "blocked" : "guided-setup-required",
          serverId: preview.serverId,
          candidateId: preview.candidate.id,
          validationStatus: preview.validation.status,
          outcome: preview.validation.outcome,
          hardBlockerCount: preview.hardBlockers.length,
          secretBlockerCount: secretReview.blockers.length,
          secretBindingCount: secretBindings.length,
          missingRequiredSecrets: secretReview.missingRequiredEnvNames,
          warningCount: preview.warnings.length,
          setupCheckpointCount: preview.setupCheckpoints.length,
          bridgeBaseUrl: preview.bridge.bridgeBaseUrl,
          bridgeProbeUrl: preview.bridge.bridgeProbeUrl,
          upstreamAppUrl: preview.bridge.upstreamAppUrl,
          expectedTools: preview.bridge.expectedTools,
        });
      },
    },
    {
      ...guidedPreflight,
      parameters: guidedPreflight.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, signal, onUpdate) => {
        const thread = options.getThread();
        if (thread.collaborationMode === "planner") throw new Error("MCP guided local bridge preflight is blocked in Planner Mode.");
        const input = objectInput(params);
        const candidate = requiredObject(input, "candidate");
        const expectedCandidateHash = optionalString(input.expectedCandidateHash);
        const timeoutMs = optionalNumber(input.timeoutMs);
        const preview = previewGuidedLocalBridge({ candidate, expectedCandidateHash });
        if (preview.hardBlockers.length) {
          return toolResult(mcpGuidedLocalBridgePreviewText(preview), {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_guided_bridge_preflight",
            status: "blocked",
            serverId: preview.serverId,
            hardBlockerCount: preview.hardBlockers.length,
          });
        }

        const detail = mcpGuidedLocalBridgePreflightApprovalDetail({ preview, workspace: options.workspace });
        const allowed = await (options.authorizeGuidedLocalBridgePreflight?.({ thread, workspace: options.workspace, preview, detail }) ??
          true);
        if (!allowed) throw new Error("MCP guided local bridge preflight blocked by Ambient Desktop approval prompt.");

        onUpdate?.({
          content: [{ type: "text", text: `Checking guided local bridge endpoints for ${preview.candidate.displayName}.` }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_guided_bridge_preflight",
            status: "preflight",
            serverId: preview.serverId,
            bridgeProbeUrl: preview.bridge.bridgeProbeUrl,
            upstreamAppUrl: preview.bridge.upstreamAppUrl,
          },
        });
        const result = await runGuidedLocalBridgePreflight({
          candidate,
          expectedCandidateHash,
          timeoutMs,
          signal,
          fetchImpl: options.guidedLocalBridgeFetchImpl,
        });
        return toolResult(mcpGuidedLocalBridgePreflightText(result), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_guided_bridge_preflight",
          status: result.status,
          serverId: result.preview.serverId,
          bridgeProbeUrl: result.preview.bridge.bridgeProbeUrl,
          upstreamAppUrl: result.preview.bridge.upstreamAppUrl,
          checks: result.checks,
        });
      },
    },
    {
      ...guidedRegister,
      parameters: guidedRegister.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, signal, onUpdate) => {
        const thread = options.getThread();
        if (thread.collaborationMode === "planner") throw new Error("MCP guided local bridge registration is blocked in Planner Mode.");
        const input = objectInput(params);
        const candidate = requiredObject(input, "candidate");
        const expectedCandidateHash = optionalString(input.expectedCandidateHash);
        const timeoutMs = optionalNumber(input.timeoutMs);
        const explicitSecretBindings = secretBindingsInput(input.secretBindings);
        const { preview, secretBindings, secretReview } = await previewGuidedLocalBridgeWithStoredSecrets(options, {
          candidate,
          expectedCandidateHash,
          explicitSecretBindings,
        });
        if (preview.hardBlockers.length || secretReview.blockers.length) {
          return toolResult(mcpGuidedLocalBridgePreviewTextWithSecrets(preview, secretReview), {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_guided_bridge_register",
            status: "blocked",
            serverId: preview.serverId,
            hardBlockerCount: preview.hardBlockers.length,
            secretBlockerCount: secretReview.blockers.length,
            secretBindingCount: secretBindings.length,
            missingRequiredSecrets: secretReview.missingRequiredEnvNames,
          });
        }

        const existing = await installedServerForServerId(options.toolHive, preview.serverId);
        if (existing) {
          return toolResult(
            `Guided local bridge ${preview.serverId} is already registered as ${existing.workloadName}. Use ambient_mcp_tool_search to refresh/discover tools.`,
            {
              runtime: "ambient-mcp",
              toolName: "ambient_mcp_guided_bridge_register",
              status: "already-registered",
              serverId: preview.serverId,
              workloadName: existing.workloadName,
            },
          );
        }

        const detail = mcpGuidedLocalBridgeRegisterApprovalDetail({ preview, workspace: options.workspace, secretBindings });
        const allowed = await (options.authorizeGuidedLocalBridgeRegister?.({ thread, workspace: options.workspace, preview, detail }) ??
          true);
        if (!allowed) throw new Error("MCP guided local bridge registration blocked by Ambient Desktop approval prompt.");

        onUpdate?.({
          content: [{ type: "text", text: `Re-checking guided local bridge endpoints for ${preview.candidate.displayName}.` }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_guided_bridge_register",
            status: "preflight",
            serverId: preview.serverId,
            bridgeProbeUrl: preview.bridge.bridgeProbeUrl,
          },
        });
        const preflight = await runGuidedLocalBridgePreflight({
          candidate,
          expectedCandidateHash,
          timeoutMs,
          signal,
          fetchImpl: options.guidedLocalBridgeFetchImpl,
        });
        if (preflight.status !== "ready") {
          return toolResult(mcpGuidedLocalBridgePreflightText(preflight), {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_guided_bridge_register",
            status: preflight.status,
            serverId: preview.serverId,
            checks: preflight.checks,
          });
        }

        const workloadName = mcpGuidedLocalBridgeWorkloadName(preview.serverId);
        const state = await options.toolHive.registerGuidedLocalBridge({
          serverId: preview.serverId,
          workloadName,
          endpoint: preview.bridge.bridgeProbeUrl,
          registrySource: "guided-local-bridge",
          sourceIdentity: mcpGuidedLocalBridgeSourceIdentity(preview),
          installReview: mcpGuidedLocalBridgeInstallReviewState(preview, new Date().toISOString()),
          secretBindings,
          permissionProfile: mcpGuidedLocalBridgePermissionProfile(preview),
        });

        onUpdate?.({
          content: [{ type: "text", text: `Discovering harmless MCP tool descriptors for ${preview.candidate.displayName}.` }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_guided_bridge_register",
            status: "discovering-tools",
            serverId: preview.serverId,
            workloadName,
          },
        });
        try {
          const bridge = new McpToolBridge({
            catalog: options.catalog,
            toolHive: options.toolHive,
            workspacePath: options.workspace.path,
            fetchImpl: options.guidedLocalBridgeFetchImpl,
          });
          const review = await bridge.reviewToolDescriptors({ serverId: preview.serverId, workloadName, refresh: true, signal });
          await options.toolHive.updateInstalledServerInstallValidation({ workloadName, status: "ready" });
          return toolResult(
            mcpGuidedLocalBridgeRegisterResultText(preview, state.workloadName, review.tools.length, mcpToolDescriptorReviewText(review)),
            {
              runtime: "ambient-mcp",
              toolName: "ambient_mcp_guided_bridge_register",
              status: "ready",
              serverId: preview.serverId,
              workloadName,
              endpoint: preview.bridge.bridgeProbeUrl,
              installValidationStatus: "ready",
              toolCount: review.tools.length,
              descriptorHash: review.descriptorHash,
              reviewStatus: review.reviewStatus,
              secretBindingCount: secretBindings.length,
            },
          );
        } catch (error) {
          const message = errorMessage(error);
          await options.toolHive.updateInstalledServerInstallValidation({ workloadName, status: "validation_failed", error: message });
          return toolResult(
            [
              `Registered guided local bridge ${preview.serverId} as ${workloadName}, but tool descriptor discovery failed.`,
              `Endpoint: ${preview.bridge.bridgeProbeUrl}`,
              `Discovery error: ${message}`,
              "Next: verify the user-run bridge is still running and rerun ambient_mcp_tool_search or ambient_mcp_guided_bridge_register after setup is fixed.",
            ].join("\n"),
            {
              runtime: "ambient-mcp",
              toolName: "ambient_mcp_guided_bridge_register",
              status: "validation_failed",
              serverId: preview.serverId,
              workloadName,
              endpoint: preview.bridge.bridgeProbeUrl,
              installValidationStatus: "validation_failed",
              error: message,
            },
          );
        }
      },
    },
  ];
}

export function mcpGuidedLocalBridgePreflightApprovalDetail(input: {
  preview: McpGuidedLocalBridgePreview;
  workspace: McpServerPiToolWorkspace;
}): string {
  return [
    mcpGuidedLocalBridgePreviewText(input.preview),
    "",
    "Approval context:",
    `- Workspace: ${input.workspace.path}`,
    `- Action: perform bounded GET requests only to ${input.preview.bridge.bridgeProbeUrl}${input.preview.bridge.upstreamAppUrl ? ` and ${input.preview.bridge.upstreamAppUrl}` : ""}.`,
    "- No local software will be installed, launched, modified, or stopped.",
    "- No bridge tools will be called by this preflight.",
  ].join("\n");
}

export function mcpGuidedLocalBridgeRegisterApprovalDetail(input: {
  preview: McpGuidedLocalBridgePreview;
  workspace: McpServerPiToolWorkspace;
  secretBindings?: McpSecretBinding[];
}): string {
  const secretBindings = input.secretBindings ?? [];
  return [
    mcpGuidedLocalBridgePreviewText(input.preview),
    "",
    "Approval context:",
    `- Workspace: ${input.workspace.path}`,
    `- Action: re-check ${input.preview.bridge.bridgeProbeUrl}${input.preview.bridge.upstreamAppUrl ? ` and ${input.preview.bridge.upstreamAppUrl}` : ""}, register this bridge in global Ambient MCP state, then call MCP tools/list for descriptor discovery.`,
    secretBindings.length
      ? `- Secret refs: record approved Ambient secret refs for ${secretBindings.map((binding) => binding.envName).join(", ")}. Values are not shown, logged, or passed to Pi.`
      : "- Secret refs: none bound.",
    "- No local software will be installed, launched, modified, or stopped.",
    "- No non-discovery MCP tools will be called by registration.",
    "- Later MCP tool calls still go through ambient_mcp_tool_call approval and schema validation.",
  ].join("\n");
}

function mcpGuidedLocalBridgeRegisterResultText(
  preview: McpGuidedLocalBridgePreview,
  workloadName: string,
  toolCount: number,
  descriptorReviewText: string,
): string {
  return [
    `Registered guided local bridge ${preview.serverId}.`,
    `Workload: ${workloadName}`,
    `Endpoint: ${preview.bridge.bridgeProbeUrl}`,
    `Discovered tools: ${toolCount}`,
    "Ambient did not install, launch, modify, or stop local software.",
    "",
    descriptorReviewText,
    "",
    mcpToolDiscoveryNextAction(preview.serverId, workloadName),
  ].join("\n");
}

interface GuidedLocalBridgeSecretReview {
  blockers: string[];
  warnings: string[];
  missingRequiredEnvNames: string[];
  boundEnvNames: string[];
}

async function previewGuidedLocalBridgeWithStoredSecrets(
  options: Pick<McpServerPiToolOptions, "workspace">,
  input: { candidate: Record<string, unknown>; expectedCandidateHash?: string; explicitSecretBindings: McpSecretBinding[] },
) {
  const preview = previewGuidedLocalBridge({
    candidate: input.candidate,
    expectedCandidateHash: input.expectedCandidateHash,
  });
  const secretBindings = await storedMcpSecretBindingsForCandidate(options.workspace.path, preview.candidate, input.explicitSecretBindings);
  return {
    preview,
    secretBindings,
    secretReview: guidedLocalBridgeSecretReview(preview, secretBindings),
  };
}

function guidedLocalBridgeSecretReview(
  preview: McpGuidedLocalBridgePreview,
  secretBindings: McpSecretBinding[],
): GuidedLocalBridgeSecretReview {
  const declaredSecretNames = new Set(preview.candidate.secrets.map((secret) => secret.name));
  const boundEnvNames = secretBindings.map((binding) => binding.envName);
  const boundEnvNameSet = new Set(boundEnvNames);
  const missingRequired = preview.candidate.secrets.filter((secret) => secret.required && !boundEnvNameSet.has(secret.name));
  const unknown = secretBindings.filter((binding) => !declaredSecretNames.has(binding.envName));
  const duplicateEnvNames = [...new Set(boundEnvNames.filter((envName, index) => boundEnvNames.indexOf(envName) !== index))];
  const invalid = secretBindings.filter((binding) => !isSecretReference(binding.secretRef.trim()));
  const blockers = [
    ...missingRequired.map(
      (secret) =>
        `Required guided-local secret ${secret.name} must be captured with ambient_mcp_secret_request before registration; never ask for the value in chat, terminal commands, or bridge scripts.`,
    ),
    ...unknown.map((binding) => `Secret binding ${binding.envName} is not declared by guided-local bridge metadata.`),
    ...duplicateEnvNames.map((envName) => `Secret binding ${envName} is duplicated.`),
    ...invalid.map((binding) => `Secret binding ${binding.envName} must use an Ambient-managed secret reference.`),
  ];
  const warnings = preview.candidate.secrets
    .filter((secret) => !secret.required && !boundEnvNameSet.has(secret.name))
    .map(
      (secret) =>
        `Optional guided-local secret ${secret.name} is not bound; registration can proceed, but the user-run bridge may have reduced functionality.`,
    );
  return {
    blockers,
    warnings,
    missingRequiredEnvNames: missingRequired.map((secret) => secret.name),
    boundEnvNames: [...new Set(boundEnvNames)],
  };
}

function mcpGuidedLocalBridgePreviewTextWithSecrets(
  preview: McpGuidedLocalBridgePreview,
  secretReview: GuidedLocalBridgeSecretReview,
): string {
  const declared = preview.candidate.secrets.length
    ? preview.candidate.secrets.map((secret) => `${secret.required ? "Required" : "Optional"} ${secret.name}`).join(", ")
    : "none declared";
  const bound = secretReview.boundEnvNames.length ? secretReview.boundEnvNames.join(", ") : "none";
  return [
    mcpGuidedLocalBridgePreviewText(preview),
    "",
    "Secret bindings:",
    `- Declared: ${declared}.`,
    `- Bound Ambient refs: ${bound}. Values are not shown and are not passed to Pi.`,
    secretReview.blockers.length
      ? `Secret blockers:\n${secretReview.blockers.map((item) => `- ${item}`).join("\n")}`
      : "Secret blockers: none.",
    secretReview.warnings.length
      ? `Secret warnings:\n${secretReview.warnings.map((item) => `- ${item}`).join("\n")}`
      : "Secret warnings: none.",
  ].join("\n");
}
