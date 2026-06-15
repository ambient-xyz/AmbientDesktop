import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  DesktopEvent,
  PermissionGrantScopeKind,
  PermissionRisk,
  ThreadSummary,
  WorkspaceState,
} from "../shared/types";
import {
  type CapabilityBuilderApplyRepairInput,
  type CapabilityBuilderHistoryInput,
  type CapabilityBuilderInstallDepsInput,
  type CapabilityBuilderListFilesInput,
  type CapabilityBuilderPreviewInput,
  type CapabilityBuilderReadFileInput,
  type CapabilityBuilderRegisterInput,
  type CapabilityBuilderRegisteredVoiceProvider,
  type CapabilityBuilderRepairPlanInput,
  type CapabilityBuilderRemovalPlanInput,
  type CapabilityBuilderScaffoldInput,
  type CapabilityBuilderUnregisterInput,
  type CapabilityBuilderUpdatePlanInput,
  type CapabilityBuilderValidateInput,
  type CapabilityBuilderValidateResult,
  type CapabilityBuilderWriteFileInput,
} from "./capabilityBuilder";
import { registerCapabilityBuilderApplyRepairTool } from "./agentRuntimeCapabilityBuilderApplyRepairTools";
import { registerCapabilityBuilderHistoryTool } from "./agentRuntimeCapabilityBuilderHistoryTools";
import { registerCapabilityBuilderInspectionTools } from "./agentRuntimeCapabilityBuilderInspectionTools";
import { registerCapabilityBuilderInstallDepsTool } from "./agentRuntimeCapabilityBuilderInstallDepsTools";
import {
  registerCapabilityBuilderPlanTool,
  type CapabilityBuilderPlanRoutePreflightContext,
  type CapabilityBuilderPlanRoutePreflightResult,
  type CapabilityBuilderPlanToolInput,
} from "./agentRuntimeCapabilityBuilderPlanTools";
import { registerCapabilityBuilderRegisterTool } from "./agentRuntimeCapabilityBuilderRegisterTools";
import { registerCapabilityBuilderRepairPlanTool } from "./agentRuntimeCapabilityBuilderRepairPlanTools";
import { registerCapabilityBuilderRemovalPlanTool } from "./agentRuntimeCapabilityBuilderRemovalPlanTools";
import { registerCapabilityBuilderScaffoldTool } from "./agentRuntimeCapabilityBuilderScaffoldTools";
import {
  registerCapabilityBuilderSecretRequestTool,
  type CapabilityBuilderSecretRequestInput,
} from "./agentRuntimeCapabilityBuilderSecretRequestTools";
import { registerCapabilityBuilderUnregisterTool } from "./agentRuntimeCapabilityBuilderUnregisterTools";
import { registerCapabilityBuilderUpdatePlanTool } from "./agentRuntimeCapabilityBuilderUpdatePlanTools";
import { registerCapabilityBuilderValidateTool } from "./agentRuntimeCapabilityBuilderValidateTools";
import { registerCapabilityBuilderWriteFileTool } from "./agentRuntimeCapabilityBuilderWriteFileTools";
import type { AmbientInstallRoutePlan } from "./installRoutePlanner";

export interface AgentRuntimeCapabilityBuilderPermissionRequest {
  thread: ThreadSummary;
  workspace: WorkspaceState;
  toolName: string;
  title: string;
  message: string;
  detail: string;
  risk?: PermissionRisk;
  reusableScopes?: PermissionGrantScopeKind[];
  grantTargetLabel: string;
  grantTargetIdentity?: string;
  grantConditions?: Record<string, unknown>;
  requireFreshPrompt?: boolean;
  allowedReason: string;
  deniedReason: string;
}

export interface AgentRuntimeCapabilityBuilderValidationRunInput {
  thread: ThreadSummary;
  workspace: WorkspaceState;
  input: CapabilityBuilderValidateInput;
  onUpdate?: (update: {
    content: Array<{ type: "text"; text: string }>;
    details: Record<string, unknown>;
  }) => void;
  reason?: "privileged-action-succeeded";
}

export interface AgentRuntimeCapabilityBuilderVoiceCompletion {
  text: string;
  details: Record<string, unknown>;
}

