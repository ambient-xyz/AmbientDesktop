import type { ContainerRuntimeImagePullResult, ContainerRuntimeProbeResult, OciImageResolution, PullContainerRuntimeImageInput } from "./mcpContainerRuntimeFacade";
import type { McpAutowirePlanRevisionStore, McpAutowireRuntimeRepairDescribeResult } from "./mcpAutowireFacade";
import type { McpDefaultCapabilityInstallPreview, McpInstallCatalog, McpInstallPreview, McpInstalledServerSummary } from "./mcpInstallCatalog";
import type { McpGuidedLocalBridgePreview } from "./mcpGuidedLocalBridge";
import type { McpInstallGateResult } from "./mcpInstallGate";
import type { FetchLike } from "./mcpToolBridge";
import type { ToolHiveCommandResult, ToolHiveRuntimeService } from "./mcpToolRuntimeFacade";

export interface McpServerPiToolThread {
  id: string;
  collaborationMode: "agent" | "planner";
  permissionMode: string;
}

export interface McpServerPiToolWorkspace {
  path: string;
  name?: string;
}

export type McpServerInstallPreviewForApproval = McpInstallPreview | McpDefaultCapabilityInstallPreview;

export interface McpServerInstallApprovalInput {
  thread: McpServerPiToolThread;
  workspace: McpServerPiToolWorkspace;
  preview: McpServerInstallPreviewForApproval;
  preflight: ToolHiveCommandResult;
  detail: string;
}

export interface McpServerUninstallApprovalInput {
  thread: McpServerPiToolThread;
  workspace: McpServerPiToolWorkspace;
  server: McpInstalledServerSummary;
  detail: string;
}

export interface McpGuidedLocalBridgePreflightApprovalInput {
  thread: McpServerPiToolThread;
  workspace: McpServerPiToolWorkspace;
  preview: McpGuidedLocalBridgePreview;
  detail: string;
}

export interface McpGuidedLocalBridgeRegisterApprovalInput {
  thread: McpServerPiToolThread;
  workspace: McpServerPiToolWorkspace;
  preview: McpGuidedLocalBridgePreview;
  detail: string;
}

export interface McpRuntimeRepairApprovalInput {
  thread: McpServerPiToolThread;
  workspace: McpServerPiToolWorkspace;
  preview: McpAutowireRuntimeRepairDescribeResult;
  detail: string;
}

export interface McpServerPiToolOptions {
  catalog: McpInstallCatalog;
  toolHive: ToolHiveRuntimeService;
  getThread: () => McpServerPiToolThread;
  workspace: McpServerPiToolWorkspace;
  authorizeInstall?: (input: McpServerInstallApprovalInput) => Promise<boolean> | boolean;
  authorizeUninstall?: (input: McpServerUninstallApprovalInput) => Promise<boolean> | boolean;
  authorizeGuidedLocalBridgePreflight?: (input: McpGuidedLocalBridgePreflightApprovalInput) => Promise<boolean> | boolean;
  authorizeGuidedLocalBridgeRegister?: (input: McpGuidedLocalBridgeRegisterApprovalInput) => Promise<boolean> | boolean;
  guidedLocalBridgeFetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  mcpToolFetchImpl?: FetchLike;
  resolveCandidateRef?: (candidateRef: string) => Promise<Record<string, unknown> | undefined> | Record<string, unknown> | undefined;
  containerRuntimeProbe?: () => Promise<ContainerRuntimeProbeResult>;
  installGate?: () => Promise<McpInstallGateResult>;
  defaultCapabilityImageResolver?: (input: { image: string; platform?: NodeJS.Platform | string; arch?: NodeJS.Architecture | string; fetchImpl?: typeof fetch }) => Promise<OciImageResolution>;
  defaultCapabilityImagePuller?: (input: PullContainerRuntimeImageInput) => Promise<ContainerRuntimeImagePullResult>;
  onContainerRuntimeSetupNeeded?: (input: { capabilityId?: "scrapling"; serverId?: string; reason: string }) => void;
  requestMcpSecret?: (input: { serverId?: string; candidateId?: string; candidateRef?: string; displayName?: string; envName: string }) => void;
  planRevisions?: McpAutowirePlanRevisionStore;
  putCandidateRef?: (candidate: Record<string, unknown>, candidateHash?: string) => string | undefined;
  authorizeRuntimeRepair?: (input: McpRuntimeRepairApprovalInput) => Promise<boolean> | boolean;
}