export interface AgentRuntimeCapabilityBuilderToolOptions<TPlanInput extends CapabilityBuilderPlanToolInput> {
  workspace: WorkspaceState;
  getThread: () => ThreadSummary;
  parsePlanInput: (params: Record<string, unknown>) => TPlanInput;
  planText: (input: TPlanInput) => string;
  routePreflight: (
    input: TPlanInput,
    context: CapabilityBuilderPlanRoutePreflightContext,
  ) => CapabilityBuilderPlanRoutePreflightResult | undefined;
  latestInstallRouteLane: () => AmbientInstallRoutePlan["lane"] | undefined;
  mcpAutowirePlanned: () => boolean;
  parseScaffoldInput: (params: Record<string, unknown>) => CapabilityBuilderScaffoldInput;
  suggestedCapabilityPackageName: (goal: string, provider: string | undefined) => string;
  parsePreviewInput: (params: Record<string, unknown>) => CapabilityBuilderPreviewInput;
  parseListFilesInput: (params: Record<string, unknown>) => CapabilityBuilderListFilesInput;
  parseReadFileInput: (params: Record<string, unknown>) => CapabilityBuilderReadFileInput;
  parseWriteFileInput: (params: Record<string, unknown>) => CapabilityBuilderWriteFileInput;
  parseSecretRequestInput: (params: Record<string, unknown>) => CapabilityBuilderSecretRequestInput;
  parseHistoryInput: (params: Record<string, unknown>) => CapabilityBuilderHistoryInput;
  parseUpdatePlanInput: (params: Record<string, unknown>) => CapabilityBuilderUpdatePlanInput;
  parseRepairPlanInput: (params: Record<string, unknown>) => CapabilityBuilderRepairPlanInput;
  parseApplyRepairInput: (params: Record<string, unknown>) => CapabilityBuilderApplyRepairInput;
  parseRemovalPlanInput: (params: Record<string, unknown>) => CapabilityBuilderRemovalPlanInput;
  parseUnregisterInput: (params: Record<string, unknown>) => CapabilityBuilderUnregisterInput;
  parseInstallDepsInput: (params: Record<string, unknown>) => CapabilityBuilderInstallDepsInput;
  parseValidateInput: (params: Record<string, unknown>) => CapabilityBuilderValidateInput;
  runCapabilityBuilderValidationWithPermission: (
    input: AgentRuntimeCapabilityBuilderValidationRunInput,
  ) => Promise<CapabilityBuilderValidateResult> | CapabilityBuilderValidateResult;
  parseRegisterInput: (params: Record<string, unknown>) => CapabilityBuilderRegisterInput;
  completeRegisteredVoiceProviderSetup: (
    thread: ThreadSummary,
    workspace: WorkspaceState,
    provider: CapabilityBuilderRegisteredVoiceProvider,
  ) => Promise<AgentRuntimeCapabilityBuilderVoiceCompletion> | AgentRuntimeCapabilityBuilderVoiceCompletion;
  resolveFirstPartyPluginPermission: (
    input: AgentRuntimeCapabilityBuilderPermissionRequest,
  ) => Promise<boolean> | boolean;
  markPluginToolsStale: () => void;
  emitDesktopEvent: (event: DesktopEvent) => void;
}

export function registerAgentRuntimeCapabilityBuilderTools<TPlanInput extends CapabilityBuilderPlanToolInput>(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AgentRuntimeCapabilityBuilderToolOptions<TPlanInput>,
): void {
  registerCapabilityBuilderPlanTool(pi, {
    parsePlanInput: options.parsePlanInput,
    planText: options.planText,
    routePreflight: options.routePreflight,
    latestInstallRouteLane: options.latestInstallRouteLane,
    mcpAutowirePlanned: options.mcpAutowirePlanned,
  });

  registerCapabilityBuilderScaffoldTool(pi, {
    workspace: options.workspace,
    getThread: options.getThread,
    parseScaffoldInput: options.parseScaffoldInput,
    suggestedCapabilityPackageName: options.suggestedCapabilityPackageName,
    resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
    markPluginToolsStale: options.markPluginToolsStale,
  });

  registerCapabilityBuilderInspectionTools(pi, {
    workspace: options.workspace,
    parsePreviewInput: options.parsePreviewInput,
    parseListFilesInput: options.parseListFilesInput,
    parseReadFileInput: options.parseReadFileInput,
  });

  registerCapabilityBuilderWriteFileTool(pi, {
    workspace: options.workspace,
    getThread: options.getThread,
    parseWriteFileInput: options.parseWriteFileInput,
    resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
    markPluginToolsStale: options.markPluginToolsStale,
  });

  registerCapabilityBuilderSecretRequestTool(pi, {
    workspace: options.workspace,
    parseSecretRequestInput: options.parseSecretRequestInput,
    emitDesktopEvent: options.emitDesktopEvent,
  });

  registerCapabilityBuilderHistoryTool(pi, {
    workspace: options.workspace,
    parseHistoryInput: options.parseHistoryInput,
  });

  registerCapabilityBuilderUpdatePlanTool(pi, {
    workspace: options.workspace,
    parseUpdatePlanInput: options.parseUpdatePlanInput,
  });

  registerCapabilityBuilderRepairPlanTool(pi, {
    workspace: options.workspace,
    parseRepairPlanInput: options.parseRepairPlanInput,
  });

  registerCapabilityBuilderApplyRepairTool(pi, {
    workspace: options.workspace,
    getThread: options.getThread,
    parseApplyRepairInput: options.parseApplyRepairInput,
    resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
  });

  registerCapabilityBuilderRemovalPlanTool(pi, {
    workspace: options.workspace,
    parseRemovalPlanInput: options.parseRemovalPlanInput,
  });

  registerCapabilityBuilderUnregisterTool(pi, {
    workspace: options.workspace,
    getThread: options.getThread,
    parseUnregisterInput: options.parseUnregisterInput,
    resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
    markPluginToolsStale: options.markPluginToolsStale,
  });

  registerCapabilityBuilderInstallDepsTool(pi, {
    workspace: options.workspace,
    getThread: options.getThread,
    parseInstallDepsInput: options.parseInstallDepsInput,
    resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
  });

  registerCapabilityBuilderValidateTool(pi, {
    workspace: options.workspace,
    getThread: options.getThread,
    parseValidateInput: options.parseValidateInput,
    runCapabilityBuilderValidationWithPermission: options.runCapabilityBuilderValidationWithPermission,
  });

  registerCapabilityBuilderRegisterTool(pi, {
    workspace: options.workspace,
    getThread: options.getThread,
    parseRegisterInput: options.parseRegisterInput,
    completeRegisteredVoiceProviderSetup: options.completeRegisteredVoiceProviderSetup,
    resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
    markPluginToolsStale: options.markPluginToolsStale,
  });
}
